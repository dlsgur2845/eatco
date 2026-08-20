/**
 * 이 앱은 단일 타임존(Asia/Seoul)이다. Worker 는 UTC 로 돌기 때문에
 * "오늘" 을 UTC 기준으로 계산하면 매일 아침 09:00 이전에 하루가 밀린다.
 * (기존 코드의 CookingStatsCard 가 정확히 이 버그를 갖고 있었다.)
 */
export const TZ_OFFSET_MIN = 9 * 60 // KST = UTC+9, DST 없음

export function nowKst(d: Date = new Date()): Date {
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60_000)
}

/** KST 기준 오늘 날짜를 YYYY-MM-DD 로. */
export function todayKst(d: Date = new Date()): string {
  return nowKst(d).toISOString().slice(0, 10)
}

/** KST 기준 현재 시각을 HH:MM 으로. */
export function hourKst(d: Date = new Date()): string {
  return nowKst(d).toISOString().slice(11, 16)
}

/** YYYY-MM-DD 에 일수를 더한다. */
export function addDays(isoDate: string, days: number): string {
  const t = new Date(isoDate + 'T00:00:00Z').getTime() + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** 두 YYYY-MM-DD 사이의 일수 (b - a). */
export function daysBetween(a: string, b: string): number {
  const ta = new Date(a + 'T00:00:00Z').getTime()
  const tb = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((tb - ta) / 86_400_000)
}

/** DB 저장용 UTC ISO 문자열. */
export function nowIso(): string {
  return new Date().toISOString()
}
