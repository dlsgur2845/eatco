import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.ingredient import IngredientUnit


class CookingLogItemCreate(BaseModel):
    ingredient_id: uuid.UUID
    amount_used: float = Field(gt=0)
    unit: str  # 자유 입력 — 서버에서 unit_convert.normalize 로 canonical 변환


class CookingLogCreate(BaseModel):
    recipe_id: uuid.UUID | None = None
    recipe_name: str = Field(min_length=1, max_length=200)
    cooked_by: str | None = None
    items: list[CookingLogItemCreate] = Field(min_length=1)


class CookingLogItemResponse(BaseModel):
    id: uuid.UUID
    ingredient_id: uuid.UUID | None
    ingredient_name_snapshot: str
    amount_used: float
    unit: IngredientUnit
    kcal: float
    kcal_per_unit: float | None
    nutrition_source: str | None

    model_config = {"from_attributes": True}


class CookingLogResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    recipe_id: uuid.UUID | None
    recipe_name_snapshot: str
    cooked_by: str | None
    cooked_at: datetime
    total_kcal: float
    items: list[CookingLogItemResponse]

    model_config = {"from_attributes": True}


class NutritionResponse(BaseModel):
    normalized_name: str
    kcal_per_100g: float | None
    kcal_per_100ml: float | None
    kcal_per_piece: float | None
    source: str
    confidence: float

    model_config = {"from_attributes": True}


class NutritionUpdateRequest(BaseModel):
    kcal_per_100g: float | None = Field(default=None, ge=0)
    kcal_per_100ml: float | None = Field(default=None, ge=0)
    kcal_per_piece: float | None = Field(default=None, ge=0)
