/**
 * 초기화 규칙 — **DB 타입이 하나도 없는 순수 함수만.**
 *
 * 왜 파일을 나눴나: 프론트엔드가 이걸 그대로 import 한다. `family-reset.ts` 는
 * `D1Database`·`D1PreparedStatement` 를 쓰는데 프론트 tsconfig 에는 Workers 타입이
 * 없어서 빌드가 깨진다(실측: "Cannot find name 'D1Database'").
 * `nickname.ts`·`korean.ts` 가 프론트/워커에 공유되는 것과 같은 이유다.
 *
 * 워커에 테스트 러너가 없으므로 이 파일이 프론트 vitest 로 검증된다.
 */

/** 전원이 동의했나. 구성원 집합 기준이며, 남는 동의(탈퇴자)는 무시한다. */
export function allConsented(memberIds: string[], consentedIds: string[]): boolean {
  if (memberIds.length === 0) return false
  const agreed = new Set(consentedIds)
  return memberIds.every((id) => agreed.has(id))
}

/**
 * 요청 시점과 지금의 구성원이 다른가.
 *
 * 순서만 다른 건 같은 것으로 본다 — DB 정렬이 바뀌었다고 동의가 깨지면 안 된다.
 */
export function membershipChanged(snapshot: string[], current: string[]): boolean {
  if (snapshot.length !== current.length) return true
  const a = [...snapshot].sort()
  const b = [...current].sort()
  return a.some((id, i) => id !== b[i])
}

/** 만료됐나. 문자열 비교가 아니라 시각으로 비교한다 (형식이 섞여도 안전하게). */
export function isExpired(expiresAt: string, now: Date): boolean {
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return false // 못 읽는 값으로 데이터를 지우지 않는다
  return t <= now.getTime()
}

/** 복구 창이 지났나. purge_after 가 없으면 아직 실행 전이므로 false. */
export function isPurgeDue(purgeAfter: string | null, now: Date): boolean {
  if (!purgeAfter) return false
  const t = Date.parse(purgeAfter)
  if (Number.isNaN(t)) return false
  return t <= now.getTime()
}

export const CONSENT_WINDOW_HOURS = 48
export const RESTORE_WINDOW_DAYS = 7

export function expiryFrom(now: Date): string {
  return new Date(now.getTime() + CONSENT_WINDOW_HOURS * 3600_000).toISOString()
}

export function purgeFrom(now: Date): string {
  return new Date(now.getTime() + RESTORE_WINDOW_DAYS * 86400_000).toISOString()
}

/** "약 31시간 남음". 초 단위 카운트다운은 압박만 준다. */
export function remainingLabel(expiresAt: string, now: Date): string {
  const ms = Date.parse(expiresAt) - now.getTime()
  if (Number.isNaN(ms) || ms <= 0) return '만료됨'
  const h = Math.floor(ms / 3600_000)
  if (h >= 1) return `약 ${h}시간 남음`
  return `약 ${Math.max(1, Math.floor(ms / 60_000))}분 남음`
}

