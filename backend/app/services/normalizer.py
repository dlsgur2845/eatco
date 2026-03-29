"""식재료 이름 정규화 — Gemini 캐시 + 로컬 폴백.

    "국내산냉동엿날삼겹살" → "삼겹살"
    "양파 3개입" → "양파"
    "서울우유 1L" → "우유"
"""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ingredient import Ingredient


# 정규식 패턴: 숫자+단위, 용량 표현 제거
_UNIT_PATTERN = re.compile(
    r'\d+(\.\d+)?\s*'
    r'(kg|g|ml|l|L|리터|그램|킬로|개입|개|팩|봉|입|병|캔|박스|세트|묶음|단|줄|장|매|ea|p)'
    r'(\s|$)',
    re.IGNORECASE,
)

# 브랜드/수식어 패턴
_PREFIX_PATTERN = re.compile(
    r'^(국내산|수입산|냉동|신선|유기농|무농약|GAP|친환경|프리미엄|대용량|특대|대|중|소|)\s*',
)

# 숫자만 있는 토큰 제거
_NUMBER_ONLY = re.compile(r'^\d+(\.\d+)?$')


def normalize_local(name: str) -> str:
    """로컬 정규식 기반 정규화. Gemini 실패 시 폴백."""
    result = name.strip()

    # 단위 표현 제거
    result = _UNIT_PATTERN.sub('', result).strip()

    # 앞쪽 수식어 제거
    result = _PREFIX_PATTERN.sub('', result).strip()

    # 남은 숫자 토큰 제거
    tokens = result.split()
    tokens = [t for t in tokens if not _NUMBER_ONLY.match(t)]
    result = ' '.join(tokens).strip()

    # 빈 문자열이면 원본 반환
    return result if result else name.strip()


async def normalize_with_gemini(name: str) -> str | None:
    """Gemini Flash로 식재료 이름 정규화."""
    if not settings.gemini_api_key:
        return None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                f'다음 식재료 상품명에서 핵심 식재료 이름만 추출해주세요. '
                f'브랜드, 용량, 수량, 수식어는 모두 제거하고 순수 식재료 이름만 반환하세요. '
                f'한 단어 또는 두 단어로 반환. 다른 텍스트 없이 이름만.\n\n'
                f'상품명: {name}'
            ],
            config=types.GenerateContentConfig(temperature=0.0),
        )
        result = response.text.strip().strip('"').strip("'")
        return result if result else None
    except Exception:
        return None


async def get_normalized_name(name: str, db: AsyncSession) -> str:
    """정규화된 이름을 반환. DB 캐시 → Gemini → 로컬 폴백 순."""
    # 1. DB에서 같은 raw name의 기존 normalized_name 찾기
    result = await db.execute(
        select(Ingredient.normalized_name)
        .where(Ingredient.name == name, Ingredient.normalized_name.isnot(None))
        .limit(1)
    )
    cached = result.scalar_one_or_none()
    if cached:
        return cached

    # 2. Gemini 시도
    gemini_result = await normalize_with_gemini(name)
    if gemini_result:
        return gemini_result

    # 3. 로컬 폴백
    return normalize_local(name)
