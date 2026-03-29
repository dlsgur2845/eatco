"""나만의 레시피 CRUD API."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.custom_recipe import CustomRecipe
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/custom-recipes", tags=["custom-recipes"])


class RecipeCreate(BaseModel):
    name: str
    category: str = "기타"
    cooking_method: str = "기타"
    calories: str | None = None
    ingredients: list[str] = []
    manual_steps: list[str] = []
    tip: str | None = None


class RecipeUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    cooking_method: str | None = None
    calories: str | None = None
    ingredients: list[str] | None = None
    manual_steps: list[str] | None = None
    tip: str | None = None


class RecipeResponse(BaseModel):
    id: uuid.UUID
    name: str
    category: str
    cooking_method: str
    calories: str | None
    ingredients: list[str]
    manual_steps: list[str]
    tip: str | None
    image_url: str | None
    created_by: str | None
    created_at: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[RecipeResponse])
async def list_recipes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족의 나만의 레시피 목록."""
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")

    result = await db.execute(
        select(CustomRecipe)
        .where(CustomRecipe.family_id == user.family_id)
        .order_by(CustomRecipe.created_at.desc())
    )
    recipes = result.scalars().all()
    return [
        RecipeResponse(
            id=r.id,
            name=r.name,
            category=r.category,
            cooking_method=r.cooking_method,
            calories=r.calories,
            ingredients=r.ingredients or [],
            manual_steps=r.manual_steps or [],
            tip=r.tip,
            image_url=r.image_url,
            created_by=r.created_by,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in recipes
    ]


@router.post("", response_model=RecipeResponse, status_code=201)
async def create_recipe(
    data: RecipeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """나만의 레시피 등록."""
    if not user.family_id:
        raise HTTPException(status_code=400, detail="가족 그룹에 먼저 가입해주세요.")

    recipe = CustomRecipe(
        family_id=user.family_id,
        name=data.name,
        category=data.category,
        cooking_method=data.cooking_method,
        calories=data.calories,
        ingredients=data.ingredients,
        manual_steps=data.manual_steps,
        tip=data.tip,
        created_by=user.nickname,
    )
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)

    return RecipeResponse(
        id=recipe.id,
        name=recipe.name,
        category=recipe.category,
        cooking_method=recipe.cooking_method,
        calories=recipe.calories,
        ingredients=recipe.ingredients or [],
        manual_steps=recipe.manual_steps or [],
        tip=recipe.tip,
        image_url=recipe.image_url,
        created_by=recipe.created_by,
        created_at=recipe.created_at.isoformat() if recipe.created_at else "",
    )


@router.put("/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: str,
    data: RecipeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """나만의 레시피 수정."""
    try:
        uid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 ID입니다.")

    result = await db.execute(
        select(CustomRecipe).where(
            CustomRecipe.id == uid,
            CustomRecipe.family_id == user.family_id,
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다.")

    if data.name is not None: recipe.name = data.name
    if data.category is not None: recipe.category = data.category
    if data.cooking_method is not None: recipe.cooking_method = data.cooking_method
    if data.calories is not None: recipe.calories = data.calories
    if data.ingredients is not None: recipe.ingredients = data.ingredients
    if data.manual_steps is not None: recipe.manual_steps = data.manual_steps
    if data.tip is not None: recipe.tip = data.tip

    await db.commit()
    await db.refresh(recipe)

    return RecipeResponse(
        id=recipe.id,
        name=recipe.name,
        category=recipe.category,
        cooking_method=recipe.cooking_method,
        calories=recipe.calories,
        ingredients=recipe.ingredients or [],
        manual_steps=recipe.manual_steps or [],
        tip=recipe.tip,
        image_url=recipe.image_url,
        created_by=recipe.created_by,
        created_at=recipe.created_at.isoformat() if recipe.created_at else "",
    )


@router.delete("/{recipe_id}")
async def delete_recipe(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """나만의 레시피 삭제."""
    try:
        uid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="잘못된 ID입니다.")

    result = await db.execute(
        select(CustomRecipe).where(
            CustomRecipe.id == uid,
            CustomRecipe.family_id == user.family_id,
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다.")

    await db.delete(recipe)
    await db.commit()
    return {"deleted": True}
