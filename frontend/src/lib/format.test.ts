import { describe, expect, it } from 'vitest'
import { formatDate, meansUsedUp } from './format'

/**
 * 이 함수는 기기 타임존과 무관하게 **KST 달력값**을 그려야 한다.
 * 앱의 다른 날짜 코드(dates.ts 의 kstToday, 워커의 todayKst)가 전부 KST 고정이라
 * 여기만 로컬 시간을 쓰면 한국 밖 기기에서 재고 목록과 캘린더가 다른 날을 가리킨다.
 */

const TODAY = '2026-08-21'

describe('formatDate — 기본', () => {
  it('날짜만 오면 그대로 그린다', () => {
    expect(formatDate('2026-08-21', TODAY)).toBe('8월 21일')
    expect(formatDate('2026-01-02', TODAY)).toBe('1월 2일')
  })

  it('올해가 아니면 연도를 붙인다', () => {
    expect(formatDate('2025-01-02', TODAY)).toBe('2025년 1월 2일')
    expect(formatDate('2027-12-31', TODAY)).toBe('2027년 12월 31일')
  })

  it('빈 값과 해석 불가는 빈 문자열', () => {
    expect(formatDate('', TODAY)).toBe('')
    expect(formatDate('nonsense', TODAY)).toBe('')
    expect(formatDate('2026-13-45', TODAY)).toBe('')
  })
})

describe('formatDate — KST 고정', () => {
  it('UTC 시각을 KST 달력으로 옮긴다', () => {
    // 2026-08-20 15:30Z = 2026-08-21 00:30 KST → 21일
    expect(formatDate('2026-08-20T15:30:00Z', TODAY)).toBe('8월 21일')
    // 2026-08-20 14:30Z = 2026-08-20 23:30 KST → 20일
    expect(formatDate('2026-08-20T14:30:00Z', TODAY)).toBe('8월 20일')
  })

  it('타임존 표기가 없는 D1 형식도 UTC 로 읽는다', () => {
    // D1 은 컬럼에 따라 'YYYY-MM-DD HH:MM:SS' 를 준다. ISO 8601 이 아니라서
    // 그냥 파싱하면 브라우저가 로컬 시간으로 읽는데, 값은 UTC 다.
    // 한국 기기에서 9시간이 밀려 00:00~09:00 등록분이 전부 하루 전으로 보였다.
    expect(formatDate('2026-08-20 15:30:00', TODAY)).toBe('8월 21일')
    expect(formatDate('2026-08-20 14:30:00', TODAY)).toBe('8월 20일')
    // 같은 순간을 ISO 로 줘도 결과가 같아야 한다
    expect(formatDate('2026-08-20 15:30:00', TODAY)).toBe(
      formatDate('2026-08-20T15:30:00Z', TODAY),
    )
  })

  it('기기 타임존을 바꿔도 결과가 같다', () => {
    const original = process.env.TZ
    const inputs = ['2026-08-21', '2026-08-20T15:30:00Z', '2026-08-20 15:30:00']
    try {
      process.env.TZ = 'Asia/Seoul'
      const seoul = inputs.map((i) => formatDate(i, TODAY))
      process.env.TZ = 'America/Los_Angeles'
      const la = inputs.map((i) => formatDate(i, TODAY))
      process.env.TZ = 'UTC'
      const utc = inputs.map((i) => formatDate(i, TODAY))
      expect(la).toEqual(seoul)
      expect(utc).toEqual(seoul)
      expect(seoul).toEqual(['8월 21일', '8월 21일', '8월 21일'])
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })

  it('연도 판정도 KST 기준이다', () => {
    // 2025-12-31 15:30Z = 2026-01-01 00:30 KST → 올해(2026)라 연도 생략
    expect(formatDate('2025-12-31T15:30:00Z', TODAY)).toBe('1월 1일')
    // 2025-12-31 14:30Z = 2025-12-31 23:30 KST → 작년이라 연도 표기
    expect(formatDate('2025-12-31T14:30:00Z', TODAY)).toBe('2025년 12월 31일')
  })
})

describe('meansUsedUp — 수량이 「다 썼다」는 뜻인가', () => {
  it('숫자로 0 이면 참', () => {
    expect(meansUsedUp('0')).toBe(true)
    expect(meansUsedUp('0개')).toBe(true)
    expect(meansUsedUp('0 g')).toBe(true)
    expect(meansUsedUp('0.0')).toBe(true)
  })

  it('0.5모 를 0 으로 오판하지 않는다', () => {
    // 서버 파싱을 기각한 이유가 이것이다. 화면에서도 같은 실수를 하면 안 된다.
    expect(meansUsedUp('0.5모')).toBe(false)
    expect(meansUsedUp('0.5')).toBe(false)
  })

  it('숫자가 아니면 거짓', () => {
    expect(meansUsedUp('약간')).toBe(false)
    expect(meansUsedUp('조금')).toBe(false)
  })

  it('빈 값은 거짓이다 — 수량을 지우는 건 「다 썼다」가 아니다', () => {
    // 「일부 사용」 버튼 자체가 item.quantity 로 게이트돼 있어서, 빈 값을 소진으로
    // 치면 무관한 편집이 삭제를 제안하게 된다.
    expect(meansUsedUp('')).toBe(false)
    expect(meansUsedUp('   ')).toBe(false)
  })

  it('일반 수량은 거짓', () => {
    expect(meansUsedUp('1모')).toBe(false)
    expect(meansUsedUp('600g')).toBe(false)
    expect(meansUsedUp('2개')).toBe(false)
  })
})
