import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.ingredient import Base


class CustomRecipe(Base):
    __tablename__ = "custom_recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("families.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="기타")
    cooking_method: Mapped[str] = mapped_column(String(50), default="기타")
    calories: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ingredients: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    manual_steps: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    tip: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
