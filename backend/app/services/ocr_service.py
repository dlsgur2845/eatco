"""OCR 서비스 — Gemini Flash 기반 영수증 인식 (CLOVA OCR fallback).

    이미지 → Gemini Flash → 식재료 목록 (JSON)
    Gemini가 식재료/비식재료를 직접 판별하므로 category_mapper 불필요.
    개발 모드(ocr_provider=mock)에서는 API 호출 없이 더미 데이터 반환.
"""

import base64
import json
import uuid
from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class OCRLine:
    text: str
    confidence: float = 0.0


@dataclass
class GeminiItem:
    """Gemini가 직접 추출한 식재료 항목."""
    name: str
    quantity: str | None = None
    price: int | None = None
    storage_method: str = "refrigerated"
    shelf_life_days: int = 5
    confidence: float = 0.9


class OCRError(Exception):
    pass


GEMINI_PROMPT = """이 영수증 이미지에서 **식재료만** 추출해주세요.

규칙:
1. 세제, 생활용품, 위생용품, 주방용품 등 식재료가 아닌 항목은 제외
2. name은 브랜드/용량을 제거하되, 품질/종류 구분은 반드시 유지:
   - 유지: 냉동/생, 한우/미국산/호주산, 부위(등심/갈비/삼겹살), 종류(저지방/무지방), 등급
   - 제거: 브랜드(서울우유, 풀무원, CJ 등), 용량(600g, 1L), 마케팅 수식어(프리미엄, 골드)
   - 예: "국내산냉동엿날삼겹살 600g" → "냉동 삼겹살", "한우 등심 1등급 300g" → "한우 등심 1등급"
3. 수량과 가격이 있으면 포함
4. 각 식재료의 적절한 보관 방법을 판단: refrigerated(냉장), frozen(냉동), room_temp(실온)
5. 보관 일수를 추정 (냉장 기준 일반적인 소비기한)
6. 영수증 상단에 매장명(마트/편의점 이름)이 있으면 store_name으로 추출

JSON 객체로 응답하세요. 다른 텍스트 없이 JSON만 반환:
{
  "store_name": "매장명 또는 null",
  "items": [
    {
      "name": "식재료 이름 (품질/종류 구분 유지)",
      "quantity": "수량 (예: 1kg, 2개, 1L) 또는 null",
      "price": 가격(숫자) 또는 null,
      "storage_method": "refrigerated|frozen|room_temp",
      "shelf_life_days": 숫자
    }
  ]
}

식재료가 없으면 items를 빈 배열로 반환하세요."""


async def scan_image(image_bytes: bytes, content_type: str = "image/jpeg") -> list[OCRLine]:
    """이미지를 OCR 처리하여 텍스트 라인 목록을 반환합니다. (CLOVA/mock 호환)"""
    provider = settings.ocr_provider

    if provider == "mock" or settings.ocr_mock_mode:
        return _mock_scan()

    if provider == "clova":
        return await _clova_scan(image_bytes, content_type)

    # gemini는 scan_image_gemini를 직접 호출
    raise OCRError("Gemini는 scan_image_gemini()를 사용하세요.")


@dataclass
class GeminiScanResult:
    """Gemini 스캔 결과 — 매장명 + 식재료 목록."""
    store_name: str | None
    items: list[GeminiItem]


async def scan_image_gemini(image_bytes: bytes, content_type: str = "image/jpeg") -> GeminiScanResult:
    """Gemini Flash로 영수증에서 매장명 + 식재료를 직접 추출합니다."""
    if not settings.gemini_api_key:
        raise OCRError("Gemini API 키가 설정되지 않았습니다. .env에 GEMINI_API_KEY를 추가하세요.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=content_type),
                GEMINI_PROMPT,
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        raise OCRError(f"Gemini API 오류: {str(e)}")

    text = response.text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise OCRError("Gemini 응답을 파싱할 수 없습니다.")

    # 새 형식: { store_name, items: [...] }
    if isinstance(parsed, dict) and "items" in parsed:
        store_name = parsed.get("store_name")
        entries = parsed["items"]
    elif isinstance(parsed, list):
        # 이전 형식 호환
        store_name = None
        entries = parsed
    else:
        raise OCRError("Gemini 응답 형식이 올바르지 않습니다.")

    items: list[GeminiItem] = []
    for entry in entries:
        if not isinstance(entry, dict) or "name" not in entry:
            continue
        items.append(GeminiItem(
            name=entry["name"],
            quantity=entry.get("quantity"),
            price=entry.get("price"),
            storage_method=entry.get("storage_method", "refrigerated"),
            shelf_life_days=entry.get("shelf_life_days", 5),
            confidence=0.9,
        ))

    return GeminiScanResult(store_name=store_name, items=items)


async def _clova_scan(image_bytes: bytes, content_type: str) -> list[OCRLine]:
    """Naver CLOVA OCR API 호출."""
    if not settings.clova_ocr_api_url or not settings.clova_ocr_secret_key:
        raise OCRError("CLOVA OCR API가 설정되지 않았습니다.")

    ext = "jpg" if "jpeg" in content_type else content_type.split("/")[-1]
    payload = {
        "version": "V2",
        "requestId": str(uuid.uuid4()),
        "timestamp": 0,
        "images": [
            {
                "format": ext,
                "data": base64.b64encode(image_bytes).decode("utf-8"),
                "name": "receipt",
            }
        ],
    }

    headers = {"X-OCR-SECRET": settings.clova_ocr_secret_key}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                settings.clova_ocr_api_url,
                json=payload,
                headers=headers,
            )
        except httpx.TimeoutException:
            raise OCRError("OCR 서비스 응답 시간이 초과되었습니다. 다시 시도해주세요.")

        if resp.status_code == 429:
            raise OCRError("OCR 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.")
        if resp.status_code != 200:
            raise OCRError(f"OCR 서비스 오류: {resp.status_code}")

    data = resp.json()
    lines: list[OCRLine] = []

    for image in data.get("images", []):
        for field in image.get("fields", []):
            text = field.get("inferText", "").strip()
            conf = field.get("inferConfidence", 0.0)
            if text and len(text) >= 2:
                lines.append(OCRLine(text=text, confidence=conf))

    return lines


def _mock_scan() -> list[OCRLine]:
    """개발용 모킹 — API 호출 없이 더미 데이터 반환."""
    return [
        OCRLine(text="삼겹살 600g", confidence=0.95),
        OCRLine(text="서울우유 1L", confidence=0.92),
        OCRLine(text="풀무원 두부", confidence=0.88),
        OCRLine(text="시금치 한 단", confidence=0.90),
        OCRLine(text="양파 3개입", confidence=0.93),
        OCRLine(text="계란 30구", confidence=0.91),
        OCRLine(text="진라면 5개입", confidence=0.89),
    ]
