"""Gemini 기반 레시피 추천 — 냉장고 재료로 맞춤 레시피 생성.

    식품안전나라 API 대신 Gemini Flash로 레시피를 직접 생성.
    캐시: 같은 재료 조합이면 1시간 동안 재사용.
"""

import hashlib
import json
import time

from app.config import settings

# 캐시 (메모리, TTL 1시간)
_cache: dict[str, tuple[float, list]] = {}
CACHE_TTL = 3600


RECIPE_PROMPT = """냉장고에 있는 재료로 만들 수 있는 요리를 추천해주세요.

냉장고 재료: {fridge_items}
{urgent_section}

규칙:
1. 냉장고 재료를 최대한 활용하는 레시피 {matched_count}개 추천
2. 냉장고 재료와 무관하지만 인기 있는 한식 레시피 {extra_count}개 추가 추천
3. 각 레시피에 대해: 이름, 분류(반찬/국탕/일품/후식), 조리법, 칼로리(추정), 재료 목록, 조리 순서(3-5단계), 팁
4. 재료 목록은 한국 요리 기준 일반적인 재료명 사용
5. matched_items: 냉장고에 있는 재료, missing_items: 없는 재료

JSON 배열로 응답하세요. 다른 텍스트 없이 JSON만:
[
  {{
    "name": "요리 이름",
    "category": "반찬|국/탕|일품|후식|기타",
    "cooking_method": "볶기|끓이기|찌기|굽기|무치기|기타",
    "calories": "추정 칼로리 (숫자)",
    "ingredients": ["재료1", "재료2", ...],
    "manual_steps": ["1단계", "2단계", ...],
    "tip": "조리 팁 한 줄",
    "matched_items": ["냉장고에 있는 재료들"],
    "missing_items": ["없는 재료들"],
    "is_extra": false
  }}
]

is_extra가 true인 레시피는 냉장고 재료와 무관한 추가 추천입니다."""


async def generate_recipes(
    fridge_items: list[str],
    urgent_items: list[str],
    matched_count: int = 5,
    extra_count: int = 3,
) -> list[dict]:
    """Gemini Flash로 레시피를 생성합니다."""
    if not settings.gemini_api_key:
        return []

    # 캐시 키 생성
    cache_key = hashlib.md5(
        json.dumps(sorted(fridge_items), ensure_ascii=False).encode()
    ).hexdigest()

    now = time.time()
    if cache_key in _cache:
        ts, data = _cache[cache_key]
        if now - ts < CACHE_TTL:
            return data

    urgent_section = ""
    if urgent_items:
        urgent_section = f"유통기한 임박 재료 (우선 활용): {', '.join(urgent_items)}"

    prompt = RECIPE_PROMPT.format(
        fridge_items=", ".join(fridge_items),
        urgent_section=urgent_section,
        matched_count=matched_count,
        extra_count=extra_count,
    )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt],
            config=types.GenerateContentConfig(
                temperature=0.7,
                response_mime_type="application/json",
            ),
        )

        text = response.text.strip()
        parsed = json.loads(text)

        if not isinstance(parsed, list):
            return []

        _cache[cache_key] = (now, parsed)
        return parsed

    except Exception:
        return []
