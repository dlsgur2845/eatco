import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
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
    # Postgres 에서는 네이티브 ARRAY, 그 외(SQLite 테스트/향후 D1)에서는 JSON.
    # with_variant 는 Postgres DDL 을 바꾸지 않는다 — 프로덕션 스키마 영향 없음.
    # 이게 없으면 Base.metadata.create_all(sqlite) 가 CompileError 로 죽어서
    # conftest.py 가 앱 전체를 import 하는 테스트 스위트가 통째로 실행되지 않는다.
    ingredients: Mapped[list[str]] = mapped_column(
        ARRAY(String).with_variant(JSON(), "sqlite"), default=list
    )
    manual_steps: Mapped[list[str]] = mapped_column(
        ARRAY(String).with_variant(JSON(), "sqlite"), default=list
    )
    tip: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
