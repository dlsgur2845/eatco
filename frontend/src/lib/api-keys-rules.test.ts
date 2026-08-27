import { describe, it, expect } from 'vitest'
import {
  pickKey, isAvailable, cooldownFor, shouldDisable, maskKey, providerLabel,
  COOLDOWN_MINUTES, type KeyRow,
} from '../../../worker/src/lib/api-keys-rules'

/*
 * 워커 소스를 직접 import 한다 (nickname.test.ts, family-reset-rules.test.ts 와 동일).
 * `worker/` 에 테스트 러너가 없어서 이 파일이 유일한 검증이다.
 *
 * 여기가 틀리면 한 사람의 키만 계속 쓰이거나(비용 쏠림), 멀쩡한 키가 영구히
 * 꺼지거나, 죽은 키를 계속 재시도한다.
 */

const T = (iso: string) => new Date(iso)
const NOW = T('2026-08-27T12:00:00Z')

function k(over: Partial<KeyRow> & { id: string }): KeyRow {
  return {
    provider: 'gemini', calls: 0, priority: null, disabled: 0, cooldown_until: null, ...over,
  }
}

describe('키 사용 가능 판정', () => {
  it('꺼진 키는 안 쓴다', () => {
    expect(isAvailable(k({ id: 'a', disabled: 1 }), NOW)).toBe(false)
  })

  it('쿨다운 중이면 안 쓴다', () => {
    expect(isAvailable(k({ id: 'a', cooldown_until: '2026-08-27T12:05:00Z' }), NOW)).toBe(false)
  })

  it('쿨다운이 지났으면 쓴다', () => {
    expect(isAvailable(k({ id: 'a', cooldown_until: '2026-08-27T11:59:00Z' }), NOW)).toBe(true)
  })

  it('못 읽는 쿨다운 값으로 멀쩡한 키를 버리지 않는다', () => {
    // 파싱 실패를 「영원히 쉬는 중」으로 읽으면 키를 영구히 잃는다.
    expect(isAvailable(k({ id: 'a', cooldown_until: '나중에' }), NOW)).toBe(true)
  })
})

describe('교대로 (least_used)', () => {
  it('가장 적게 쓴 키를 고른다', () => {
    const picked = pickKey([k({ id: 'a', calls: 10 }), k({ id: 'b', calls: 3 })], 'least_used', NOW)
    expect(picked?.id).toBe('b')
  })

  it('나중에 추가된 키가 따라잡는다 — 이게 라운드로빈과의 차이다', () => {
    // 손보경이 11월에 키를 넣으면 0회부터 시작한다. 라운드로빈은 "이제부터 반반"이라
    // 송인혁이 200회 앞선 채로 굳지만, least_used 는 따라잡을 때까지 몰아준다.
    const picked = pickKey([k({ id: '송인혁', calls: 200 }), k({ id: '손보경', calls: 0 })], 'least_used', NOW)
    expect(picked?.id).toBe('손보경')
  })

  it('동점이면 항상 같은 답을 준다 (id 로 깬다)', () => {
    const a = pickKey([k({ id: 'b', calls: 5 }), k({ id: 'a', calls: 5 })], 'least_used', NOW)
    const b = pickKey([k({ id: 'a', calls: 5 }), k({ id: 'b', calls: 5 })], 'least_used', NOW)
    expect(a?.id).toBe('a')
    expect(b?.id).toBe('a')
  })

  it('쓸 수 있는 키만 후보다', () => {
    const picked = pickKey(
      [k({ id: 'a', calls: 0, disabled: 1 }), k({ id: 'b', calls: 99 })],
      'least_used', NOW,
    )
    expect(picked?.id).toBe('b')
  })

  it('전부 못 쓰면 null — 호출부가 공용 키로 넘어간다', () => {
    expect(pickKey([k({ id: 'a', disabled: 1 })], 'least_used', NOW)).toBeNull()
    expect(pickKey([], 'least_used', NOW)).toBeNull()
  })
})

describe('순서 지정 (priority)', () => {
  it('1순위부터 쓴다 — 사용량과 무관하게', () => {
    const picked = pickKey(
      [k({ id: 'a', priority: 0, calls: 999 }), k({ id: 'b', priority: 1, calls: 0 })],
      'priority', NOW,
    )
    expect(picked?.id).toBe('a')
  })

  it('1순위가 쉬는 중이면 2순위로 넘어간다', () => {
    const picked = pickKey(
      [k({ id: 'a', priority: 0, cooldown_until: '2026-08-27T12:30:00Z' }), k({ id: 'b', priority: 1 })],
      'priority', NOW,
    )
    expect(picked?.id).toBe('b')
  })

  it('순위 없는 키는 맨 뒤', () => {
    const picked = pickKey([k({ id: 'a', priority: null }), k({ id: 'b', priority: 5 })], 'priority', NOW)
    expect(picked?.id).toBe('b')
  })

  it('순위가 같으면 적게 쓴 쪽 — 순위를 안 매긴 키들끼리도 공평하게', () => {
    const picked = pickKey(
      [k({ id: 'a', priority: null, calls: 10 }), k({ id: 'b', priority: null, calls: 2 })],
      'priority', NOW,
    )
    expect(picked?.id).toBe('b')
  })
})

describe('오류 처리 규칙', () => {
  it('429 는 쉬게 하고, 끄지는 않는다', () => {
    expect(cooldownFor(429, NOW)).toBe('2026-08-27T12:05:00.000Z')
    expect(COOLDOWN_MINUTES).toBe(5)
    expect(shouldDisable(429)).toBe(false)
  })

  it('401·403 은 끈다 — 다시 시도해도 소용없다', () => {
    expect(shouldDisable(401)).toBe(true)
    expect(shouldDisable(403)).toBe(true)
  })

  it('Gemini 는 잘못된 키에 401 이 아니라 400 을 준다 — 실측으로 잡은 함정', () => {
    // 상태코드만 보면 안 걸려서 고장난 키가 계속 뽑히고 스캔의 절반이 영구 실패한다.
    expect(shouldDisable(400)).toBe(false)
    expect(shouldDisable(400, '{"error":{"status":"INVALID_ARGUMENT","message":"API key not valid"}}')).toBe(true)
    expect(shouldDisable(400, 'API_KEY_INVALID')).toBe(true)
  })

  it('400 전체를 끄지는 않는다 — 잘못된 요청으로 멀쩡한 키가 꺼지면 안 된다', () => {
    // 이미지 형식 오류 같은 400 은 키와 무관하다.
    expect(shouldDisable(400, 'Invalid image format')).toBe(false)
  })

  it('5xx 는 제공자 사정이라 키 탓이 아니다', () => {
    expect(shouldDisable(503)).toBe(false)
    expect(cooldownFor(503, NOW)).toBeNull()
  })
})

describe('표시', () => {
  it('키는 뒤 4자만 남긴다', () => {
    expect(maskKey('AIzaSymuchlongerkeyhere4f2a')).toBe('••••4f2a')
  })

  it('빈 값에도 화면이 안 깨진다', () => {
    expect(maskKey('')).toBe('••••')
    expect(maskKey('   ')).toBe('••••')
  })

  it('제공자 이름을 한국어 라벨로', () => {
    expect(providerLabel('gemini')).toBe('Gemini')
    expect(providerLabel('anthropic')).toBe('Claude')
    // 모르는 값이 와도 그대로 — 화면이 빈칸이 되면 안 된다
    expect(providerLabel('mistral')).toBe('mistral')
  })
})
