import uuid

from sqlalchemy import Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.ingredient import Base


class StorageGuide(Base):
    """식재료별 보관 기간 가이드 (USDA FoodKeeper 기반 + 한국 식재료)"""

    __tablename__ = "storage_guides"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    keyword: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    keywords: Mapped[str] = mapped_column(Text, nullable=False, default="")  # comma-separated search terms
    refrigerated_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frozen_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    room_temp_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
