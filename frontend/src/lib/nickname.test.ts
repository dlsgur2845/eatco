import { describe, it, expect } from 'vitest'
import { validateNickname } from '../../../worker/src/lib/nickname'

/* 워커 소스를 직접 import 한다 (korean.test.ts, recipe-match.test.ts 와 같은 방식).
   nickname.ts 는 순수 함수라 D1 타입이 안 걸린다 — recipe-match 에서 겪은
   그 문제를 피하려고 일부러 그렇게 짰다. */

const ok = (s: string) => validateNickname(s).ok

describe('글자 규칙', () => {
  it('완성된 한글·영문·숫자를 허용한다', () => {
    for (const s of ['손보경', '송인혁', 'Anna', 'user123', '홍길동2', '김밥천국'])
      expect(ok(s), s).toBe(true)
  })

  it('불완전한 한글(자모)을 거절한다', () => {
    // ㄱㄴㄷ, ㅎㅇ, ㅏㅏ 같은 것. 화이트리스트라 호환 자모뿐 아니라
    // 한글 자모 블록(U+1100~)과 반각 자모(U+FFA0~)도 같이 걸린다.
    for (const s of ['ㄱㄴㄷ', 'ㅎㅇ', 'ㅏㅏ', 'ㅋㅋ', 'ㅅㅂ', '한글ㅇ', '\u1100\u1161', 'ﾰﾱ'])
      expect(ok(s), s).toBe(false)
  })

  it('자모만 쓴 경우엔 그렇다고 말해준다', () => {
    const r = validateNickname('ㅎㅇ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('완성된 한글')
  })

  it('공백과 특수문자를 거절한다', () => {
    // 요구: "한국어, 영어, 숫자만 가능"
    for (const s of ['홍 길동', 'a_b', '별★', 'test!', '이모지🙂', 'a-b'])
      expect(ok(s), s).toBe(false)
  })

  it('한글은 2, 영문·숫자는 1로 세어 14까지', () => {
    // 한글 7자 = 14, 영문·숫자 14자 = 14. 섞으면 그 사이.
    expect(ok('가')).toBe(false)              // 2자 미만
    expect(ok('가나')).toBe(true)             //  4
    expect(ok('냉장고지킴이')).toBe(true)       // 12
    expect(ok('가나다라마바사')).toBe(true)      // 14 — 한글 7자, 딱 상한
    expect(ok('가나다라마바사아')).toBe(false)    // 16 — 한글 8자
    expect(ok('abcdefghijklmn')).toBe(true)   // 14
    expect(ok('abcdefghijklmno')).toBe(false) // 15
    expect(ok('한글abcdefghij')).toBe(true)    // 4+10 = 14
    expect(ok('한글abcdefghijk')).toBe(false)  // 15
  })

  it('너무 길면 바이트가 아니라 글자 수로 말해준다', () => {
    // "바이트" 는 우리 구현 사정이다. 듣는 쪽에는 몇 글자까지인지만 필요하다.
    const r = validateNickname('가나다라마바사아')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('한글 7자')
      expect(r.message).not.toContain('바이트')
    }
  })

  it('문자열이 아니거나 비면 거절한다', () => {
    for (const v of [null, undefined, 123, {}, '', '   '])
      expect(validateNickname(v as unknown).ok, String(v)).toBe(false)
  })
})

describe('비속어 — 한국어', () => {
  it('대표적인 것들을 막는다', () => {
    // ㅅㅂ·ㅄ 는 이제 자모 규칙에서 먼저 걸린다. 거절되는 건 마찬가지다.
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
