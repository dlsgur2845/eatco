import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.ingredient import Ingredient, StorageMethod
from app.models.user import Family, User
from app.routers.auth import get_current_user
from app.schemas.ingredient import (
    BatchDeleteRequest,
    IngredientCreate,
    IngredientResponse,
    IngredientUpdate,
)

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])


async def check_edit_permission(user: User, db: AsyncSession) -> None:
    """공동편집이 비활성이면 관리자(첫 번째 멤버)만 편집 가능."""
    if not user.family_id:
        return
    result = await db.execute(
        select(Family).where(Family.id == user.family_id).options(selectinload(Family.members))
    )
    family = result.scalar_one_or_none()
    if not family:
        return
    if family.allow_shared_edit:
        return
    # 관리자(첫 번째 멤버)만 허용
    if family.members and family.members[0].id != user.id:
        raise HTTPException(status_code=403, detail="공동 편집이 비활성화되어 있습니다. 관리자만 수정할 수 있습니다.")


@router.get("", response_model=list[IngredientResponse])
async def list_ingredients(
    category_id: uuid.UUID | None = None,
    storage_method: StorageMethod | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Ingredient).where(Ingredient.family_id == current_user.family_id)
    if category_id:
        query = query.where(Ingredient.category_id == category_id)
    if storage_method:
        query = query.where(Ingredient.storage_method == storage_method)
    if search:
        query = query.where(Ingredient.name.ilike(f"%{search}%"))
    query = query.order_by(Ingredient.expiry_date.asc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=IngredientResponse, status_code=201)
async def create_ingredient(
    data: IngredientCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_edit_permission(current_user, db)
    from app.services.normalizer import normalize_local
    normalized = normalize_local(data.name)
    ingredient = Ingredient(**data.model_dump(), family_id=current_user.family_id, normalized_name=normalized)
    db.add(ingredient)
    await db.commit()
    await db.refresh(ingredient)
    return ingredient


@router.post("/batch-delete", status_code=204)
async def batch_delete_ingredients(
    data: BatchDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_edit_permission(current_user, db)
    await db.execute(
        delete(Ingredient).where(
            Ingredient.id.in_(data.ids),
            Ingredient.family_id == current_user.family_id,
        )
    )
    await db.commit()


@router.get("/{ingredient_id}", response_model=IngredientResponse)
async def get_ingredient(
    ingredient_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id == ingredient_id,
            Ingredient.family_id == current_user.family_id,
        )
    )
    return result.scalar_one()


@router.put("/{ingredient_id}", response_model=IngredientResponse)
async def update_ingredient(
    ingredient_id: uuid.UUID,
    data: IngredientUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_edit_permission(current_user, db)
    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id == ingredient_id,
            Ingredient.family_id == current_user.family_id,
        )
    )
    ingredient = result.scalar_one()
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(ingredient, key, value)
    await db.commit()
    await db.refresh(ingredient)
    return ingredient


@router.delete("/{ingredient_id}", status_code=204)
async def delete_ingredient(
    ingredient_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_edit_permission(current_user, db)
    await db.execute(
        delete(Ingredient).where(
            Ingredient.id == ingredient_id,
            Ingredient.family_id == current_user.family_id,
        )
    )
    await db.commit()
