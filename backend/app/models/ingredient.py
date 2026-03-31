import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class StorageMethod(str, enum.Enum):
    REFRIGERATED = "refrigerated"
    FROZEN = "frozen"
    ROOM_TEMP = "room_temp"


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id"))
    storage_method: Mapped[StorageMethod] = mapped_column(Enum(StorageMethod), default=StorageMethod.REFRIGERATED)
    quantity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    family_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("families.id"))
    registered_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    store_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    normalized_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    category = relationship("Category", back_populates="ingredients")

    __table_args__ = (
        Index("ix_ingredients_family_expiry", "family_id", "expiry_date"),
        Index("ix_ingredients_family_category", "family_id", "category_id"),
    )
