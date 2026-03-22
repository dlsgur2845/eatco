import uuid
from datetime import time

from pydantic import BaseModel


class NotificationSettingResponse(BaseModel):
    id: uuid.UUID
    days_before: int
    enabled: bool
    push_time: time

    model_config = {"from_attributes": True}


class NotificationSettingUpdate(BaseModel):
    enabled: bool | None = None
    push_time: time | None = None


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}
