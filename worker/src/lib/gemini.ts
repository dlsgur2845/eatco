import { ApiError } from './errors'
import type { Env } from './types'

/**
 * Gemini REST 클라이언트 — Python 판(app/services/gemini.py)의 직역.
 * SDK 대신 REST 를 쓴 덕에 런타임만 바꿔서 그대로 옮겨왔다.
 *
 * 실패를 구분한다:
 *   404  모델 소멸 -> error 로그 + 다음 폴백 모델
 *   429/5xx 일시 장애 -> 재시도 후 폴백
 *   그 외 -> 즉시 실패 (폴백해도 같은 결과)
 * 조용히 null 을 반환하지 않는다. gemini-2.0-flash 가 종료됐을 때 3곳이
 * 조용히 죽어도 아무도 몰랐던 게 이 프로젝트의 핵심 사고였다.
 */

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models'
const TRANSIENT = new Set([429, 500, 502, 503, 504])

const DEFAULT_VISION = 'gemini-3.5-flash,gemini-2.5-flash'
const DEFAULT_FAST = 'gemini-3.5-flash-lite,gemini-2.5-flash-lite'

export function visionModels(env: Env): string[] {
  return (env.GEMINI_MODELS_VISION || DEFAULT_VISION).split(',').map((s) => s.trim()).filter(Boolean)
}
export function fastModels(env: Env): string[] {
  return (env.GEMINI_MODELS_FAST || DEFAULT_FAST).split(',').map((s) => s.trim()).filter(Boolean)
}

export interface InlineImage {
  kind: 'image'
  data: ArrayBuffer
  mimeType: string
}
export type Part = string | InlineImage

function toApiPart(p: Part): unknown {
  if (typeof p === 'string') return { text: p }
  return { inline_data: { mime_type: p.mimeType, data: bytesToBase64(p.data) } }
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

interface GenerateOpts {
  models: string[]
  temperature?: number
  jsonMode?: boolean
  timeoutMs?: number
}

export async function generate(env: Env, parts: Part[], opts: GenerateOpts): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new ApiError(503, 'AI 기능이 설정되지 않았습니다. 관리자에게 문의해주세요.')
  }
  const { models, temperature = 0, jsonMode = false, timeoutMs = 30_000 } = opts
  if (!models.length) throw new ApiError(500, '호출할 모델이 지정되지 않았습니다.')

  const generationConfig: Record<string, unknown> = { temperature }
  if (jsonMode) generationConfig.responseMimeType = 'application/json'

  const payload = JSON.stringify({
    contents: [{ parts: parts.map(toApiPart) }],
    generationConfig,
  })
  const headers = {
    'x-goog-api-key': env.GEMINI_API_KEY,
    'Content-Type': 'application/json',
  }

  let lastError = ''

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response
      try {
        res = await fetch(`${API_ROOT}/${model}:generateContent`, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (e) {
        lastError = `${model}: ${e instanceof Error ? e.name : 'fetch failed'}`
        console.warn(`Gemini 연결 실패 (${model}, 시도 ${attempt + 1}):`, e)
        if (attempt === 0) continue
        break
      }

      if (res.ok) return extractText(await res.json())

      if (res.status === 404) {
        console.error(
          `Gemini 모델 '${model}' 이(가) 존재하지 않습니다 (404). GEMINI_MODELS_* 설정을 갱신하세요.`,
        )
        lastError = `${model}: not found`
        break // 다음 폴백 모델
      }
      if (TRANSIENT.has(res.status)) {
        lastError = `${model}: HTTP ${res.status}`
        console.warn(`Gemini 일시 오류 (${model}, HTTP ${res.status}, 시도 ${attempt + 1})`)
        if (attempt === 0) continue
        break
      }
      const detail = (await res.text()).slice(0, 200)
      console.error(`Gemini 호출 실패 (${model}, HTTP ${res.status}): ${detail}`)
      throw new ApiError(503, `AI 요청이 거부되었습니다 (HTTP ${res.status}).`)
    }
  }

  console.error('Gemini 전체 폴백 실패:', lastError)
  throw new ApiError(503, 'AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.')
}

function extractText(body: unknown): string {
  const b = body as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    promptFeedback?: { blockReason?: string }
  }
  const cands = b.candidates ?? []
  if (!cands.length) {
    if (b.promptFeedback?.blockReason) throw new ApiError(503, 'AI 가 이 요청을 처리할 수 없습니다.')
    throw new ApiError(503, 'AI 응답이 비어 있습니다.')
  }
  const text = (cands[0].content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (!text) throw new ApiError(503, 'AI 응답이 비어 있습니다.')
  return text
}

export async function generateJson<T = unknown>(
  env: Env,
  parts: Part[],
  opts: Omit<GenerateOpts, 'jsonMode'>,
): Promise<T> {
  const text = await generate(env, parts, { ...opts, jsonMode: true })
  try {
    return JSON.parse(text) as T
  } catch {
    console.warn('Gemini JSON 파싱 실패:', text.slice(0, 200))
    throw new ApiError(503, 'AI 응답을 해석할 수 없습니다.')
  }
}
