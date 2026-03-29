"""레시피 추천 서비스 — 식품안전나라 API + 재료 매칭.

    냉장고 재료 → API 검색 → 매칭률 계산 → 상위 3개 추천.
    API 실패 시 하드코딩된 인기 레시피 10개로 fallback.

    API: 식품안전나라 COOKRCP01
    URL: http://openapi.foodsafetykorea.go.kr/api/{KEY}/COOKRCP01/json/{start}/{end}
    총 레시피: 1,146개
"""

import re
import time
from dataclasses import dataclass, field

import httpx

from app.config import settings

# --- 재료 텍스트 전처리 ---

# 조리법 접두사 제거 (다진, 썬, 채썬 등)
COOKING_PREFIXES = re.compile(r'^(다진|썬|채썬|간|삶은|데친|볶은|구운|찐|튀긴)\s*')
# 수량/단위 제거 (75g, 3/4모, 1큰술 등)
QUANTITY_PATTERN = re.compile(r'\s*[\d/.]+\s*(g|kg|ml|L|개|모|마리|줄기|큰술|작은술|쪽|cm|장|컵|봉지|포기).*$')
# 괄호 제거
PAREN_PATTERN = re.compile(r'\([^)]*\)')


def _normalize_ingredient(text: str) -> str:
    """재료 텍스트를 정규화하여 핵심 재료명만 추출."""
    text = text.strip()
    text = PAREN_PATTERN.sub('', text)
    text = QUANTITY_PATTERN.sub('', text)
    text = COOKING_PREFIXES.sub('', text)
    text = re.sub(r'\d+', '', text)
    text = text.strip(' ,.')
    return text


def _extract_ingredients(parts_text: str) -> list[str]:
    """RCP_PARTS_DTLS 필드에서 재료명 목록을 추출."""
    ingredients = []
    for line in parts_text.replace('\n', ',').split(','):
        line = line.strip()
        if not line or len(line) < 2:
            continue
        # 섹션 제목 스킵 (양념장, 고명, 소스 등)
        if line.endswith(':') or line.startswith('●') or line.startswith('·'):
            line = line.lstrip('●·').rstrip(':').strip()
            if len(line) < 2:
                continue
        name = _normalize_ingredient(line)
        if name and len(name) >= 2:
            ingredients.append(name)
    return ingredients


# --- 매칭 ---

@dataclass
class RecipeMatch:
    name: str
    category: str
    cooking_method: str
    calories: str
    image_url: str
    ingredients: list[str]
    manual_steps: list[str]
    manual_images: list[str]
    tip: str
    match_count: int = 0
    total_ingredients: int = 0
    match_ratio: float = 0.0
    matched_items: list[str] = field(default_factory=list)
    missing_items: list[str] = field(default_factory=list)
    urgent_used: list[str] = field(default_factory=list)


def _compute_match(recipe_ingredients: list[str], fridge_items: list[str], urgent_items: list[str]) -> dict:
    """냉장고 재료와 레시피 재료의 매칭률을 계산."""
    matched = []
    missing = []
    urgent_used = []

    for ri in recipe_ingredients:
        ri_lower = ri.lower()
        found = False
        for fi in fridge_items:
            fi_lower = fi.lower()
            if fi_lower in ri_lower or ri_lower in fi_lower:
                matched.append(ri)
                if fi in urgent_items:
                    urgent_used.append(fi)
                found = True
                break
        if not found:
            missing.append(ri)

    total = len(recipe_ingredients) if recipe_ingredients else 1
    return {
        "matched": matched,
        "missing": missing,
        "urgent_used": urgent_used,
        "match_count": len(matched),
        "total": total,
        "ratio": len(matched) / total,
    }


# --- API 호출 + 캐싱 ---

_cache: dict[str, tuple[float, list[dict]]] = {}
CACHE_TTL = 86400  # 24시간


