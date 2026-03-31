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
from app.routers import auth, categories, custom_recipes, dashboard, events, expenses, ingredients, notification_logs, notifications, recipes, scan, storage_guide
from app.seed import run_seed
from app.services.expiry_checker import check_and_create_expiry_notifications
from app.services.scheduled_notifier import scheduled_expiry_check

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text
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


# 업로드 이미지 서빙
UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
