import { describe, expect, it } from 'vitest'
import * as frontend from './korean'
// 워커 사본. 프론트와 빌드를 공유하지 않아 파일이 두 벌인데, 여기서 같은 단언을
// 두 사본 모두에 돌려서 한쪽만 고쳐지는 사고를 막는다.
import * as worker from '../../../worker/src/lib/korean'

const impls: [string, typeof frontend][] = [
  ['frontend', frontend],
  ['worker', worker],
]

for (const [name, k] of impls) {
  describe(`한국어 조사 (${name})`, () => {
    it('받침 없는 말에는 를 / 가 / 는 / 와', () => {
      // 실제로 화면에 "계란후라이을(를) 올렸어요" 로 나왔던 값
      expect(k.withJosa('계란후라이', '을')).toBe('계란후라이를')
      expect(k.withJosa('김치찌개', '을')).toBe('김치찌개를')
      expect(k.withJosa('삼겹살구이', '을')).toBe('삼겹살구이를')
      expect(k.withJosa('우유', '이')).toBe('우유가')
      expect(k.withJosa('시금치', '은')).toBe('시금치는')
      expect(k.withJosa('고등어', '과')).toBe('고등어와')
    })

    it('받침 있는 말에는 을 / 이 / 은 / 과', () => {
      expect(k.withJosa('삼겹살', '을')).toBe('삼겹살을')
      expect(k.withJosa('계란', '이')).toBe('계란이')
      expect(k.withJosa('간장', '은')).toBe('간장은')
      expect(k.withJosa('당근', '과')).toBe('당근과')
    })

    it('어느 쪽 조사를 넘겨도 결과가 같다', () => {
      expect(k.josa('계란후라이', '을')).toBe(k.josa('계란후라이', '를'))
      expect(k.josa('삼겹살', '이')).toBe(k.josa('삼겹살', '가'))
      expect(k.josa('삼겹살', '을')).toBe('을')
      expect(k.josa('계란후라이', '을')).toBe('를')
    })

    it('끝의 문장부호와 공백은 판정에서 제외한다', () => {
      expect(k.withJosa('김치찌개!', '을')).toBe('김치찌개!를')
      expect(k.withJosa('삼겹살 ', '을')).toBe('삼겹살 을')
      // 괄호를 벗기면 판정 대상은 '분'(받침 ㄴ) 이다. 소리내어 읽어도
      // "된장찌개 이인분을" 이 맞다. 괄호를 안 벗기면 '개' 로 잘못 판정한다.
      expect(k.withJosa('된장찌개(2인분)', '을')).toBe('된장찌개(2인분)을')
      expect(k.withJosa('만두(20개)', '을')).toBe('만두(20개)를')
    })

    it('숫자는 읽는 소리로 판정한다', () => {
      // 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 — 받침 있음
      expect(k.hasBatchim('2026')).toBe(true)
      expect(k.hasBatchim('1')).toBe(true)
      expect(k.hasBatchim('8')).toBe(true)
      // 2 이, 4 사, 5 오, 9 구 — 받침 없음
      expect(k.hasBatchim('2')).toBe(false)
      expect(k.hasBatchim('5')).toBe(false)
      expect(k.hasBatchim('9')).toBe(false)
    })

    it('판정할 수 없으면 null 이고, 조사는 받침 없는 쪽으로 떨어진다', () => {
      expect(k.hasBatchim('milk')).toBeNull()
      expect(k.hasBatchim('')).toBeNull()
      expect(k.hasBatchim('...')).toBeNull()
      // 어느 쪽이든 "을(를)" 보다는 낫다
      expect(k.withJosa('milk', '을')).toBe('milk를')
    })

    it('모르는 조사는 그대로 돌려준다', () => {
      expect(k.josa('삼겹살', '에서')).toBe('에서')
    })

    it('으로/로 는 ㄹ 받침을 예외로 둔다', () => {
      // 받침 유무만 보면 "서울으로" 가 나온다. ㄹ 받침은 받침 없는 쪽과 같은 형태다.
      expect(k.withJosa('서울', '로')).toBe('서울로')
      expect(k.withJosa('칼', '으로')).toBe('칼로')
      expect(k.withJosa('연필', '으로')).toBe('연필로')
      // ㄹ 이 아닌 받침은 으로
      expect(k.withJosa('손', '으로')).toBe('손으로')
      expect(k.withJosa('젓가락', '으로')).toBe('젓가락으로')
      // 받침 없음도 로
      expect(k.withJosa('냉장고', '로')).toBe('냉장고로')
      // 다른 조사쌍은 ㄹ 받침을 예외로 두지 않는다
      expect(k.withJosa('서울', '을')).toBe('서울을')
      expect(k.withJosa('칼', '이')).toBe('칼이')
    })

    it('문자열이 아닌 값에도 던지지 않는다', () => {
      // 조사 처리를 넣기 전에는 JSX 가 그냥 "이(가)" 를 찍고 살아 있었다.
      // 여기서 던지면 API 응답의 name 이 null 인 순간 화면이 통째로 죽는다.
      expect(() => k.josa(null as never, '이')).not.toThrow()
      expect(() => k.withJosa(undefined as never, '을')).not.toThrow()
      expect(k.josa(null as never, '이')).toBe('가')
      expect(k.withJosa(null as never, '을')).toBe('를')
      expect(k.hasBatchim(null as never)).toBeNull()
      expect(k.hasBatchim(123 as never)).toBeNull()
    })

    it('받침 판정 자체', () => {
      expect(k.hasBatchim('삼겹살')).toBe(true) // 살 = ㄹ 받침
      expect(k.hasBatchim('계란후라이')).toBe(false) // 이 = 받침 없음
      expect(k.hasBatchim('간장')).toBe(true) // 장 = ㅇ 받침
    })
  })
}

describe('프론트/워커 사본 전수 대조', () => {
  // 단언으로 고정한 입력만 비교하면, 단언이 없는 분기는 갈라져도 안 잡힌다.
  // 단어 × 조사를 전부 돌려서 두 사본의 출력이 한 글자라도 다르면 실패시킨다.
  const words = [
    '계란후라이', '삼겹살', '김치찌개', '우유', '계란', '간장', '시금치', '고등어',
    '서울', '칼', '연필', '손', '냉장고', '만두(20개)', '된장찌개(2인분)', '김치찌개!',
    '2026', '1', '8', '2', '5', '9', '0', 'milk', '', '...', '삼겹살 ',
  ]
  const particles = ['을', '를', '이', '가', '은', '는', '과', '와', '으로', '로', '에서']

  it('모든 조합에서 두 사본이 같은 값을 낸다', () => {
    const diffs: string[] = []
    for (const w of words) {
      for (const p of particles) {
        const a = frontend.josa(w, p)
        const b = worker.josa(w, p)
        if (a !== b) diffs.push(`josa(${JSON.stringify(w)}, ${p}) → 프론트 ${a} / 워커 ${b}`)
      }
      if (frontend.hasBatchim(w) !== worker.hasBatchim(w)) {
        diffs.push(`hasBatchim(${JSON.stringify(w)}) 불일치`)
      }
    }
    expect(diffs).toEqual([])
  })
})
