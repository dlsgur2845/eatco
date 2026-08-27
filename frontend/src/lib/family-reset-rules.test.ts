import { describe, it, expect } from 'vitest'
import {
  allConsented, membershipChanged, isExpired, isPurgeDue,
  expiryFrom, purgeFrom, remainingLabel,
  CONSENT_WINDOW_HOURS, RESTORE_WINDOW_DAYS,
} from '../../../worker/src/lib/family-reset-rules'

/*
 * 워커 소스를 직접 import 한다 (nickname.test.ts, korean.test.ts 와 같은 방식).
 * `worker/` 에는 테스트 러너가 없어서 이 파일이 유일한 검증이다.
 *
 * 여기 있는 판정 하나가 틀리면 **가족 데이터가 잘못된 순간에 지워진다.**
 * 그래서 경계값을 전부 고정한다.
 */

const T = (iso: string) => new Date(iso)

describe('전원 동의 판정', () => {
  it('구성원 전원이 동의해야 참', () => {
    expect(allConsented(['a', 'b'], ['a'])).toBe(false)
    expect(allConsented(['a', 'b'], ['a', 'b'])).toBe(true)
  })

  it('순서가 달라도 참', () => {
    expect(allConsented(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
  })

  it('탈퇴자의 남은 동의는 무시한다', () => {
    // b 가 나갔다. b 의 동의가 남아 있어도 a 만 동의하면 전원이다.
    expect(allConsented(['a'], ['a', 'b'])).toBe(true)
  })

  it('구성원이 0명이면 거짓 — 빈 집합을 전원 동의로 읽으면 아무 동의 없이 지워진다', () => {
    expect(allConsented([], [])).toBe(false)
    expect(allConsented([], ['a'])).toBe(false)
  })

  it('동의가 하나도 없으면 거짓', () => {
    expect(allConsented(['a', 'b'], [])).toBe(false)
  })
})

describe('구성원 변동 판정', () => {
  it('같으면 변동 없음', () => {
    expect(membershipChanged(['a', 'b'], ['a', 'b'])).toBe(false)
  })

  it('순서만 다른 건 같은 것으로 본다 — DB 정렬이 바뀌었다고 동의가 깨지면 안 된다', () => {
    expect(membershipChanged(['a', 'b'], ['b', 'a'])).toBe(false)
  })

  it('합류하면 변동', () => {
    // 새로 들어온 사람은 동의한 적이 없다.
    expect(membershipChanged(['a', 'b'], ['a', 'b', 'c'])).toBe(true)
  })

  it('탈퇴하면 변동', () => {
    expect(membershipChanged(['a', 'b'], ['a'])).toBe(true)
  })

  it('수는 같은데 사람이 바뀌면 변동', () => {
    // 한 명 나가고 한 명 들어온 경우. 길이만 보면 놓친다.
    expect(membershipChanged(['a', 'b'], ['a', 'c'])).toBe(true)
  })
})

describe('만료 판정', () => {
  it('지나면 만료', () => {
    expect(isExpired('2026-08-27T00:00:00Z', T('2026-08-27T00:00:01Z'))).toBe(true)
  })

  it('정확히 같은 시각이면 만료로 본다', () => {
    expect(isExpired('2026-08-27T00:00:00Z', T('2026-08-27T00:00:00Z'))).toBe(true)
  })

  it('아직이면 유효', () => {
    expect(isExpired('2026-08-29T00:00:00Z', T('2026-08-27T00:00:00Z'))).toBe(false)
  })

  it('못 읽는 값으로는 만료시키지 않는다 — 파싱 실패로 데이터를 지우면 안 된다', () => {
    expect(isExpired('나중에', T('2026-08-27T00:00:00Z'))).toBe(false)
    expect(isExpired('', T('2026-08-27T00:00:00Z'))).toBe(false)
  })
})

describe('복구 창 판정', () => {
  it('purge_after 가 없으면 아직 실행 전이므로 거짓', () => {
    expect(isPurgeDue(null, T('2030-01-01T00:00:00Z'))).toBe(false)
  })

  it('지나면 참', () => {
    expect(isPurgeDue('2026-09-03T00:00:00Z', T('2026-09-03T00:00:01Z'))).toBe(true)
  })

  it('아직이면 거짓', () => {
    expect(isPurgeDue('2026-09-03T00:00:00Z', T('2026-08-28T00:00:00Z'))).toBe(false)
  })
})

describe('기한 계산', () => {
  it('동의 기한은 48시간 뒤', () => {
    expect(expiryFrom(T('2026-08-27T00:00:00Z'))).toBe('2026-08-29T00:00:00.000Z')
    expect(CONSENT_WINDOW_HOURS).toBe(48)
  })

  it('복구 기한은 7일 뒤', () => {
    expect(purgeFrom(T('2026-08-27T00:00:00Z'))).toBe('2026-09-03T00:00:00.000Z')
    expect(RESTORE_WINDOW_DAYS).toBe(7)
  })
})

describe('남은 시간 문구', () => {
  it('시간 단위로 어림한다 — 초 카운트다운은 압박만 준다', () => {
    expect(remainingLabel('2026-08-29T00:00:00Z', T('2026-08-27T17:00:00Z'))).toBe('약 31시간 남음')
  })

  it('한 시간 미만이면 분으로', () => {
    expect(remainingLabel('2026-08-27T00:30:00Z', T('2026-08-27T00:00:00Z'))).toBe('약 30분 남음')
  })

  it('1분 미만이어도 0분이라고 하지 않는다', () => {
    expect(remainingLabel('2026-08-27T00:00:30Z', T('2026-08-27T00:00:00Z'))).toBe('약 1분 남음')
  })

  it('지났으면 만료됨', () => {
    expect(remainingLabel('2026-08-27T00:00:00Z', T('2026-08-28T00:00:00Z'))).toBe('만료됨')
  })

  it('못 읽는 값도 만료됨으로 — 화면에 NaN 을 띄우지 않는다', () => {
    expect(remainingLabel('언젠가', T('2026-08-27T00:00:00Z'))).toBe('만료됨')
  })
})
