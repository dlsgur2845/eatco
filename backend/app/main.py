import logging
import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import async_session, engine
from app.models.ingredient import Base
from app.models.ingredient_nutrition import IngredientNutrition  # noqa: F401 — register with Base.metadata
from app.models.cooking_log import CookingLog, CookingLogItem  # noqa: F401 — register with Base.metadata
from app.routers import auth, categories, cooking_logs, custom_recipes, dashboard, events, expenses, ingredients, notification_logs, notifications, recipes, scan, storage_guide
from app.seed import run_seed
from app.services.expiry_checker import check_and_create_expiry_notifications
from app.services.scheduled_notifier import scheduled_expiry_check

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 정의만 있고 호출된 적 없던 검증. 프로덕션에서 약한 키면 여기서 기동이 멈춘다.
    settings.validate_secret_key()

    async with engine.begin() as conn:
        from sqlalchemy import text
        # cooking-log v1 선행: 예전 모델이 values_callable 없이 enum 을 만들면
        # Python enum *name* (GRAM/MILLILITER/PIECE) 으로 라벨이 생성된다.
        # 현재 모델은 *value* (g/ml/piece) 를 기대하므로 라벨을 맞춰줘야 한다.
        #
        # 라벨만 rename 한다. 컬럼을 drop 하면 안 된다 —
        # 이전 구현은 ingredients.unit 과 cooking_log_items.unit 을 DROP 했는데
        # cooking_log_items.unit 은 재생성하는 코드가 없어서(create_all 은 기존
        # 테이블을 변경하지 않는다) 해당 테이블이 영구히 사용 불가가 된다.
        # RENAME VALUE 는 기존 행 데이터를 그대로 보존한다.
        for bad_label, good_label in (("GRAM", "g"), ("MILLILITER", "ml"), ("PIECE", "piece")):
            await conn.execute(text(f"""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                        WHERE t.typname = 'ingredientunit' AND e.enumlabel = '{bad_label}'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                        WHERE t.typname = 'ingredientunit' AND e.enumlabel = '{good_label}'
                    ) THEN
                        ALTER TYPE ingredientunit RENAME VALUE '{bad_label}' TO '{good_label}';
                    END IF;
                END $$;
            """))
        await conn.run_sync(Base.metadata.create_all)
        # master_id 컬럼 마이그레이션 (이미 있으면 무시)
        await conn.execute(text(
            "ALTER TABLE families ADD COLUMN IF NOT EXISTS master_id UUID"
        ))
        # 기존 가족의 master_id가 없으면 가장 오래된 멤버로 설정
        await conn.execute(text("""
            UPDATE families SET master_id = (
                SELECT id FROM users
                WHERE users.family_id = families.id
                ORDER BY users.created_at ASC
                LIMIT 1
            ) WHERE master_id IS NULL
        """))
        # notification_settings에 family_id 컬럼 추가 (이미 있으면 무시)
        await conn.execute(text(
            "ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id)"
        ))
        # notification_logs에 days_before 컬럼 추가 (이미 있으면 무시)
        await conn.execute(text(
            "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS days_before INTEGER"
        ))
        # cooking-log v1: ingredients 수량 정규화 컬럼 추가 (이미 있으면 무시)
        await conn.execute(text(
            "ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS amount_value DOUBLE PRECISION"
        ))
        # IngredientUnit enum 타입 (이미 있으면 무시)
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE ingredientunit AS ENUM ('g', 'ml', 'piece');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        """))
        await conn.execute(text(
            "ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit ingredientunit"
        ))
        # 음수 재고 방지
        await conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE ingredients ADD CONSTRAINT ck_ingredients_amount_nonneg
                    CHECK (amount_value IS NULL OR amount_value >= 0);
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        """))
        # 기존 quantity 문자열 데이터 마이그레이션 (idempotent: amount_value IS NULL 인 row 만)
        from app.services.quantity_parser import migrate_legacy_quantities
        await migrate_legacy_quantities(conn)
    async with async_session() as db:
        await run_seed(db)
    # 시작 시 소비기한 알림 체크
    async with async_session() as db:
        created = await check_and_create_expiry_notifications(db)
        if created:
            logger.info(f"시작 시 만료 알림 {len(created)}건 생성")

    # APScheduler: 15분 간격으로 만료 알림 체크 + 푸시 전송
    scheduler = AsyncIOScheduler()
    scheduler.add_job(scheduled_expiry_check, "interval", minutes=15, id="expiry_check")
    scheduler.start()
    logger.info("APScheduler 시작: 15분 간격 만료 알림 체크")

    yield

    scheduler.shutdown()
    logger.info("APScheduler 종료")


