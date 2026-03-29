"""카테고리 매퍼 — OCR 텍스트를 식재료 카테고리에 매핑.

    storage_data.py의 221개 항목과 fuzzy matching으로 매핑.
    매칭 실패 시 '기타' 카테고리(냉장 5일) 기본값.

    매칭 전략 (storage_guide.py 로직 재활용):
    1. 각 OCR 텍스트에 대해 모든 키워드를 검색
    2. 가장 긴 키워드 매칭 우선 (longest match first)
    3. 매칭된 항목의 보관 기간 사용
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.services.ocr_service import OCRLine
from app.storage_data import STORAGE_GUIDES


@dataclass
class MappedItem:
    name: str
    matched_keyword: str | None
    storage_method: str  # refrigerated, frozen, room_temp
    shelf_life_days: int
    expiry_date: date
    confidence: float
    auto_matched: bool


# 기본값: 매칭 실패 시
DEFAULT_SHELF_LIFE_DAYS = 5
DEFAULT_STORAGE_METHOD = "refrigerated"

# 영수증에 자주 등장하지만 식재료가 아닌 텍스트 필터
NOISE_KEYWORDS = {
    "합계", "total", "부가세", "카드", "현금", "거스름", "영수증",
    "점포", "tel", "사업자", "대표", "주소", "전화", "매장",
    "결제", "승인", "할인", "포인트", "적립", "쿠폰", "배송",
    "감사", "이용", "방문", "주문", "배달", "택배",
}


def map_ocr_results(ocr_lines: list[OCRLine]) -> list[MappedItem]:
    """OCR 라인 목록을 MappedItem 목록으로 변환."""
    items: list[MappedItem] = []
    today = date.today()

    for line in ocr_lines:
        text = line.text.strip()
        if not text or len(text) < 2:
            continue

        text_lower = text.lower()

        # 노이즈 필터링
        if any(noise in text_lower for noise in NOISE_KEYWORDS):
            continue

        # 숫자만으로 구성된 라인 스킵 (가격, 수량 등)
        if text.replace(",", "").replace(".", "").replace(" ", "").isdigit():
            continue

        # storage_data에서 매칭
        match = _find_best_match(text_lower)

        if match:
            guide = match
            # 보관 방법 + 기간 결정: 냉장 > 실온 > 냉동 순 우선
            if guide.get("refrigerated_days"):
                method = "refrigerated"
                days = guide["refrigerated_days"]
            elif guide.get("room_temp_days"):
                method = "room_temp"
                days = guide["room_temp_days"]
            elif guide.get("frozen_days"):
                method = "frozen"
                days = guide["frozen_days"]
            else:
                method = DEFAULT_STORAGE_METHOD
                days = DEFAULT_SHELF_LIFE_DAYS

            items.append(MappedItem(
                name=text,
                matched_keyword=guide["keyword"],
                storage_method=method,
                shelf_life_days=days,
                expiry_date=today + timedelta(days=days),
                confidence=line.confidence,
                auto_matched=True,
            ))
        else:
            items.append(MappedItem(
                name=text,
                matched_keyword=None,
                storage_method=DEFAULT_STORAGE_METHOD,
                shelf_life_days=DEFAULT_SHELF_LIFE_DAYS,
                expiry_date=today + timedelta(days=DEFAULT_SHELF_LIFE_DAYS),
                confidence=line.confidence,
                auto_matched=False,
            ))

    return items


def _find_best_match(text_lower: str) -> dict | None:
    """storage_data에서 가장 긴 키워드 매칭을 찾습니다."""
    best_match = None
    best_len = 0

    for guide in STORAGE_GUIDES:
        all_keywords = [guide["keyword"]]
        if guide.get("keywords"):
            if isinstance(guide["keywords"], list):
                all_keywords.extend(guide["keywords"])
            elif isinstance(guide["keywords"], str):
                all_keywords.extend(k.strip() for k in guide["keywords"].split(","))

        for kw in all_keywords:
            kw_lower = kw.strip().lower()
            if len(kw_lower) >= 2 and kw_lower in text_lower and len(kw_lower) > best_len:
                best_match = guide
                best_len = len(kw_lower)

    return best_match
