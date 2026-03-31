import uuid
from datetime import datetime, time

from pydantic import BaseModel


class NotificationSettingResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID | None
    days_before: int
    enabled: bool
    push_time: time

    model_config = {"from_attributes": True}


class NotificationSettingUpdate(BaseModel):
    enabled: bool | None = None
    push_time: time | None = None


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


class PushSubscriptionResponse(BaseModel):
    id: uuid.UUID
    endpoint: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}
