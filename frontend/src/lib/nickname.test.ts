import { describe, it, expect } from 'vitest'
import { validateNickname } from '../../../worker/src/lib/nickname'

/* 워커 소스를 직접 import 한다 (korean.test.ts, recipe-match.test.ts 와 같은 방식).
   nickname.ts 는 순수 함수라 D1 타입이 안 걸린다 — recipe-match 에서 겪은
   그 문제를 피하려고 일부러 그렇게 짰다. */

const ok = (s: string) => validateNickname(s).ok

describe('글자 규칙', () => {
  it('한글·영문·숫자를 허용한다', () => {
    for (const s of ['손보경', '송인혁', 'Anna', 'user123', '홍길동2', 'ㅋㅋ', '김밥천국'])
      expect(ok(s), s).toBe(true)
  })

  it('공백과 특수문자를 거절한다', () => {
    // 요구: "한국어, 영어, 숫자만 가능"
    for (const s of ['홍 길동', 'a_b', '별★', 'test!', '이모지🙂', 'a-b'])
      expect(ok(s), s).toBe(false)
  })

  it('길이 하한과 상한을 지킨다', () => {
    expect(ok('가')).toBe(false)
    expect(ok('가나')).toBe(true)
    expect(ok('가'.repeat(20))).toBe(true)
    expect(ok('가'.repeat(21))).toBe(false)
  })

  it('문자열이 아니거나 비면 거절한다', () => {
    for (const v of [null, undefined, 123, {}, '', '   '])
      expect(validateNickname(v as unknown).ok, String(v)).toBe(false)
  })
})

describe('비속어 — 한국어', () => {
  it('대표적인 것들을 막는다', () => {
    for (const s of ['시발', '씨발', '병신', 'ㅅㅂ', 'ㅄ', '좆', '개새끼', '씹'])
      expect(ok(s), s).toBe(false)
  })

  it('구분자를 끼운 우회를 막는다', () => {
    // 글자 규칙이 먼저 걸러내지만, 정규화가 독립적으로 동작해야 한다.
    for (const s of ['씨-발', '씨.발', '씨 발']) expect(ok(s), s).toBe(false)
  })

  it('숫자 치환 우회를 막는다', () => {
    expect(ok('시1발')).toBe(false)
  })
})

describe('비속어 — 영어', () => {
  it('영어도 막는다', () => {
    // 한국어 패키지는 영어를 하나도 못 잡는다. 그래서 @2toad 를 같이 쓴다.
    for (const s of ['fuck', 'shit', 'asshole', 'fUcK', 'bitch'])
      expect(ok(s), s).toBe(false)
  })
})

describe('어근을 품은 단어도 막는다', () => {
  it('시발점·발기부전을 막는다', () => {
    /* 문장 속에서는 멀쩡한 단어지만 **표시 이름**으로 쓰려는 건 그 단어를
       노린 것이다. 닉네임 칸이라 어근째 막는다. */
    for (const s of ['시발점', '시발역', '발기부전', '병신같은']) expect(ok(s), s).toBe(false)
  })
})

describe('오탐 — 멀쩡한 이름을 막으면 안 된다', () => {
  it('일반 단어를 허용한다', () => {
    for (const s of ['개발자', '분석가', '대박', '고구마', '바보온달', '김밥천국'])
      expect(ok(s), s).toBe(true)
  })

  it('실제 사용자 이름을 허용한다', () => {
    for (const s of ['송인혁', '손보경', 'dlsgur2845', '민수', 'Anna'])
      expect(ok(s), s).toBe(true)
  })
})

describe('반환값', () => {
  it('통과하면 다듬은 값을 준다', () => {
    const r = validateNickname('  홍길동  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('홍길동')
  })

  it('거절하면 사람이 읽을 이유를 준다', () => {
    const r = validateNickname('홍 길동')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('한글')
  })
})
