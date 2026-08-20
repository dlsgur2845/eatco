/**
 * 신선도 — 단일 출처.
 *
 * 예전에는 화면마다 구간이 달랐다:
 *   대시보드      ≤1 위험 / ≤3 주의 / 그 외 여유
 *   재고          ≤0 / ≤3 / ≤7  (그래서 4일 남은 재료가 홈에선 초록, 재고에선 주황)
 *   스캔 결과     ≤1 / ≤3
 *   재고 게이지   5단계 계단식 (15일과 300일이 똑같이 10%)
 * 이 앱이 존재하는 이유가 바로 그 숫자인데, 화면마다 다르면 신뢰가 깎인다.
 *
 * 색은 반드시 **base 토큰**(primary/secondary/tertiary)을 쓴다.
 * `*-container` 는 M3 에서 배경 채움색이라 글자색으로 쓰면 대비가 무너진다:
 *   secondary-container #ff9800 on surface = 2.05:1  (AA 4.5 미달)
 *   tertiary-container  #ff6c5c on surface = 2.65:1
 *   secondary #8b5000 = 6.17:1,  tertiary #bb1614 = 6.18:1,  primary #006e1c = 6.17:1
 */

export type Freshness = 'expired' | 'critical' | 'warning' | 'safe'

export function freshness(daysLeft: number): Freshness {
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 1) return 'critical'
  if (daysLeft <= 3) return 'warning'
  return 'safe'
}

/** 글자색. base 토큰만 반환한다. */
export function freshnessColor(daysLeft: number): string {
  switch (freshness(daysLeft)) {
    case 'expired':
    case 'critical':
      return 'var(--color-tertiary)'
    case 'warning':
      return 'var(--color-secondary)'
    default:
      return 'var(--color-primary)'
  }
}

/** 배경 채움용 (뱃지 등). 이쪽은 container 토큰이 맞다. */
export function freshnessBg(daysLeft: number): string {
  switch (freshness(daysLeft)) {
    case 'expired':
    case 'critical':
      return 'var(--color-tertiary-container)'
    case 'warning':
      return 'var(--color-secondary-container)'
    default:
      return 'var(--color-primary-container)'
  }
}

export function daysLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}일 지남`
  if (daysLeft === 0) return '오늘까지'
  return `D-${daysLeft}`
}
