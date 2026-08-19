"""재료 칼로리 소스 체인: cache → 식약처 공공 API → Gemini fallback.

UC3 결정: 식약처 식품영양성분 DB 를 top 200 재료에 대해 선시드 + cache miss 시
실시간 조회. Gemini 는 최후 fallback.

캐시 layer 는 `ingredient_nutrition` 테이블. PK = normalized_name.
`source` 필드 값: "official" (식약처) | "user" (사용자 교정) | "gemini".
`user` 는 gemini/official 로 덮어쓸 수 없다.

동시성: 같은 normalized_name 에 대한 miss 가 concurrent 로 발생하면
asyncio.Lock single-flight 로 Gemini/공공 API 호출 1회만. ON CONFLICT 로 DB 레벨
race 도 방어.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ingredient import IngredientUnit
from app.models.ingredient_nutrition import IngredientNutrition
from app.services import gemini

logger = logging.getLogger(__name__)

# normalized_name → asyncio.Lock (process-local single-flight)
_locks: dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()


@dataclass
class NutritionData:
    kcal_per_100g: float | None
    kcal_per_100ml: float | None
    kcal_per_piece: float | None
    source: str  # "official" | "gemini" | "user" | "none"
    confidence: float


async def _get_lock(name: str) -> asyncio.Lock:
    async with _locks_guard:
        if name not in _locks:
            _locks[name] = asyncio.Lock()
        return _locks[name]


async def _fetch_from_public_api(normalized_name: str) -> NutritionData | None:
    """식약처 통합식품영양정보 API 호출 (공공데이터포털).

    API: https://www.data.go.kr/data/15100064/openapi.do
    반환 필드: NUTR_CONT1 (열량 kcal, 100g 기준)
    """
    if not settings.data_go_kr_api_key:
        return None
    try:
        import httpx

        url = (
            "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"
        )
        params = {
            "serviceKey": settings.data_go_kr_api_key,
            "FOOD_NM_KR": normalized_name,
            "type": "json",
            "numOfRows": "1",
            "pageNo": "1",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
        items = (
            data.get("body", {}).get("items")
            or data.get("response", {}).get("body", {}).get("items")
            or []
        )
        if not items:
            return None
        item = items[0] if isinstance(items, list) else items.get("item", {})
        if isinstance(item, list):
            item = item[0] if item else {}
        kcal_raw = item.get("NUTR_CONT1") or item.get("AMT_NUM1")
        if kcal_raw is None:
            return None
        try:
            kcal = float(kcal_raw)
        except (TypeError, ValueError):
            return None
        return NutritionData(
            kcal_per_100g=kcal,
            kcal_per_100ml=None,
            kcal_per_piece=None,
            source="official",
            confidence=1.0,
        )
    except Exception as exc:
        logger.warning("public food api lookup failed for %r: %s", normalized_name, exc)
        return None


async def _fetch_from_gemini(normalized_name: str) -> NutritionData | None:
    """Gemini 로 kcal 추정.

    gemini-2.0-flash 하드코딩 + 동기 SDK 호출이었다. 모델은 2026-06-01 종료됐고,
    동기 호출은 이벤트 루프를 막았다 — 그것도 cooking-log 의 FOR UPDATE 락 안에서.
    """
    if not settings.gemini_api_key:
        return None

    prompt = (
        f"식재료 '{normalized_name}' 의 칼로리를 추정해주세요.\n"
        f"반드시 JSON 으로만 답하세요. 다른 텍스트 금지.\n"
        f"형식: "
        f'{{"kcal_per_100g": 숫자 or null, "kcal_per_100ml": 숫자 or null, '
        f'"kcal_per_piece": 숫자 or null, "confidence": 0~1 사이 숫자}}\n'
        f"- 해당하지 않는 단위는 null\n"
        f"- 고기/채소/곡물 등 무게 단위는 kcal_per_100g\n"
        f"- 음료/국물은 kcal_per_100ml\n"
        f"- 계란/바나나 등 낱개 단위는 kcal_per_piece\n"
        f"- confidence 는 모르면 0.3 이하"
    )

    try:
        payload = await gemini.generate_json(
            [prompt], models=settings.fast_models, temperature=0.0, timeout=15.0
        )
    except gemini.GeminiError as exc:
        logger.warning("gemini nutrition lookup failed for %r: %s", normalized_name, exc)
        return None

    if not isinstance(payload, dict):
        logger.warning("gemini nutrition 응답이 객체가 아님 (%r)", normalized_name)
        return None

    return NutritionData(
        kcal_per_100g=_safe_float(payload.get("kcal_per_100g")),
        kcal_per_100ml=_safe_float(payload.get("kcal_per_100ml")),
        kcal_per_piece=_safe_float(payload.get("kcal_per_piece")),
        source="gemini",
        confidence=max(0.0, min(1.0, _safe_float(payload.get("confidence")) or 0.3)),
    )


def _safe_float(v: object) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if f != f or f < 0:  # NaN or negative
        return None
    return f


async def _upsert_nutrition(
    db: AsyncSession,
    name: str,
    data: NutritionData,
    *,
    force_user: bool = False,
) -> None:
    """Dialect-agnostic upsert. User-sourced rows 는 `force_user=False` 일 때
    자동 소스에 의해 덮어쓰지 않는다. process-local single-flight lock 이 race 방어.
    """
    existing = await db.execute(
        select(IngredientNutrition).where(IngredientNutrition.normalized_name == name)
    )
    row = existing.scalar_one_or_none()
    if row is None:
        db.add(
            IngredientNutrition(
                normalized_name=name,
                kcal_per_100g=data.kcal_per_100g,
                kcal_per_100ml=data.kcal_per_100ml,
                kcal_per_piece=data.kcal_per_piece,
                source=data.source,
                confidence=data.confidence,
            )
        )
        return
    if row.source == "user" and not force_user:
        return
    row.kcal_per_100g = data.kcal_per_100g
    row.kcal_per_100ml = data.kcal_per_100ml
    row.kcal_per_piece = data.kcal_per_piece
    row.source = data.source
    row.confidence = data.confidence


async def get_or_fetch_nutrition(
    normalized_name: str,
    db: AsyncSession,
) -> IngredientNutrition | None:
    """캐시 → 공공 API → Gemini. 모두 실패 시 None."""
    name = normalized_name.strip()
    if not name:
        return None

    # 1. 캐시 hit
    cached = await db.execute(
        select(IngredientNutrition).where(IngredientNutrition.normalized_name == name)
    )
    row = cached.scalar_one_or_none()
    if row is not None:
        return row

    # 2. single-flight lock
    lock = await _get_lock(name)
    async with lock:
        # double-check: 다른 coroutine 이 먼저 채웠을 수 있음
        recheck = await db.execute(
            select(IngredientNutrition).where(IngredientNutrition.normalized_name == name)
        )
        row = recheck.scalar_one_or_none()
        if row is not None:
            return row

        # 3. 공공 API
        data = await _fetch_from_public_api(name)
        if data is None:
            # 4. Gemini fallback
            data = await _fetch_from_gemini(name)
        if data is None:
            return None

        await _upsert_nutrition(db, name, data)
        await db.flush()  # writable in same transaction
        result = await db.execute(
            select(IngredientNutrition).where(IngredientNutrition.normalized_name == name)
        )
        return result.scalar_one_or_none()


def compute_kcal(
    nutrition: IngredientNutrition | None,
    amount_value: float,
    unit: IngredientUnit,
) -> tuple[float, float | None]:
    """주어진 양/단위에 대한 kcal 산출. nutrition 없거나 해당 단위 데이터
    부재 시 (0.0, None) 반환. 리턴: (kcal, kcal_per_unit_for_audit)."""
    if nutrition is None or amount_value <= 0:
        return (0.0, None)

    if unit == IngredientUnit.GRAM and nutrition.kcal_per_100g is not None:
        per_unit = nutrition.kcal_per_100g / 100.0
        return (round(per_unit * amount_value, 2), per_unit)
    if unit == IngredientUnit.MILLILITER and nutrition.kcal_per_100ml is not None:
        per_unit = nutrition.kcal_per_100ml / 100.0
        return (round(per_unit * amount_value, 2), per_unit)
    if unit == IngredientUnit.PIECE and nutrition.kcal_per_piece is not None:
        per_unit = nutrition.kcal_per_piece
        return (round(per_unit * amount_value, 2), per_unit)
    return (0.0, None)


async def set_user_nutrition(
    db: AsyncSession,
    normalized_name: str,
    *,
    kcal_per_100g: float | None = None,
    kcal_per_100ml: float | None = None,
    kcal_per_piece: float | None = None,
) -> IngredientNutrition:
    """사용자 교정 저장. source="user" 로 고정 → 이후 자동 덮어쓰기 차단."""
    data = NutritionData(
        kcal_per_100g=kcal_per_100g,
        kcal_per_100ml=kcal_per_100ml,
        kcal_per_piece=kcal_per_piece,
        source="user",
        confidence=1.0,
    )
    await _upsert_nutrition(db, normalized_name, data, force_user=True)
    await db.flush()
    result = await db.execute(
        select(IngredientNutrition).where(IngredientNutrition.normalized_name == normalized_name)
    )
    return result.scalar_one()
