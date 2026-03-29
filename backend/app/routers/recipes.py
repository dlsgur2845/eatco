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
    source: str = "gemini"  # "gemini" | "foodsafety" | "fallback"


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

    # 나만의 레시피 중 재료 매칭되는 것 우선 포함
    from app.models.custom_recipe import CustomRecipe
    from app.services.recipe_service import _compute_match

    custom_result = await db.execute(
        select(CustomRecipe).where(CustomRecipe.family_id == family_id)
    )
    custom_recipes = custom_result.scalars().all()

    # 1. 식품안전나라 API 우선 (사진 + 검증된 레시피)
    responses: list[RecipeResponse] = []
    seen_names: set[str] = set()

    # 0. 나만의 레시피 중 재료 매칭되는 것 먼저
    for cr in custom_recipes:
        match = _compute_match(cr.ingredients or [], fridge_items, urgent_items)
        if match["match_count"] > 0 or not fridge_items:
            responses.append(RecipeResponse(
                name=cr.name,
                category=cr.category,
                cooking_method=cr.cooking_method,
                calories=cr.calories or "0",
                image_url=cr.image_url or "",
                ingredients=cr.ingredients or [],
                manual_steps=cr.manual_steps or [],
                manual_images=[],
                tip=cr.tip or "",
                match_count=match["match_count"],
                total_ingredients=match["total"],
                match_ratio=match["ratio"],
                matched_items=match["matched"],
                missing_items=match["missing"],
                urgent_used=match["urgent_used"],
                source="custom",
            ))
            seen_names.add(cr.name)

    # 1. 식품안전나라 API
    recipes = await recommend_recipes(fridge_items, urgent_items, top_n=5)

    for r in recipes:
        responses.append(RecipeResponse(
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
            source="foodsafety" if r.image_url else "fallback",
        ))
        seen_names.add(r.name)

    # 2. Gemini로 보충 (식품안전나라 결과가 부족하면)
    if len(responses) < 5:
        gemini_results = await generate_recipes(fridge_items, urgent_items,
            matched_count=max(3, 5 - len(responses)), extra_count=2)
        for r in gemini_results:
            if r.get("name") in seen_names:
                continue
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
                source="gemini",
            ))
            seen_names.add(r.get("name", ""))

    return responses
