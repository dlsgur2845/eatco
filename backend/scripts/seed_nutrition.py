"""Top 200 Korean ingredient nutrition seeder.

식약처 통합식품영양정보 API (공공데이터포털) 에서 top 200 재료를 조회해
`ingredient_nutrition` 테이블에 source="official" 로 선시드.

실행:
    python -m scripts.seed_nutrition

재실행 safe (idempotent) — 이미 `source="official"` 인 row 는 update, `source="user"`
는 절대 덮어쓰지 않음 (nutrition.py:_upsert_nutrition 의 guard).

공공 API key 가 없으면 skip (warning 만 출력).
"""

import asyncio
import logging

from app.database import async_session
from app.services.nutrition import _fetch_from_public_api, _upsert_nutrition

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 한국 가정식 top ~200. 빈번도 순이 아니라 카테고리 골고루.
# normalized_name 기준 (normalizer 출력과 맞춰야 함).
TOP_INGREDIENTS: list[str] = [
    # 곡물/가공
    "쌀", "현미", "보리", "귀리", "잡곡", "찹쌀", "흰쌀밥", "떡", "국수", "라면", "칼국수",
    "파스타", "스파게티", "밀가루", "빵", "식빵", "베이글", "토르티야",
    # 콩/두부/계란
    "콩", "두부", "순두부", "연두부", "비지", "낫토", "청국장", "된장", "고추장", "간장",
    "계란", "메추리알", "오리알",
    # 유제품
    "우유", "저지방 우유", "요거트", "치즈", "크림치즈", "모짜렐라", "파마산", "버터",
    "생크림", "연유",
    # 육류
    "소고기", "한우", "한우 등심", "한우 안심", "한우 갈비", "삼겹살", "목살", "앞다리살",
    "돼지갈비", "냉동 삼겹살", "닭가슴살", "닭다리", "닭날개", "닭안심", "닭고기",
    "오리고기", "양고기", "베이컨", "햄", "소시지", "스팸",
    # 수산물
    "고등어", "갈치", "삼치", "조기", "꽁치", "참치", "연어", "광어", "우럭", "도미",
    "새우", "오징어", "낙지", "주꾸미", "문어", "전복", "바지락", "홍합", "굴",
    "멸치", "다시마", "미역", "김", "파래", "톳",
    # 채소 (잎)
    "배추", "양배추", "상추", "깻잎", "시금치", "청경채", "부추", "쑥갓", "근대", "케일",
    "루꼴라", "로메인", "양상추",
    # 채소 (뿌리/줄기)
    "무", "당근", "감자", "고구마", "양파", "대파", "쪽파", "마늘", "생강", "연근", "우엉",
    "도라지", "더덕", "죽순",
    # 채소 (열매)
    "오이", "호박", "애호박", "단호박", "가지", "파프리카", "피망", "고추", "청양고추",
    "토마토", "방울토마토", "옥수수",
    # 버섯
    "표고버섯", "새송이버섯", "팽이버섯", "느타리버섯", "양송이버섯", "목이버섯", "만가닥버섯",
    # 과일
    "사과", "배", "감", "귤", "오렌지", "자몽", "레몬", "라임", "바나나", "포도", "키위",
    "딸기", "블루베리", "수박", "참외", "멜론", "복숭아", "자두", "체리", "망고", "파인애플",
    "아보카도",
    # 견과/씨앗
    "땅콩", "아몬드", "호두", "잣", "캐슈넛", "해바라기씨", "참깨", "들깨",
    # 기름/양념
    "식용유", "올리브유", "참기름", "들기름", "버터", "마요네즈", "케첩", "머스타드",
    "식초", "소금", "설탕", "꿀", "물엿", "고춧가루", "후추",
    # 김치/반찬
    "김치", "깍두기", "총각김치", "동치미", "오이소박이", "단무지", "장아찌",
]


async def main() -> None:
    unique: list[str] = []
    seen: set[str] = set()
    for name in TOP_INGREDIENTS:
        if name not in seen:
            seen.add(name)
            unique.append(name)
    logger.info("Seeding %d ingredients", len(unique))

    success = 0
    failed = 0
    async with async_session() as db:
        async with db.begin():
            for name in unique:
                data = await _fetch_from_public_api(name)
                if data is None:
                    failed += 1
                    logger.debug("miss: %s", name)
                    continue
                await _upsert_nutrition(db, name, data)
                success += 1
                logger.info("seeded: %s (kcal/100g=%s)", name, data.kcal_per_100g)
    logger.info("Seed done: %d success, %d failed", success, failed)


if __name__ == "__main__":
    asyncio.run(main())
