/* ──────────────────────────────────────────────
   캘린더 날짜 계산

   전부 KST 기준 'YYYY-MM-DD' 문자열로 다룬다. Date 객체를 들고 다니면
   기기 타임존에 따라 하루가 밀린다 — 서버도 같은 표현을 쓴다.

   CalendarPage 안에 있던 것을 꺼냈다. 안에 있을 때는 export 가 없어
   UTC 산술 ~90줄에 테스트를 한 줄도 붙일 수 없었다.
   ────────────────────────────────────────────── */

export const DOW = ['월', '화', '수', '목', '금', '토', '일']

export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

export function shift(date: string, days: number): string {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** 그 주 월요일. 한국에서 주는 월요일에 시작한다. */
export function weekStart(date: string): string {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay() // 0=일
  return shift(date, dow === 0 ? -6 : 1 - dow)
}

/** 그 달 1일. */
export function monthStart(date: string): string {
  return date.slice(0, 8) + '01'
}

/** 그 달의 일수. */
export function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 월 단위 이동. 말일 넘침을 피하려 1일 기준으로 계산한다. */
export function shiftMonth(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return d.toISOString().slice(0, 10)
}

/** 월요일 시작 격자에서 그 날짜가 몇 번째 칸인지 (0=월). */
export function gridIndex(date: string): number {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay()
  return dow === 0 ? 6 : dow - 1
}

/**
 * 기간 라벨.
 *
 * 연도는 **올해가 아닐 때만** 붙인다. 컨트롤 바가 한정된 폭을 나눠 쓰기
 * 때문인데, 실측하면 "2026년 8월"(72px)은 360px 기기에서 라벨 칸을 넘치고
 * "8월"(22px)은 320px 에서도 남는다. 연도를 항상 숨기면 재작년으로 넘어갔을 때
 * 길을 잃으므로, 다른 해일 때만 되살린다. 캘린더 앱들의 관행이기도 하다.
 */
export function periodLabel(view: 'week' | 'month', anchor: string, rangeEnd: string, today: string): string {
  const sameYear = anchor.slice(0, 4) === today.slice(0, 4)
  if (view === 'month') {
    const m = Number(anchor.slice(5, 7))
    return sameYear ? `${m}월` : `${anchor.slice(0, 4)}년 ${m}월`
  }
  const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`
  const range = `${md(anchor)} – ${md(rangeEnd)}`
  return sameYear ? range : `${anchor.slice(0, 4)}년 ${range}`
}
