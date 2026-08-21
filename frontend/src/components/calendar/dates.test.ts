import { describe, expect, it } from 'vitest'
import {
  daysInMonth,
  gridIndex,
  monthStart,
  periodLabel,
  shift,
  shiftMonth,
  weekStart,
} from './dates'

/**
 * 이 함수들은 CalendarPage.tsx 안에 export 없이 들어 있어서 테스트가 한 줄도
 * 없었다. UTC 산술이라 조용히 하루씩 밀리기 좋은 코드다.
 */

describe('weekStart — 월요일 시작', () => {
  it('금요일은 그 주 월요일로', () => {
    expect(weekStart('2026-08-21')).toBe('2026-08-17')
  })
  it('일요일은 앞으로 6일 — 다음 주가 아니라 지나온 주에 속한다', () => {
    expect(weekStart('2026-08-23')).toBe('2026-08-17')
  })
  it('월요일은 그대로', () => {
    expect(weekStart('2026-08-17')).toBe('2026-08-17')
  })
  it('달을 거슬러 올라간다', () => {
    expect(weekStart('2026-09-01')).toBe('2026-08-31')
  })
  it('해를 거슬러 올라간다', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-29')
  })
})

describe('shiftMonth — 말일 넘침', () => {
  it('1월 31일 + 1개월은 3월 3일이 아니라 2월 1일', () => {
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-01')
  })
  it('12월에서 다음 달은 다음 해 1월', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
  })
  it('1월에서 지난 달은 지난 해 12월', () => {
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
  })
})

describe('daysInMonth', () => {
  it('2월 평년 28일', () => expect(daysInMonth('2026-02-01')).toBe(28))
  it('2월 윤년 29일', () => expect(daysInMonth('2028-02-01')).toBe(29))
  it('8월 31일', () => expect(daysInMonth('2026-08-01')).toBe(31))
  it('4월 30일', () => expect(daysInMonth('2026-04-01')).toBe(30))
})

describe('gridIndex — 월요일 시작 격자', () => {
  it('월요일은 0번 칸', () => expect(gridIndex('2026-08-17')).toBe(0))
  it('일요일은 6번 칸 (0번이 아니다)', () => expect(gridIndex('2026-08-23')).toBe(6))
  it('토요일은 5번 칸', () => expect(gridIndex('2026-08-22')).toBe(5))
})

describe('shift / monthStart', () => {
  it('달 경계를 넘는다', () => expect(shift('2026-08-31', 1)).toBe('2026-09-01'))
  it('뒤로도 넘는다', () => expect(shift('2026-09-01', -1)).toBe('2026-08-31'))
  it('그 달 1일', () => expect(monthStart('2026-08-21')).toBe('2026-08-01'))
})

describe('periodLabel — 연도는 다른 해일 때만', () => {
  const today = '2026-08-21'

  it('올해 주간은 연도를 빼고 앞의 0도 뺀다', () => {
    // "08.17 – 08.23"(88px) 은 390px 미만 기기에서 라벨 칸을 넘쳤다.
    expect(periodLabel('week', '2026-08-17', '2026-08-23', today)).toBe('8.17 – 8.23')
  })
  it('올해 월간은 "8월"', () => {
    expect(periodLabel('month', '2026-08-01', '2026-08-31', today)).toBe('8월')
  })
  it('다른 해면 연도를 되살린다 — 안 그러면 길을 잃는다', () => {
    expect(periodLabel('month', '2025-12-01', '2025-12-31', today)).toBe('2025년 12월')
  })
  it('다른 해의 주간도 연도를 붙인다', () => {
    expect(periodLabel('week', '2025-12-29', '2026-01-04', today)).toBe('2025년 12.29 – 1.4')
  })
})
