"""Unit tests for services/quantity_parser.py — 순수 함수, DB fixture 불필요."""

import pytest

from app.models.ingredient import IngredientUnit
from app.services.quantity_parser import parse_quantity


@pytest.mark.parametrize(
    "raw,expected",
    [
        # 기본 질량
        ("600g", (600.0, IngredientUnit.GRAM)),
        ("1.5kg", (1500.0, IngredientUnit.GRAM)),
        ("500 그램", (500.0, IngredientUnit.GRAM)),
        ("2킬로", (2000.0, IngredientUnit.GRAM)),
        # 기본 부피
        ("500ml", (500.0, IngredientUnit.MILLILITER)),
        ("1L", (1000.0, IngredientUnit.MILLILITER)),
        ("1 리터", (1000.0, IngredientUnit.MILLILITER)),
        # 개수
        ("3개", (3.0, IngredientUnit.PIECE)),
        ("2 통", (2.0, IngredientUnit.PIECE)),
        ("1 마리", (1.0, IngredientUnit.PIECE)),
        ("5 송이", (5.0, IngredientUnit.PIECE)),
        # 큰술/작은술/컵 → ml
        ("1큰술", (15.0, IngredientUnit.MILLILITER)),
        ("2 작은술", (10.0, IngredientUnit.MILLILITER)),
        ("1컵", (200.0, IngredientUnit.MILLILITER)),
        # 반 개 → 0.5 piece (UC2 결정)
        ("반 개", (0.5, IngredientUnit.PIECE)),
        ("양파 반 개", (0.5, IngredientUnit.PIECE)),
        ("1/2 개", (0.5, IngredientUnit.PIECE)),
        ("3/4 개", (0.75, IngredientUnit.PIECE)),
        # 반 큰술 → 7.5 ml
        ("반 큰술", (7.5, IngredientUnit.MILLILITER)),
        # Full-width digits
        ("５００g", (500.0, IngredientUnit.GRAM)),
    ],
)
def test_parse_quantity_success(raw: str, expected: tuple[float, IngredientUnit]) -> None:
    result = parse_quantity(raw)
    assert result is not None
    assert result[0] == pytest.approx(expected[0])
    assert result[1] == expected[1]


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "   ",
        "반 통",  # "통" 은 piece 이므로 0.5 piece 로 성공 — 이건 위 테스트에 없음
        "적당히",
        "조금",
        "한 줌",
        "약간",
        "맛있게",
        "10",  # 단위 없음
        "xyz",
    ],
)
def test_parse_quantity_failure(raw: str | None) -> None:
    result = parse_quantity(raw)
    # "반 통" 은 실제로는 성공해야 함 (통은 piece) — 이건 edge case
    if raw == "반 통":
        assert result == (0.5, IngredientUnit.PIECE)
    else:
        assert result is None
