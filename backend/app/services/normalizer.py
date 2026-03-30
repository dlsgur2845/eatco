"""식재료 이름 정규화 — 품질/종류 구분은 유지, 브랜드/용량만 제거.

    "국내산냉동엿날삼겹살 600g" → "냉동 삼겹살"  (냉동 유지)
    "한우 등심 1등급 300g" → "한우 등심"          (한우 유지)
    "서울우유 1L" → "우유"                        (브랜드 제거)
    "양파 3개입" → "양파"                         (용량 제거)
    "미국산 소고기 채끝" → "미국산 소고기 채끝"    (원산지 유지)
"""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ingredient import Ingredient


# 숫자+단위 표현 제거 (용량/수량)
_UNIT_PATTERN = re.compile(
    r'\d+(\.\d+)?\s*'
    r'(kg|g|ml|l|L|리터|그램|킬로|개입|개|팩|봉|입|병|캔|박스|세트|묶음|단|줄|장|매|ea|p)'
    r'(\s|$)',
    re.IGNORECASE,
)

# 브랜드명 제거 (식재료 특성이 아닌 것만)
_BRAND_PATTERN = re.compile(
    r'(풀무원|서울우유|매일|남양|CJ|비비고|오뚜기|농심|삼양|해표|백설|청정원|동원|사조|하림|목우촌|진주햄|'
    r'스팸|롯데|빙그레|파스퇴르|상하목장|이마트|노브랜드|피코크|곰곰|탐스|TS|마미손|유한락스|'
    r'퍼실|다우니|스너글|닥터버틀|슈가버블|코디|'
    r'베지밀|정식품|삼육|연세우유|아이배냇|남양유업|일동후디스|앱솔루트|뉴트리|산들해|'
    r'하인즈|델몬트|돌|썬키스트|미닛메이드|트로피카나|칠성|웅진|광동|코카콜라|펩시|'
    r'종가집|대상|샘표|이금기|오타후쿠|리큐|아모레|LG|엘지)\s*',
    re.IGNORECASE,
)

# 제거할 마케팅/포장 수식어 (품질 구분이 아닌 것)
_NOISE_PATTERN = re.compile(
    r'(프리미엄|대용량|특대|기획|행사|할인|특가|엿날|골드|스페셜|클래식|레귤러|오리지널)\s*',
)

# 숫자만 있는 토큰 제거
_NUMBER_ONLY = re.compile(r'^\d+(\.\d+)?$')

# ★, *, ※ 등 특수문자 제거
_SPECIAL_CHARS = re.compile(r'[★☆※*·\[\]()（）]')


def normalize_local(name: str) -> str:
    """로컬 정규식 기반 정규화. 품질/종류 구분은 유지."""
    result = name.strip()

    # 특수문자 제거
    result = _SPECIAL_CHARS.sub(' ', result)

    # 단위 표현 제거
    result = _UNIT_PATTERN.sub(' ', result)

    # 브랜드 제거
    result = _BRAND_PATTERN.sub('', result)

    # 마케팅 수식어 제거
    result = _NOISE_PATTERN.sub('', result)

    # 남은 숫자 토큰 제거
    tokens = result.split()
    tokens = [t for t in tokens if not _NUMBER_ONLY.match(t)]
    result = ' '.join(tokens).strip()

    return result if result else name.strip()


async def normalize_with_gemini(name: str) -> str | None:
    """Gemini Flash로 식재료 이름 정규화. 품질/종류 구분 유지."""
    if not settings.gemini_api_key:
        return None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                f'다음 식재료 상품명을 정규화해주세요.\n\n'
                f'규칙:\n'
                f'- 브랜드명 제거 (서울우유, 풀무원, CJ 등)\n'
                f'- 용량/수량 제거 (600g, 1L, 3개입 등)\n'
                f'- 마케팅 수식어 제거 (프리미엄, 특대, 골드 등)\n'
                f'- 반드시 유지: 냉동/생, 한우/미국산/호주산/국내산, 등급(1등급), 부위(등심/갈비/삼겹살), 종류(저지방/무지방)\n'
                f'- 결과는 2-4단어로, 다른 텍스트 없이 이름만\n\n'
                f'예시:\n'
                f'국내산냉동엿날삼겹살 600g → 냉동 삼겹살\n'
                f'한우 등심 1등급 300g → 한우 등심 1등급\n'
                f'서울우유 1L → 우유\n'
                f'미국산 소고기 채끝 → 미국산 소고기 채끝\n'
                f'풀무원 순두부 → 순두부\n'
                f'저지방 우유 1L → 저지방 우유\n\n'
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
