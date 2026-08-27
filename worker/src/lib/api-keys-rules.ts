/**
 * 가족 API 키 선택 규칙 — **DB 타입이 하나도 없는 순수 함수만.**
 *
 * `family-reset-rules.ts` 와 같은 이유로 파일을 나눈다: 프론트엔드가 그대로
 * import 하는데 `D1Database` 가 있으면 빌드가 깨진다. 워커에 테스트 러너가
 * 없으므로 이 파일이 프론트 vitest 로 검증된다.
 *
 * **이 기능이 푸는 문제와 안 푸는 문제를 헷갈리지 말 것.**
 * 푸는 것: 비용과 할당량을 가족끼리 나눈다. 앱이 요금을 안 낸다.
 * 안 푸는 것: **Gemini 지역차단.** 그건 누구 키냐가 아니라 워커가 어디서
 * 실행되느냐의 문제라, 개인 키로 바꿔도 그대로다 (2026-08-27 HKG 실측).
 */

export type KeyStrategy = 'least_used' | 'priority'

export interface KeyRow {
  id: string
  provider: string
  /** 제공자 호출 수. 스캔 수가 아니다 — 5장 스캔은 5회다. */
  calls: number
  /** 「순서 지정」 모드의 순위. 낮을수록 먼저. null 은 맨 뒤. */
  priority: number | null
  /** 0/1. SQLite 에 boolean 이 없다. */
  disabled: number
  /** 이 시각까지 쉰다. 429 를 맞으면 채워진다. */
  cooldown_until: string | null
}

/** 지금 쓸 수 있는 키인가. */
export function isAvailable(k: KeyRow, now: Date): boolean {
  if (k.disabled) return false
  if (!k.cooldown_until) return true
  const t = Date.parse(k.cooldown_until)
  // 못 읽는 값 때문에 멀쩡한 키를 영구히 버리지 않는다.
  if (Number.isNaN(t)) return true
  return t <= now.getTime()
}

/**
 * 전략에 따라 키 하나를 고른다. 쓸 수 있는 키가 없으면 null.
 *
 * **동점은 항상 id 로 깬다.** 안 그러면 같은 입력에 다른 답이 나와서
 * 테스트가 흔들리고, 실제로도 한 키에 쏠릴 수 있다.
 */
export function pickKey(keys: KeyRow[], strategy: KeyStrategy, now: Date): KeyRow | null {
  const usable = keys.filter((k) => isAvailable(k, now))
  if (!usable.length) return null

  const sorted = [...usable].sort((a, b) => {
    if (strategy === 'priority') {
      // null 은 맨 뒤. Infinity 로 바꿔서 비교한다.
      const pa = a.priority ?? Number.POSITIVE_INFINITY
      const pb = b.priority ?? Number.POSITIVE_INFINITY
      if (pa !== pb) return pa - pb
      // 같은 순위면 적게 쓴 쪽부터 — 순위를 안 매긴 키들끼리도 공평해진다.
      if (a.calls !== b.calls) return a.calls - b.calls
      return a.id < b.id ? -1 : 1
    }
    // least_used: 누적 호출이 적은 쪽부터.
    // **누적으로 세는 게 핵심이다.** 월 초기화를 하면 나중에 추가된 키가
    // 따라잡을 기회가 사라져서 라운드로빈과 같아진다.
    if (a.calls !== b.calls) return a.calls - b.calls
    return a.id < b.id ? -1 : 1
  })

  return sorted[0]
}

/** 429 를 맞으면 얼마나 쉬나. 다른 오류는 쿨다운을 안 건다. */
export const COOLDOWN_MINUTES = 5

export function cooldownFor(status: number, now: Date): string | null {
  if (status !== 429) return null
  return new Date(now.getTime() + COOLDOWN_MINUTES * 60_000).toISOString()
}

/**
 * 이 오류면 키를 꺼야 하나.
 *
 * 401·403 은 키가 틀렸거나 폐기됐다는 뜻이라 다시 시도해봐야 소용없다.
 * 429 는 잠깐 쉬면 되고, 5xx 는 제공자 사정이라 키 탓이 아니다.
 *
 * **400 이 함정이다.** Gemini 는 잘못된 키에 401 이 아니라
 * `400 API_KEY_INVALID` 를 준다(실측). 상태코드만 보면 안 걸려서 고장난 키가
 * 계속 뽑히고 스캔의 절반이 영구히 실패한다. 그렇다고 400 전체를 끄면
 * 잘못된 요청(이미지 형식 등) 때문에 멀쩡한 키가 꺼진다 — 본문을 봐야 한다.
 */
export function shouldDisable(status: number, detail?: string): boolean {
  if (status === 401 || status === 403) return true
  if (status === 400 && detail && /API_KEY_INVALID|API key not valid/i.test(detail)) return true
  return false
}

/**
 * 화면에 보여줄 마스킹. 뒤 4자만 남긴다.
 *
 * 설정 화면에서 키를 다시 읽을 수 없게 하려면 저장 시점에 이걸 만들어
 * 따로 보관해야 한다 — 암호문에서는 복호화 없이 못 만든다.
 */
export function maskKey(plain: string): string {
  const tail = plain.trim().slice(-4)
  return tail ? `••••${tail}` : '••••'
}

/** 제공자 이름 표시용. 모르는 값이 와도 화면이 안 깨지게 그대로 돌려준다. */
export const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'Gemini',
  anthropic: 'Claude',
  openai: 'GPT',
}

export function providerLabel(p: string): string {
  return PROVIDER_LABEL[p] ?? p
}
