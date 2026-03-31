import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.notification_log import NotificationType


class NotificationLogResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    type: NotificationType
    title: str
    message: str
    is_read: bool
    link: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedNotificationLogResponse(BaseModel):
    items: list[NotificationLogResponse]
    total: int
    limit: int
    offset: int


class UnreadCountResponse(BaseModel):
    count: int
