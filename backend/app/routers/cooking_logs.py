"""Cooking log endpoints — 요리 기록, 원자 재고 차감, 칼로리 계산.

원자성 보장:
- `SELECT ... FOR UPDATE` 로 ingredient row lock (Postgres row-level lock)
- `family_id == user.family_id` 필터를 FOR UPDATE 쿼리에 포함 → cross-family exploit 방어
- 차감/INSERT 사이 중간 flush 없음 (단일 commit)

단위:
- 사용자 입력 unit (큰술, 컵, L, ...) → `unit_convert.normalize` 로 ingredient.unit
  canonical 변환. ml↔g 비양립 시 422.

삭제는 재고 복구 안 함 (이미 먹음). UI 는 delete+recreate 패턴으로 편집 유도.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.cooking_log import CookingLog, CookingLogItem
from app.models.ingredient import Ingredient
from app.models.ingredient_nutrition import IngredientNutrition
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.ingredients import check_edit_permission
from app.schemas.cooking_log import (
    CookingLogCreate,
    CookingLogResponse,
    NutritionResponse,
    NutritionUpdateRequest,
)
from app.services.nutrition import (
    compute_kcal,
    get_or_fetch_nutrition,
    set_user_nutrition,
)
from app.services.unit_convert import UnitConversionError, normalize

router = APIRouter(prefix="/api/cooking-logs", tags=["cooking-logs"])


@router.post("", response_model=CookingLogResponse, status_code=201)
async def create_cooking_log(
    data: CookingLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CookingLog:
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="가족에 소속되어 있지 않습니다")
    await check_edit_permission(current_user, db)

    # Duplicate ingredient_id 는 단일 줄로 합쳐지지 않음 — 사용자가 같은 재료를
    # 두 번 입력했다면 두 번 차감. FOR UPDATE 는 한 번만 걸면 됨.
    unique_ids = list({item.ingredient_id for item in data.items})

    # 1) 락 없이 먼저 읽어서 어떤 영양정보가 필요한지 파악한다.
    prefetch = await db.execute(
        select(Ingredient).where(
            Ingredient.id.in_(unique_ids),
            Ingredient.family_id == current_user.family_id,
        )
    )
    prefetch_rows = prefetch.scalars().all()
    if len(prefetch_rows) != len(unique_ids):
        raise HTTPException(status_code=404, detail="일부 재료를 찾을 수 없습니다")

    # 2) 영양정보를 락 밖에서 미리 채운다.
    #    get_or_fetch_nutrition 은 캐시 미스 시 외부 API(공공데이터 → Gemini)를 호출한다.
    #    이걸 FOR UPDATE 안에서 부르면 외부 응답을 기다리는 내내 해당 가족의 재료 행이
    #    잠긴 채 남아서, 같이 쓰는 가족 전원이 대기하게 된다.
    nutrition_by_name: dict[str, object] = {}
    for ing in prefetch_rows:
        key = ing.normalized_name or ing.name
        if key not in nutrition_by_name:
            nutrition_by_name[key] = await get_or_fetch_nutrition(key, db)

    # 3) 이제 락을 잡는다. family 필터 + FOR UPDATE — cross-family 접근은 여기서 막힘
    result = await db.execute(
        select(Ingredient)
        .where(
            Ingredient.id.in_(unique_ids),
            Ingredient.family_id == current_user.family_id,
        )
        .with_for_update()
    )
    ingredients = {ing.id: ing for ing in result.scalars().all()}
    if len(ingredients) != len(unique_ids):
        raise HTTPException(status_code=404, detail="일부 재료를 찾을 수 없습니다")

    # Validate + compute kcal per item (중간 flush 없이 in-memory 로 구성)
    items_payload: list[dict] = []
    total_kcal = 0.0
    pending_deduct: dict[uuid.UUID, float] = {}

    for item in data.items:
        ing = ingredients[item.ingredient_id]
        if ing.unit is None or ing.amount_value is None:
            raise HTTPException(
                status_code=422,
                detail=f"'{ing.name}' 의 수량 확인이 필요해요. 재고 화면에서 먼저 정리해주세요.",
            )
        try:
            normalized_amount = normalize(item.amount_used, item.unit, ing.unit)
        except UnitConversionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        new_pending = pending_deduct.get(ing.id, 0.0) + normalized_amount
        if new_pending > ing.amount_value + 1e-9:
            raise HTTPException(
                status_code=422,
                detail=f"'{ing.name}' 재고보다 많이 사용할 수 없어요. (남은 {ing.amount_value}{ing.unit.value})",
            )
        pending_deduct[ing.id] = new_pending

        nutrition = nutrition_by_name.get(ing.normalized_name or ing.name)
        kcal, kcal_per_unit = compute_kcal(nutrition, normalized_amount, ing.unit)
        total_kcal += kcal
        items_payload.append(
            {
                "ingredient_id": ing.id,
                "ingredient_name_snapshot": ing.name,
                "amount_used": normalized_amount,
                "unit": ing.unit,
                "kcal": kcal,
                "kcal_per_unit": kcal_per_unit,
                "nutrition_source": nutrition.source if nutrition else None,
            }
        )

    # 실제 차감
    for ing_id, amount in pending_deduct.items():
        ingredients[ing_id].amount_value = round(ingredients[ing_id].amount_value - amount, 4)

    log = CookingLog(
        family_id=current_user.family_id,
        recipe_id=data.recipe_id,
        recipe_name_snapshot=data.recipe_name,
        cooked_by=data.cooked_by or current_user.nickname,
        cooked_at=datetime.now(timezone.utc),
        total_kcal=round(total_kcal, 2),
        items=[CookingLogItem(**p) for p in items_payload],
    )
    db.add(log)
    await db.commit()
    await db.refresh(log, attribute_names=["items"])
    return log


@router.get("", response_model=list[CookingLogResponse])
async def list_cooking_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CookingLog]:
    if not current_user.family_id:
        return []
    result = await db.execute(
        select(CookingLog)
        .where(CookingLog.family_id == current_user.family_id)
        .options(selectinload(CookingLog.items))
        .order_by(CookingLog.cooked_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.get("/nutrition/{normalized_name}", response_model=NutritionResponse)
async def get_nutrition(
    normalized_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IngredientNutrition:
    row = await get_or_fetch_nutrition(normalized_name, db)
    if row is None:
        raise HTTPException(status_code=404, detail="칼로리 정보를 찾을 수 없습니다")
    return row


@router.put("/nutrition/{normalized_name}", response_model=NutritionResponse)
async def update_nutrition(
    normalized_name: str,
    data: NutritionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IngredientNutrition:
    # ingredient_nutrition 은 가족 단위로 분리돼 있지 않은 공용 테이블이고,
    # set_user_nutrition 은 source="user" 로 고정해서 이후 자동 갱신을 영구 차단한다.
    # 즉 이 엔드포인트 한 번이 전체 사용자의 해당 재료 칼로리를 되돌릴 수 없게 만든다.
    # create/delete 와 동일하게 편집 권한을 요구한다.
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="가족에 소속되어 있지 않습니다")
    await check_edit_permission(current_user, db)

    # 빈 본문({})이면 kcal 세 값이 전부 NULL 인 채로 source="user" 가 박혀서
    # 해당 재료가 영구히 0 kcal 로 고정된다. 최소 하나는 요구한다.
    if data.kcal_per_100g is None and data.kcal_per_100ml is None and data.kcal_per_piece is None:
        raise HTTPException(
            status_code=422,
            detail="kcal_per_100g, kcal_per_100ml, kcal_per_piece 중 최소 하나는 필요합니다.",
        )

    row = await set_user_nutrition(
        db,
        normalized_name,
        kcal_per_100g=data.kcal_per_100g,
        kcal_per_100ml=data.kcal_per_100ml,
        kcal_per_piece=data.kcal_per_piece,
    )
    await db.commit()
    return row


@router.get("/{log_id}", response_model=CookingLogResponse)
async def get_cooking_log(
    log_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CookingLog:
    result = await db.execute(
        select(CookingLog)
        .where(
            CookingLog.id == log_id,
            CookingLog.family_id == current_user.family_id,
        )
        .options(selectinload(CookingLog.items))
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="요리 기록을 찾을 수 없습니다")
    return log


@router.delete("/{log_id}", status_code=204)
async def delete_cooking_log(
    log_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """재고는 복구하지 않습니다 (이미 먹었음). UI 는 delete+recreate 패턴으로 편집."""
    await check_edit_permission(current_user, db)
    result = await db.execute(
        select(CookingLog).where(
            CookingLog.id == log_id,
            CookingLog.family_id == current_user.family_id,
        )
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="요리 기록을 찾을 수 없습니다")
    await db.delete(log)
    await db.commit()
