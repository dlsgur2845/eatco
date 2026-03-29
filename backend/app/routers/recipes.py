"""레시피 추천 API — Gemini 기반 맞춤 레시피 생성 + 식품안전나라 fallback."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ingredient import Ingredient
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.scan import get_user_family_id
from app.services.gemini_recipe import generate_recipes
from app.services.recipe_service import RecipeMatch, recommend_recipes

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


class RecipeResponse(BaseModel):
    name: str
    category: str
    cooking_method: str
    calories: str
    image_url: str
    ingredients: list[str]
    manual_steps: list[str]
    manual_images: list[str]
    tip: str
    match_count: int
    total_ingredients: int
    match_ratio: float
    matched_items: list[str]
    missing_items: list[str]
    urgent_used: list[str]


@router.get("/recommend", response_model=list[RecipeResponse])
async def get_recommendations(
    family_id: uuid.UUID = Depends(get_user_family_id),
    db: AsyncSession = Depends(get_db),
):
    """냉장고 재료 기반 레시피 추천. Gemini 우선, 실패 시 식품안전나라 fallback."""
    today = date.today()

    result = await db.execute(
        select(Ingredient)
        .where(Ingredient.family_id == family_id)
        .order_by(Ingredient.expiry_date.asc())
    )
    ingredients = result.scalars().all()

    fridge_items = [ing.normalized_name or ing.name for ing in ingredients] if ingredients else []
    urgent_items = [
        ing.normalized_name or ing.name for ing in ingredients
        if (ing.expiry_date - today).days <= 3
    ] if ingredients else []

    # 1. Gemini 레시피 생성 시도
    gemini_results = await generate_recipes(fridge_items, urgent_items)

    if gemini_results:
        responses = []
        for r in gemini_results:
            matched = r.get("matched_items", [])
            missing = r.get("missing_items", [])
            all_ing = r.get("ingredients", [])
            responses.append(RecipeResponse(
                name=r.get("name", ""),
                category=r.get("category", "기타"),
                cooking_method=r.get("cooking_method", "기타"),
                calories=str(r.get("calories", "0")),
                image_url="",
                ingredients=all_ing,
                manual_steps=r.get("manual_steps", []),
                manual_images=[],
                tip=r.get("tip", ""),
                match_count=len(matched),
                total_ingredients=len(all_ing),
                match_ratio=len(matched) / max(len(all_ing), 1),
                matched_items=matched,
                missing_items=missing,
                urgent_used=[u for u in urgent_items if u in matched],
            ))
        return responses

    # 2. Gemini 실패 시 식품안전나라 API + fallback
    recipes = await recommend_recipes(fridge_items, urgent_items, top_n=5)

    return [
        RecipeResponse(
            name=r.name,
            category=r.category,
            cooking_method=r.cooking_method,
            calories=r.calories,
            image_url=r.image_url,
            ingredients=r.ingredients,
            manual_steps=r.manual_steps,
            manual_images=r.manual_images,
            tip=r.tip,
            match_count=r.match_count,
            total_ingredients=r.total_ingredients,
            match_ratio=r.match_ratio,
            matched_items=r.matched_items,
            missing_items=r.missing_items,
            urgent_used=r.urgent_used,
        )
        for r in recipes
    ]
