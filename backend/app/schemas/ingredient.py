import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.ingredient import StorageMethod


class IngredientCreate(BaseModel):
    name: str
    category_id: uuid.UUID | None = None
    storage_method: StorageMethod = StorageMethod.REFRIGERATED
    quantity: int = 1
    expiry_date: date
    image_url: str | None = None


class IngredientUpdate(BaseModel):
    name: str | None = None
    category_id: uuid.UUID | None = None
    storage_method: StorageMethod | None = None
    quantity: int | None = None
    expiry_date: date | None = None
    image_url: str | None = None


class IngredientResponse(BaseModel):
    id: uuid.UUID
    name: str
    category_id: uuid.UUID | None
    storage_method: StorageMethod
    quantity: int
    expiry_date: date
    registered_at: datetime
    image_url: str | None
    family_id: uuid.UUID | None

    model_config = {"from_attributes": True}


class DashboardSummary(BaseModel):
    critical: int  # 3일 이내
    warning: int   # 7일 이내
    safe: int      # 안전


class BatchDeleteRequest(BaseModel):
    ids: list[uuid.UUID]
