"""런타임 단위 변환 — cooking log POST 경로에서 사용.

사용자 입력 단위를 `Ingredient.unit` (g / ml / piece) 로 normalize.
물리적으로 비양립 (ml ↔ g, density 없음) 시 ValueError.

지원 입력 단위 (대소문자 무관):
    g, kg, mg            → g
    ml, l, cc            → ml
    piece, 개            → piece
    큰술 (tbsp)          → 15 ml
    작은술 (tsp)         → 5 ml
    컵 (cup)             → 200 ml
"""

from __future__ import annotations

from app.models.ingredient import IngredientUnit


class UnitConversionError(ValueError):
    """단위 변환 불가 (물리적으로 호환되지 않음)."""


# 입력 alias → (canonical unit, factor to canonical)
_CANONICAL: dict[str, tuple[IngredientUnit, float]] = {
    # mass
    "g": (IngredientUnit.GRAM, 1.0),
    "gram": (IngredientUnit.GRAM, 1.0),
    "그램": (IngredientUnit.GRAM, 1.0),
    "kg": (IngredientUnit.GRAM, 1000.0),
    "키로": (IngredientUnit.GRAM, 1000.0),
    "킬로": (IngredientUnit.GRAM, 1000.0),
    "킬로그램": (IngredientUnit.GRAM, 1000.0),
    "mg": (IngredientUnit.GRAM, 0.001),
    # volume
    "ml": (IngredientUnit.MILLILITER, 1.0),
    "cc": (IngredientUnit.MILLILITER, 1.0),
    "밀리리터": (IngredientUnit.MILLILITER, 1.0),
    "l": (IngredientUnit.MILLILITER, 1000.0),
    "리터": (IngredientUnit.MILLILITER, 1000.0),
    "큰술": (IngredientUnit.MILLILITER, 15.0),
    "tbsp": (IngredientUnit.MILLILITER, 15.0),
    "스푼": (IngredientUnit.MILLILITER, 15.0),
    "숟가락": (IngredientUnit.MILLILITER, 15.0),
    "작은술": (IngredientUnit.MILLILITER, 5.0),
    "tsp": (IngredientUnit.MILLILITER, 5.0),
    "티스푼": (IngredientUnit.MILLILITER, 5.0),
    "컵": (IngredientUnit.MILLILITER, 200.0),
    "cup": (IngredientUnit.MILLILITER, 200.0),
    # piece
    "piece": (IngredientUnit.PIECE, 1.0),
    "개": (IngredientUnit.PIECE, 1.0),
    "pcs": (IngredientUnit.PIECE, 1.0),
}


def normalize(amount: float, input_unit: str, target_unit: IngredientUnit) -> float:
    """입력 수량을 타겟 단위로 normalize. 비호환 시 UnitConversionError.

    Raises:
        UnitConversionError: 입력 단위 미지원 or target 과 물리 비양립.
    """
    if amount < 0:
        raise UnitConversionError("amount 는 음수일 수 없습니다")

    key = input_unit.strip().lower()
    if key not in _CANONICAL:
        # IngredientUnit enum 값 직접 매칭 (대소문자 무관)
        for u in IngredientUnit:
            if u.value == key:
                canonical_unit = u
                factor = 1.0
                break
        else:
            raise UnitConversionError(f"알 수 없는 단위: {input_unit!r}")
    else:
        canonical_unit, factor = _CANONICAL[key]

    if canonical_unit != target_unit:
        raise UnitConversionError(
            f"단위를 변환할 수 없어요: {input_unit} → {target_unit.value}"
        )

    return round(amount * factor, 4)
