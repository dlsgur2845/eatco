from datetime import datetime

from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.ingredient import Base


class IngredientNutrition(Base):
    __tablename__ = "ingredient_nutrition"

    normalized_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    kcal_per_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    kcal_per_100ml: Mapped[float | None] = mapped_column(Float, nullable=True)
    kcal_per_piece: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
