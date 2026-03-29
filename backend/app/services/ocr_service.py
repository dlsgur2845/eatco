"""OCR 서비스 — CLOVA OCR 호출 또는 개발용 모킹.

    이미지 → CLOVA OCR API → 텍스트 라인 목록
    개발 모드(OCR_MOCK_MODE=true)에서는 API 호출 없이 더미 데이터 반환.
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


class OCRError(Exception):
    pass


async def scan_image(image_bytes: bytes, content_type: str = "image/jpeg") -> list[OCRLine]:
    """이미지를 OCR 처리하여 텍스트 라인 목록을 반환합니다."""
    if settings.ocr_mock_mode:
        return _mock_scan()

    return await _clova_scan(image_bytes, content_type)


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
    """개발용 모킹 — CLOVA API 호출 없이 더미 데이터 반환."""
    return [
        OCRLine(text="삼겹살 600g", confidence=0.95),
        OCRLine(text="서울우유 1L", confidence=0.92),
        OCRLine(text="풀무원 두부", confidence=0.88),
        OCRLine(text="시금치 한 단", confidence=0.90),
        OCRLine(text="양파 3개입", confidence=0.93),
        OCRLine(text="계란 30구", confidence=0.91),
        OCRLine(text="진라면 5개입", confidence=0.89),
    ]