async def search_recipes(keyword: str) -> list[dict]:
    """식품안전나라 API에서 레시피를 검색. 캐싱 적용."""
    cache_key = keyword.lower().strip()
    now = time.time()

    if cache_key in _cache:
        ts, data = _cache[cache_key]
        if now - ts < CACHE_TTL:
            return data

    if not settings.recipe_api_key:
        return []

    url = f"http://openapi.foodsafetykorea.go.kr/api/{settings.recipe_api_key}/COOKRCP01/json/1/20"
    if keyword:
        url += f"/RCP_PARTS_DTLS={keyword}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return []
            data = resp.json()
            rows = data.get("COOKRCP01", {}).get("row", [])
            _cache[cache_key] = (now, rows)
            return rows
    except (httpx.TimeoutException, httpx.HTTPError, Exception):
        return []


def _parse_recipe(row: dict) -> dict:
    """API 응답 row를 파싱."""
    steps = []
    step_images = []
    for i in range(1, 21):
        step = row.get(f"MANUAL{i:02d}", "").strip()
        img = row.get(f"MANUAL_IMG{i:02d}", "").strip()
        if step:
            # 끝에 붙는 a, b, c 등 제거
            step = re.sub(r'[a-z]$', '', step).strip()
            steps.append(step)
            step_images.append(img)

    return {
        "name": row.get("RCP_NM", ""),
        "category": row.get("RCP_PAT2", ""),
        "cooking_method": row.get("RCP_WAY2", ""),
        "calories": row.get("INFO_ENG", ""),
        "image_url": row.get("ATT_FILE_NO_MAIN", ""),
        "parts_raw": row.get("RCP_PARTS_DTLS", ""),
        "ingredients": _extract_ingredients(row.get("RCP_PARTS_DTLS", "")),
        "manual_steps": steps,
        "manual_images": step_images,
        "tip": row.get("RCP_NA_TIP", ""),
    }


# --- 추천 메인 함수 ---

async def recommend_recipes(
    fridge_items: list[str],
    urgent_items: list[str],
    top_n: int = 3,
) -> list[RecipeMatch]:
    """냉장고 재료 기반 레시피 추천. 긴급 재료 우선."""
    # 검색 키워드: 긴급 재료 우선, 없으면 전체 중 상위 2개, 비어있으면 기본 검색어
    if urgent_items:
        search_keywords = urgent_items[:2]
    elif fridge_items:
        search_keywords = fridge_items[:2]
    else:
        search_keywords = ["김치찌개", "계란"]  # 기본 인기 레시피

    all_recipes = []
    for kw in search_keywords:
        rows = await search_recipes(kw)
        all_recipes.extend(rows)

    # API 실패 시 fallback
    if not all_recipes:
        return _fallback_recipes(fridge_items, urgent_items, top_n)

    # 중복 제거 (이름 기준)
    seen = set()
    unique = []
    for row in all_recipes:
        name = row.get("RCP_NM", "")
        if name not in seen:
            seen.add(name)
            unique.append(row)

    # 매칭률 계산
    results = []
    for row in unique:
        parsed = _parse_recipe(row)
        match = _compute_match(parsed["ingredients"], fridge_items, urgent_items)

        # 냉장고에 재료가 있을 때만 매칭 0인 레시피 스킵
        if match["match_count"] == 0 and fridge_items:
            continue

        results.append(RecipeMatch(
            name=parsed["name"],
            category=parsed["category"],
            cooking_method=parsed["cooking_method"],
            calories=parsed["calories"],
            image_url=parsed["image_url"],
            ingredients=parsed["ingredients"],
            manual_steps=parsed["manual_steps"],
            manual_images=parsed["manual_images"],
            tip=parsed["tip"],
            match_count=match["match_count"],
            total_ingredients=match["total"],
            match_ratio=match["ratio"],
            matched_items=match["matched"],
            missing_items=match["missing"],
            urgent_used=match["urgent_used"],
        ))

    # 정렬: 긴급 재료 활용 > 매칭률
    results.sort(key=lambda r: (len(r.urgent_used), r.match_ratio), reverse=True)
    return results[:top_n]


# --- Fallback 인기 레시피 ---

