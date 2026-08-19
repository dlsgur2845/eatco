"""Gemini REST 클라이언트 — google-genai SDK 대체.

SDK 대신 REST 를 쓰는 이유:
1. SDK 의 generate_content 는 **동기** 함수다. `async def` 안에서 그대로 부르면
   응답이 올 때까지 이벤트 루프 전체가 멈춘다. 영수증 스캔 한 번에 가족 전원이 대기했다.
2. 모델 ID 가 4개 파일에 하드코딩돼 있어서 gemini-2.0-flash 가 종료됐을 때
   3곳이 조용히 죽었는데 아무도 몰랐다. 이제 config 한 곳에서만 관리한다.
3. 호출부가 httpx 로 단순해져서 나중에 다른 런타임으로 옮길 때 그대로 이식된다.

실패를 구분한다:
- 404 / NOT_FOUND        → 모델이 없어짐. 폴백 모델로 넘어가고 **경고 로그**를 남긴다.
- 429 / 503 / UNAVAILABLE → 일시적. 짧게 재시도한 뒤 폴백.
- 그 외                   → GeminiError 로 올린다.
조용히 None 을 반환하지 않는다. 죽은 걸 모르는 게 원래 문제였다.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

# 일시적 장애로 보고 재시도할 상태 코드
_TRANSIENT = {429, 500, 502, 503, 504}


class GeminiError(Exception):
    """호출부가 사용자에게 보여줄 수 있는 오류."""


class GeminiNotConfigured(GeminiError):
    """API 키 미설정."""


@dataclass
class InlineImage:
    data: bytes
    mime_type: str = "image/jpeg"


def _part(item: str | InlineImage) -> dict[str, Any]:
    if isinstance(item, InlineImage):
        return {
            "inline_data": {
                "mime_type": item.mime_type,
                "data": base64.b64encode(item.data).decode("ascii"),
            }
        }
    return {"text": item}


async def generate(
    parts: list[str | InlineImage],
    *,
    models: list[str],
    temperature: float = 0.0,
    json_mode: bool = False,
    timeout: float = 30.0,
    max_output_tokens: int | None = None,
) -> str:
    """models 를 순서대로 시도해서 첫 성공 응답의 텍스트를 반환한다.

    models 는 폴백 체인이다. 앞쪽이 우선.
    """
    if not settings.gemini_api_key:
        raise GeminiNotConfigured(
            "Gemini API 키가 설정되지 않았습니다. .env 에 GEMINI_API_KEY 를 추가하세요."
        )
    if not models:
        raise GeminiError("호출할 모델이 지정되지 않았습니다.")

    generation_config: dict[str, Any] = {"temperature": temperature}
    if json_mode:
        generation_config["responseMimeType"] = "application/json"
    if max_output_tokens is not None:
        generation_config["maxOutputTokens"] = max_output_tokens

    payload = {
        "contents": [{"parts": [_part(p) for p in parts]}],
        "generationConfig": generation_config,
    }
    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }

    last_error: str | None = None

    async with httpx.AsyncClient(timeout=timeout) as client:
        for model in models:
            url = f"{API_ROOT}/{model}:generateContent"
            for attempt in range(2):
                try:
                    resp = await client.post(url, json=payload, headers=headers)
                except httpx.TimeoutException:
                    last_error = f"{model}: timeout"
                    logger.warning("Gemini 타임아웃 (%s, 시도 %d)", model, attempt + 1)
                    if attempt == 0:
                        await asyncio.sleep(1.0)
                        continue
                    break
                except httpx.HTTPError as exc:
                    last_error = f"{model}: {exc}"
                    logger.warning("Gemini 연결 오류 (%s): %s", model, exc)
                    break

                if resp.status_code == 200:
                    return _extract_text(resp.json())

                if resp.status_code == 404:
                    # 모델이 사라졌다. 조용히 넘어가면 안 된다 — 설정을 고쳐야 한다.
                    logger.error(
                        "Gemini 모델 '%s' 이(가) 존재하지 않습니다 (404). "
                        "config 의 모델 설정을 갱신하세요.",
                        model,
                    )
                    last_error = f"{model}: not found"
                    break  # 다음 폴백 모델로

                if resp.status_code in _TRANSIENT:
                    last_error = f"{model}: HTTP {resp.status_code}"
                    logger.warning(
                        "Gemini 일시적 오류 (%s, HTTP %s, 시도 %d)",
                        model, resp.status_code, attempt + 1,
                    )
                    if attempt == 0:
                        await asyncio.sleep(2.0)
                        continue
                    break  # 다음 폴백 모델로

                # 그 외는 우리 잘못(400 등) — 폴백해도 같은 결과다.
                detail = resp.text[:200]
                logger.error("Gemini 호출 실패 (%s, HTTP %s): %s", model, resp.status_code, detail)
                raise GeminiError(f"AI 요청이 거부되었습니다 (HTTP {resp.status_code}).")

    logger.error("Gemini 전체 폴백 실패: %s", last_error)
    raise GeminiError("AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.")


def _extract_text(body: dict[str, Any]) -> str:
    candidates = body.get("candidates") or []
    if not candidates:
        feedback = body.get("promptFeedback", {})
        if feedback.get("blockReason"):
            raise GeminiError("AI 가 이 요청을 처리할 수 없습니다.")
        raise GeminiError("AI 응답이 비어 있습니다.")
    parts = candidates[0].get("content", {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise GeminiError("AI 응답이 비어 있습니다.")
    return text


async def generate_json(
    parts: list[str | InlineImage],
    *,
    models: list[str],
    temperature: float = 0.0,
    timeout: float = 30.0,
) -> Any:
    """generate() 후 JSON 파싱까지."""
    text = await generate(
        parts, models=models, temperature=temperature, json_mode=True, timeout=timeout
    )
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning("Gemini JSON 파싱 실패: %s", text[:200])
        raise GeminiError("AI 응답을 해석할 수 없습니다.") from exc
