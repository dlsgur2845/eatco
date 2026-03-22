import uuid

from pydantic import BaseModel


class StorageGuideResponse(BaseModel):
    id: uuid.UUID
    keyword: str
    refrigerated_days: int | None
    frozen_days: int | None
    room_temp_days: int | None

    model_config = {"from_attributes": True}
