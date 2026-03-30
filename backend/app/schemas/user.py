import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    nickname: str
    password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    nickname: str
    family_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class FamilyCreate(BaseModel):
    name: str


class FamilyJoin(BaseModel):
    invite_code: str


class FamilySettingsUpdate(BaseModel):
    allow_shared_edit: bool | None = None


class FamilyResponse(BaseModel):
    id: uuid.UUID
    name: str
    invite_code: str
    allow_shared_edit: bool
    master_id: uuid.UUID | None
    created_at: datetime
    members: list[UserResponse] = []

    model_config = {"from_attributes": True}