app = FastAPI(title="Eatco API", version="0.1.0", lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ingredients.router)
app.include_router(dashboard.router)
app.include_router(categories.router)
app.include_router(notifications.router)
app.include_router(notification_logs.router)
app.include_router(storage_guide.router)
app.include_router(scan.router)
app.include_router(events.router)
app.include_router(recipes.router)
app.include_router(expenses.router)
app.include_router(custom_recipes.router)
app.include_router(cooking_logs.router)


# 업로드 이미지 서빙
# 경로를 설정으로 뺀다. 예전에는 "/app/uploads" 를 import 시점에 makedirs 했는데,
# 컨테이너 밖(테스트/로컬)에서는 / 가 쓰기 불가라 app.main 을 import 조차 할 수 없었다.
UPLOAD_DIR = settings.upload_dir
try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
except OSError:  # pragma: no cover - 읽기 전용 FS (테스트 환경 등)
    logger.warning("업로드 디렉토리를 만들 수 없습니다: %s — /uploads 마운트를 건너뜁니다.", UPLOAD_DIR)


# AI 헬스체크 결과 캐시 — 폴링마다 실제 호출하면 쿼터가 샌다.
_ai_health_cache: dict[str, object] = {"checked_at": 0.0, "result": None}
_AI_HEALTH_TTL = 600  # 10분


@app.get("/api/health")
async def health_check():
    """실제 의존성을 확인한다.

    예전에는 정적 {"status":"ok"} 를 돌려줘서 DB 가 죽든 말든 healthy 로 보였다.
    컨테이너에 healthcheck 도 없어서 restart:unless-stopped 가 먹통 프로세스를
    그대로 살려두고 있었다.
    """
    from sqlalchemy import text as _text

    components: dict[str, str] = {}
    ok = True

    try:
        async with engine.connect() as conn:
            await conn.execute(_text("SELECT 1"))
        components["database"] = "ok"
    except Exception as exc:
        logger.error("헬스체크: DB 연결 실패: %s", exc)
        components["database"] = "error"
        ok = False

    components["gemini_key"] = "ok" if settings.gemini_api_key else "missing"
    components["vapid"] = "ok" if settings.vapid_private_key and settings.vapid_public_key else "missing"

    body = {"status": "ok" if ok else "degraded", "components": components}
    return JSONResponse(status_code=200 if ok else 503, content=body)


@app.get("/api/health/ai")
async def ai_health_check():
    """Gemini 가 실제로 응답하는지 확인 (10분 캐시).

    모델이 조용히 종료돼도 알아채지 못하던 게 이 프로젝트의 핵심 문제였다.
    설정 화면에서 이 값을 보여주면 '죽었는데 아무도 모름' 상태가 재발하지 않는다.
    """
    import time as _time

    from app.services import gemini

    now = _time.time()
    cached = _ai_health_cache.get("result")
    if cached is not None and now - float(_ai_health_cache["checked_at"]) < _AI_HEALTH_TTL:
        return cached

    result: dict[str, object]
    try:
        text = await gemini.generate(
            ["ok 라고만 답하세요."],
            models=settings.vision_models,
            temperature=0.0,
            timeout=15.0,
        )
        result = {"status": "ok", "models": settings.vision_models, "sample": text[:40]}
    except gemini.GeminiNotConfigured:
        result = {"status": "not_configured", "models": settings.vision_models}
    except gemini.GeminiError as exc:
        result = {"status": "error", "models": settings.vision_models, "detail": str(exc)}

    _ai_health_cache["checked_at"] = now
    _ai_health_cache["result"] = result
    return result
