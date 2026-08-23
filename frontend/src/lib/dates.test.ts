import { describe, it, expect } from 'vitest'
import {
  nowKst, todayKst, hourKst, addDays, daysBetween, TZ_OFFSET_MIN,
} from '../../../worker/src/lib/dates'

/* 워커의 날짜 헬퍼. 순수 함수라 프론트 vitest 에서 직접 import 한다
   (korean.test.ts, recipe-match.test.ts, nickname.test.ts 와 같은 방식).

   이걸 테스트하는 이유: 이 함수들이 "오늘 써야 해요 / 3일 이내 / 여유 있어요"
   버킷과 캘린더 이동을 결정한다. Worker 는 UTC 로 도는데 사용자는 KST 라,
   틀리면 매일 아침 09:00 이전에 하루가 밀린 화면을 본다. 터지지 않고
   조용히 틀린 날짜를 보여주는 종류의 버그다. */

describe('KST 변환', () => {
  it('오프셋은 UTC+9 이고 서머타임이 없다', () => {
    expect(TZ_OFFSET_MIN).toBe(540)
  })

  it('UTC 자정 직후는 KST 로 같은 날 오전 9시다', () => {
    const d = new Date('2026-08-23T00:30:00Z')
    expect(todayKst(d)).toBe('2026-08-23')
    expect(hourKst(d)).toBe('09:30')
  })

  it('**UTC 로 아직 어제인 KST 새벽**에 하루가 밀리지 않는다', () => {
    /* 이 파일이 존재하는 이유. KST 08월 23일 오전 8시는 UTC 로 08월 22일
       23시다. UTC 기준으로 세면 "어제" 가 나온다. */
    const d = new Date('2026-08-22T23:00:00Z') // = KST 8/23 08:00
    expect(todayKst(d)).toBe('2026-08-23')
    expect(hourKst(d)).toBe('08:00')
  })

  it('KST 자정 직전은 아직 그 날이다', () => {
    const d = new Date('2026-08-23T14:59:00Z') // = KST 8/23 23:59
    expect(todayKst(d)).toBe('2026-08-23')
    expect(hourKst(d)).toBe('23:59')
  })

  it('KST 자정을 넘기면 다음 날이 된다', () => {
    const d = new Date('2026-08-23T15:00:00Z') // = KST 8/24 00:00
    expect(todayKst(d)).toBe('2026-08-24')
    expect(hourKst(d)).toBe('00:00')
  })

  it('nowKst 는 9시간을 더한 Date 를 준다', () => {
    const d = new Date('2026-08-23T00:00:00Z')
    expect(nowKst(d).getTime() - d.getTime()).toBe(9 * 60 * 60 * 1000)
  })
})

describe('addDays', () => {
  it('앞뒤로 더한다', () => {
    expect(addDays('2026-08-23', 1)).toBe('2026-08-24')
    expect(addDays('2026-08-23', -1)).toBe('2026-08-22')
    expect(addDays('2026-08-23', 0)).toBe('2026-08-23')
  })

  it('월을 넘긴다', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('연을 넘긴다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('윤년 2월을 넘긴다', () => {
    // 2028 은 윤년이다. 2월 28 다음이 29 여야 한다.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    // 2026 은 평년.
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('한 주를 건너뛴다 (캘린더 좌우 이동)', () => {
    expect(addDays('2026-08-23', 7)).toBe('2026-08-30')
    expect(addDays('2026-08-23', -7)).toBe('2026-08-16')
  })
})

describe('daysBetween', () => {
  it('b - a 순서다', () => {
    expect(daysBetween('2026-08-23', '2026-08-26')).toBe(3)
    expect(daysBetween('2026-08-26', '2026-08-23')).toBe(-3)
    expect(daysBetween('2026-08-23', '2026-08-23')).toBe(0)
  })

  it('월·연 경계를 넘어서 센다', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('윤년을 포함한 구간을 센다', () => {
    // 2028-02-28 → 2028-03-01 은 윤일이 껴서 2일이다.
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    // 평년은 1일.
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
  })

  it('소비기한 버킷 경계가 의도대로 나온다', () => {
    /* 대시보드가 이 값으로 "오늘 써야 해요(<=0) / 3일 이내(<=3) / 여유" 를
       가른다. 경계가 밀리면 멀쩡한 재료가 빨갛게 뜬다. */
    const today = '2026-08-23'
    expect(daysBetween(today, '2026-08-23')).toBe(0) // 오늘까지
    expect(daysBetween(today, '2026-08-26')).toBe(3) // 3일 이내의 끝
    expect(daysBetween(today, '2026-08-27')).toBe(4) // 여유
    expect(daysBetween(today, '2026-08-22')).toBe(-1) // 이미 지남
  })
})

describe('기기 타임존에 흔들리지 않는다', () => {
  it('같은 순간이면 어느 타임존에서 돌려도 같은 결과다', () => {
    /* 함수들이 전부 UTC 기준 산술 + 고정 오프셋이라 local time 을 안 탄다.
       Worker 는 UTC 지만 개발자 기계는 KST 라, 여기가 어긋나면 로컬에서만
       통과하는 테스트가 된다. */
    const d = new Date('2026-08-22T23:00:00Z')
    expect(todayKst(d)).toBe('2026-08-23')
    expect(addDays('2026-08-23', 1)).toBe('2026-08-24')
    expect(daysBetween('2026-08-23', '2026-08-24')).toBe(1)
  })
})