POPULAR_RECIPES = [
    {"name": "김치찌개", "ingredients": ["김치", "돼지고기", "두부", "대파", "고추"], "category": "국/탕", "method": "끓이기", "cal": "200", "steps": ["김치를 먹기 좋게 썬다", "돼지고기를 볶는다", "물을 붓고 끓인다", "두부와 대파를 넣는다"]},
    {"name": "된장찌개", "ingredients": ["된장", "두부", "감자", "양파", "대파", "호박"], "category": "국/탕", "method": "끓이기", "cal": "150", "steps": ["감자와 호박을 깍둑썬다", "멸치 육수에 된장을 풀어 끓인다", "감자가 익으면 두부, 양파를 넣는다", "대파를 넣고 마무리"]},
    {"name": "제육볶음", "ingredients": ["돼지고기", "양파", "대파", "고추장", "고추"], "category": "반찬", "method": "볶기", "cal": "350", "steps": ["돼지고기를 양념에 재운다", "팬에 기름을 두르고 볶는다", "양파, 대파를 넣고 같이 볶는다"]},
    {"name": "계란말이", "ingredients": ["달걀", "대파", "당근", "소금"], "category": "반찬", "method": "부치기", "cal": "180", "steps": ["달걀을 풀어 대파, 당근을 넣는다", "팬에 기름을 두르고 얇게 부친다", "말아가며 익힌다"]},
    {"name": "미역국", "ingredients": ["미역", "소고기", "참기름", "간장", "마늘"], "category": "국/탕", "method": "끓이기", "cal": "120", "steps": ["미역을 불린다", "소고기를 참기름에 볶는다", "물을 붓고 끓인다", "간장과 마늘로 간을 한다"]},
    {"name": "볶음밥", "ingredients": ["밥", "달걀", "양파", "당근", "대파", "간장"], "category": "일품", "method": "볶기", "cal": "400", "steps": ["채소를 잘게 썬다", "달걀을 스크램블한다", "밥과 채소를 함께 볶는다", "간장으로 간을 한다"]},
    {"name": "닭볶음탕", "ingredients": ["닭고기", "감자", "양파", "당근", "대파", "고추장"], "category": "반찬", "method": "볶기", "cal": "300", "steps": ["닭을 손질하고 양념장을 만든다", "감자, 당근, 양파를 넣고 끓인다", "닭이 익으면 대파를 넣는다"]},
    {"name": "두부조림", "ingredients": ["두부", "간장", "고추", "대파", "마늘"], "category": "반찬", "method": "조리기", "cal": "130", "steps": ["두부를 도톰하게 썰어 팬에 굽는다", "간장, 마늘, 고추로 양념을 만든다", "두부에 양념을 끼얹고 조린다"]},
    {"name": "잡채", "ingredients": ["당면", "시금치", "당근", "양파", "소고기", "버섯"], "category": "반찬", "method": "볶기", "cal": "280", "steps": ["당면을 삶는다", "채소와 소고기를 각각 볶는다", "모든 재료를 합쳐 양념과 버무린다"]},
    {"name": "감자조림", "ingredients": ["감자", "간장", "설탕", "마늘"], "category": "반찬", "method": "조리기", "cal": "160", "steps": ["감자를 깍둑썬다", "간장, 설탕, 물을 넣고 조린다", "감자가 익으면 마무리"]},
]


def _fallback_recipes(
    fridge_items: list[str],
    urgent_items: list[str],
    top_n: int = 3,
) -> list[RecipeMatch]:
    """API 실패 시 하드코딩된 인기 레시피에서 추천."""
    results = []
    for r in POPULAR_RECIPES:
        match = _compute_match(r["ingredients"], fridge_items, urgent_items)
        # 냉장고에 재료가 있을 때만 매칭 0 스킵, 비어있으면 전부 보여줌
        if match["match_count"] == 0 and fridge_items:
            continue
        results.append(RecipeMatch(
            name=r["name"],
            category=r["category"],
            cooking_method=r["method"],
            calories=r["cal"],
            image_url="",
            ingredients=r["ingredients"],
            manual_steps=r["steps"],
            manual_images=[],
            tip="",
            match_count=match["match_count"],
            total_ingredients=match["total"],
            match_ratio=match["ratio"],
            matched_items=match["matched"],
            missing_items=match["missing"],
            urgent_used=match["urgent_used"],
        ))

    results.sort(key=lambda r: (len(r.urgent_used), r.match_ratio), reverse=True)
    return results[:top_n]
