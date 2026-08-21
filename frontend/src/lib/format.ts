import type { Ingredient, IngredientUnit } from '../types'
import { UNIT_LABEL } from '../types'

/**
 * 재고 row 의 수량 표시 규칙.
 * 우선순위: (amount_value + unit) → legacy quantity 문자열 → '수량 확인 필요' 배지
 */
export function formatQuantity(ing: Pick<Ingredient, 'amount_value' | 'unit' | 'quantity'>): string {
  if (ing.amount_value != null && ing.unit) {
    return `${stripTrailingZero(ing.amount_value)}${UNIT_LABEL[ing.unit]}`
  }
  if (ing.quantity && ing.quantity.trim() !== '') {
    return ing.quantity
  }
  return '수량 확인 필요'
}

/** 수량 재입력이 필요한 row 인지. */
export function stripTrailingZero(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 1000) / 1000
  const s = rounded.toString()
  return s
}

/** unit 별 step 값 (CookModal 의 stepper/slider). */
export function stepForUnit(unit: IngredientUnit): number {
  if (unit === 'piece') return 0.25
  return 1
}

/** piece 는 소수 3자리 허용 (1/4, 1/2, 3/4), g/ml 은 정수. */
export function formatAmount(amount: number, unit: IngredientUnit): string {
  if (unit === 'piece') return stripTrailingZero(amount)
  return Math.round(amount).toString()
}

/**
 * 서버가 준 시각 문자열을 밀리초로. **타임존 표기가 없으면 UTC 로 읽는다.**
 *
 * D1 은 컬럼에 따라 `2026-08-20T15:30:00.000Z` 를 주기도 하고
 * `2026-08-20 15:30:00` 을 주기도 한다. 뒤쪽은 ISO 8601 이 아니라서
 * 브라우저가 **로컬 시간**으로 해석하는데, 값은 UTC 다. 한국 기기에서
 * 9시간이 밀려서 00:00~09:00 에 등록한 항목이 전부 하루 전으로 보인다.
 */
function parseServerTime(iso: string): number {
  // 날짜만 오면 KST 자정으로 읽는다.
  if (iso.length <= 10) return Date.parse(`${iso}T00:00:00+09:00`)
  const s = iso.replace(' ', 'T')
  return /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s) ? Date.parse(s) : Date.parse(`${s}Z`)
}

/**
 * 화면에 보여줄 날짜. **앱 전체가 이 하나를 쓴다.**
 *
 * 예전에는 같은 "등록일"을 화면마다 다르게 그렸다:
 *   대시보드  `8. 21.일`      ← toLocaleDateString('ko-KR',{month,day}) 이 이미
 *                               "8. 21." 을 주는데 뒤에 '일' 을 또 붙였다
 *   재고      `2026-08-21`    ← ISO 원본 그대로
 *
 * **KST 로 고정한다.** 처음엔 기기 로컬 시간으로 그렸는데, 이 앱에서 날짜를
 * 다루는 다른 코드는 전부 KST 고정이다 (`dates.ts` 의 kstToday, 워커의 todayKst).
 * 서버가 `registered_at` 을 UTC ISO 로 주므로, 로컬 시간으로 그리면 한국 밖
 * 기기에서 **재고 목록과 캘린더가 서로 다른 날을 가리킨다.**
 * 실측: `2026-08-21T01:00:00Z` 가 서울에서 8월 21일, 로스앤젤레스에서 8월 20일.
 *
 * 올해면 연도를 빼고, 다른 해면 붙인다.
 */
export function formatDate(iso: string, todayKst?: string): string {
  if (!iso) return ''
  const ms = parseServerTime(iso)
  if (Number.isNaN(ms)) return ''
  // +9h 만큼 밀어두면 getUTC* 가 곧 KST 달력값이다. 기기 타임존과 무관해진다.
  const kst = new Date(ms + 9 * 3600_000)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth() + 1
  const d = kst.getUTCDate()
  const nowYear = (todayKst ?? new Date(Date.now() + 9 * 3600_000).toISOString()).slice(0, 4)
  return String(y) === nowYear ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`
}
