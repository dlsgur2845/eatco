"""Unit tests for services/unit_convert.py."""

import pytest

from app.models.ingredient import IngredientUnit
from app.services.unit_convert import UnitConversionError, normalize


def test_same_unit_passthrough() -> None:
    assert normalize(100.0, "g", IngredientUnit.GRAM) == 100.0
    assert normalize(250.0, "ml", IngredientUnit.MILLILITER) == 250.0
    assert normalize(3.0, "개", IngredientUnit.PIECE) == 3.0


def test_mass_conversion() -> None:
    assert normalize(1.5, "kg", IngredientUnit.GRAM) == 1500.0
    assert normalize(500.0, "mg", IngredientUnit.GRAM) == 0.5


def test_volume_conversion() -> None:
    assert normalize(1.0, "L", IngredientUnit.MILLILITER) == 1000.0
    assert normalize(1.0, "큰술", IngredientUnit.MILLILITER) == 15.0
    assert normalize(1.0, "작은술", IngredientUnit.MILLILITER) == 5.0
    assert normalize(1.0, "컵", IngredientUnit.MILLILITER) == 200.0


def test_piece_synonyms() -> None:
    assert normalize(2.0, "piece", IngredientUnit.PIECE) == 2.0
    assert normalize(0.5, "개", IngredientUnit.PIECE) == 0.5


def test_incompatible_units_raise() -> None:
    # ml → g 는 density 없이는 불가
    with pytest.raises(UnitConversionError):
        normalize(100.0, "ml", IngredientUnit.GRAM)
    with pytest.raises(UnitConversionError):
        normalize(1.0, "큰술", IngredientUnit.GRAM)
    with pytest.raises(UnitConversionError):
        normalize(1.0, "개", IngredientUnit.MILLILITER)


def test_unknown_unit_raises() -> None:
    with pytest.raises(UnitConversionError):
        normalize(1.0, "블록", IngredientUnit.GRAM)


def test_negative_amount_rejected() -> None:
    with pytest.raises(UnitConversionError):
        normalize(-1.0, "g", IngredientUnit.GRAM)


def test_case_insensitive() -> None:
    assert normalize(1.0, "KG", IngredientUnit.GRAM) == 1000.0
    assert normalize(1.0, "ML", IngredientUnit.MILLILITER) == 1.0
