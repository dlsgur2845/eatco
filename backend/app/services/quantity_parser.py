"""Legacy quantity 문자열을 (amount_value, unit) 으로 파싱하는 결정론 정규식.

사용 경로:
1. 마이그레이션 (lifespan `migrate_legacy_quantities`) — 기존 `quantity: str` row 를 새 컬럼으로 이관.
2. 테스트 utility.

런타임 cooking 경로에서는 사용하지 않음. 런타임 단위 변환은 `services/unit_convert.py`.

지원 패턴 (공백/유니코드 허용):
    "600g", "1.5kg", "500 ml", "1L", "3개", "2 통", "1 마리"
    "1큰술" → 15 ml, "2 작은술" → 10 ml, "1컵" → 200 ml
    "반 개" / "1/2 개" / "양파 반 개" → 0.5 piece
    "1/4 개" → 0.25 piece, "3/4" → 0.75

실패 반환 None — "반 통", "적당히", "한 줌" 등 모호한 표현. 호출자는 None 을
legacy quantity 문자열을 UI 배지로 surface 하라는 신호로 해석.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from app.models.ingredient import IngredientUnit

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncConnection

# 한글 숫자 표현 — "반" 만 지원. "한/두/세" 는 별도 수사 테이블이 필요해서 defer.
_KOREAN_HALF = r"반"

# 분수 "1/2", "3/4" 등
_FRACTION_RE = re.compile(r"^(\d+)\s*/\s*(\d+)$")

# 메인 토큰 매처 — 앞쪽의 숫자/분수/반 + 뒤쪽의 단위
# 숫자: 정수 또는 소수 또는 분수. "반" 은 별도 분기.
_NUMBER_RE = re.compile(
    r"""
    (?P<num>
        \d+\s*/\s*\d+       # 분수 (예: 1/2, 3/4)
        | \d+(?:[\.,]\d+)?  # 정수 또는 소수 (,도 허용)
    )
    """,
    re.VERBOSE,
)

# 단위 분류
_UNIT_G = {"g", "그램", "gram"}
_UNIT_KG = {"kg", "키로", "킬로", "킬로그램"}
_UNIT_MG = {"mg", "밀리그램"}
_UNIT_ML = {"ml", "밀리리터", "cc"}
_UNIT_L = {"l", "리터", "liter"}
_UNIT_PIECE = {
    "개",
    "통",
    "봉",
    "봉지",
    "팩",
    "박스",
    "마리",
    "송이",
    "알",
    "장",
    "조각",
    "쪽",
    "덩이",
    "포기",
    "쪼가리",
    "단",
    "묶음",
}
_UNIT_BIG_SPOON = {"큰술", "숟가락", "스푼"}
_UNIT_SMALL_SPOON = {"작은술", "티스푼", "tsp"}
_UNIT_CUP = {"컵", "cup"}

_FULLWIDTH_TRANS = str.maketrans(
    "０１２３４５６７８９．",
    "0123456789.",
)


def _to_half_width(s: str) -> str:
    return s.translate(_FULLWIDTH_TRANS)


def _parse_number_token(tok: str) -> float | None:
    tok = tok.strip().replace(" ", "")
    if not tok:
        return None
    frac = _FRACTION_RE.match(tok)
    if frac:
        num, den = int(frac.group(1)), int(frac.group(2))
        if den == 0:
            return None
        return num / den
    tok = tok.replace(",", ".")
    try:
        return float(tok)
    except ValueError:
        return None


def parse_quantity(raw: str | None) -> tuple[float, IngredientUnit] | None:
    """Legacy quantity 문자열을 (amount_value, unit) 으로 변환.

    실패 시 None. 성공 시 항상 양의 float + g/ml/piece.
    """
    if not raw:
        return None
    s = _to_half_width(raw.strip().lower())
    if not s:
        return None

    # "반 개" / "양파 반 개" / "1/2 개" → 0.5 piece 처리
    # 우선 "반" 단독 매칭: 뒤의 단위가 piece 계열인 경우만
    if _KOREAN_HALF in s:
        for u in _UNIT_PIECE:
            if u in s:
                return (0.5, IngredientUnit.PIECE)
        # 반 + 큰술/컵 등 → 해당 단위의 절반
        for u in _UNIT_BIG_SPOON:
            if u in s:
                return (7.5, IngredientUnit.MILLILITER)
        for u in _UNIT_SMALL_SPOON:
            if u in s:
                return (2.5, IngredientUnit.MILLILITER)
        for u in _UNIT_CUP:
            if u in s:
                return (100.0, IngredientUnit.MILLILITER)
        # "반 통" 같은 건 통이 piece 에 있으므로 위에서 잡힘.
        # 여기 남으면 모호 — 실패.

    # 숫자 추출
    m = _NUMBER_RE.search(s)
    if not m:
        return None
    value = _parse_number_token(m.group("num"))
    if value is None or value < 0:
        return None

    # 숫자 뒤쪽 텍스트에서 단위 매칭 (가장 먼 매칭부터 검사해서 긴 토큰 우선)
    tail = s[m.end():].strip()
    if not tail:
        # 숫자만 — 단위 없음. 기본값 추측하지 않음 → 실패.
        return None

    # 순서 중요: 긴 토큰 먼저 (큰술 전에 술 같은 부분 매칭 방지)
    for unit_set, target_unit, multiplier in [
        (_UNIT_BIG_SPOON, IngredientUnit.MILLILITER, 15.0),
        (_UNIT_SMALL_SPOON, IngredientUnit.MILLILITER, 5.0),
        (_UNIT_CUP, IngredientUnit.MILLILITER, 200.0),
        (_UNIT_KG, IngredientUnit.GRAM, 1000.0),
        (_UNIT_L, IngredientUnit.MILLILITER, 1000.0),
        (_UNIT_MG, IngredientUnit.GRAM, 0.001),
        (_UNIT_G, IngredientUnit.GRAM, 1.0),
        (_UNIT_ML, IngredientUnit.MILLILITER, 1.0),
        (_UNIT_PIECE, IngredientUnit.PIECE, 1.0),
    ]:
        for u in unit_set:
            if u in tail:
                return (round(value * multiplier, 4), target_unit)

    return None


async def migrate_legacy_quantities(conn: "AsyncConnection") -> tuple[int, int]:
    """앱 시작 시 호출. amount_value IS NULL 인 row 에 대해서만 legacy
    `quantity` 를 파싱해서 (amount_value, unit) 을 채운다. 파싱 실패 row 는
    그대로 두고 UI 에서 사용자가 재입력하게 한다.

    Returns (success_count, failure_count).
    """
    from sqlalchemy import text

    rows = await conn.execute(
        text(
            "SELECT id, quantity FROM ingredients "
            "WHERE amount_value IS NULL AND quantity IS NOT NULL AND quantity <> ''"
        )
    )
    success = 0
    failure = 0
    for row in rows:
        parsed = parse_quantity(row.quantity)
        if parsed is None:
            failure += 1
            continue
        amount, unit = parsed
        await conn.execute(
            text(
                "UPDATE ingredients SET amount_value = :amt, unit = :unit "
                "WHERE id = :id AND amount_value IS NULL"
            ),
            {"amt": amount, "unit": unit.value, "id": row.id},
        )
        success += 1
    return success, failure
