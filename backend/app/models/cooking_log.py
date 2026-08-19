import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.ingredient import Base, IngredientUnit


class CookingLog(Base):
    __tablename__ = "cooking_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("families.id"), nullable=False
    )
    recipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("custom_recipes.id", ondelete="SET NULL"), nullable=True
    )
    recipe_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    cooked_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cooked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    total_kcal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    items: Mapped[list["CookingLogItem"]] = relationship(
        "CookingLogItem",
        back_populates="cooking_log",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_cooking_logs_family_cooked_at", "family_id", "cooked_at"),
    )


class CookingLogItem(Base):
    __tablename__ = "cooking_log_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cooking_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cooking_logs.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SET NULL 로 재고 삭제돼도 과거 기록 유지 (snapshot 필드로 표시)
    ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ingredients.id", ondelete="SET NULL"),
        nullable=True,
    )
    ingredient_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    amount_used: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[IngredientUnit] = mapped_column(
        Enum(
            IngredientUnit,
            name="ingredientunit",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    kcal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # audit: 왜 이 kcal 였는지 (nutrition cache 가 나중에 바뀌어도 history 는 고정)
    kcal_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    nutrition_source: Mapped[str | None] = mapped_column(String(20), nullable=True)

    cooking_log: Mapped["CookingLog"] = relationship("CookingLog", back_populates="items")
