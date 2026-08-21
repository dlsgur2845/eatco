/**
 * 한국어 조사 선택.
 *
 * 이게 없어서 화면에 이렇게 나왔다:
 *   "송인혁님이 8월 21일 아침에 계란후라이을(를) 올렸어요"
 * 알림·가계부·재고·관리자 5곳에서 `을(를)` / `이(가)` / `은(는)` 을 그대로 찍고 있었다.
 * 조사 처리 코드는 저장소 전체에 한 줄도 없었다.
 *
 * 받침 판정 원리: 한글 음절은 유니코드 AC00~D7A3 에 (초성 × 중성 × 종성) 순서로
 * 나열돼 있고 종성이 28가지(없음 포함)다. 따라서 `(code - 0xAC00) % 28` 이
 * **종성 번호**이고, 0 이면 받침이 없다. 번호 8 이 ㄹ 이다 (아래 으로/로 참조).
 *
 * **worker/src/lib/korean.ts 에 같은 파일이 있다.** 프론트와 워커가 빌드를 공유하지
 * 않아서 복제했다. korean.test.ts 가 두 사본에 같은 단언을 돌리고, 단어×조사를
 * 전수 대조해서 어긋남을 막는다.
 */

/** 종성 번호 8 = ㄹ. 으로/로 가 이 값을 따로 봐야 한다. */
const JONG_RIEUL = 8

/** 받침이 있는 쪽 조사를 키로 쓴다. */
const PAIRS: Record<string, [withBatchim: string, withoutBatchim: string]> = {
  을: ['을', '를'],
  를: ['을', '를'],
  이: ['이', '가'],
  가: ['이', '가'],
  은: ['은', '는'],
  는: ['은', '는'],
  과: ['과', '와'],
  와: ['과', '와'],
  으로: ['으로', '로'],
  로: ['으로', '로'],
}

/**
 * 마지막 글자의 **종성 번호**. 받침이 없으면 0, 판정 불가면 null.
 *
 * 숫자는 읽는 소리로 판정한다 — 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 은 받침이 있고
 * 2 이, 4 사, 5 오, 9 구 는 없다. 1·7·8(일·칠·팔)은 ㄹ 받침이라 으로/로 에서도
 * 갈리므로 번호까지 돌려준다.
 */
function jongseong(word: unknown): number | null {
  // 문자열이 아니면 판정하지 않는다. 예전에는 여기서 TypeError 가 났다 —
  // API 응답의 name 이 null 이면 화면이 통째로 죽었다. 그 전 코드는 그냥
  // "이(가)" 를 찍고 살아 있었으므로, 이건 조사 처리가 만든 새 크래시였다.
  if (typeof word !== 'string') return null
  // 끝의 공백과 문장부호를 걷어낸다. "김치찌개!" 의 판정 대상은 '개' 다.
  const s = word.replace(/[\s.,!?"')\]}·…]+$/u, '')
  if (!s) return null
  const ch = s[s.length - 1]
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28
  if (ch >= '0' && ch <= '9') {
    if (ch === '1' || ch === '7' || ch === '8') return JONG_RIEUL // 일·칠·팔
    return '036'.includes(ch) ? 1 : 0 // 영·삼·육은 받침 있음(ㄹ 아님)
  }
  return null
}

/** 받침이 있으면 true, 없으면 false, 판정 불가면 null. */
export function hasBatchim(word: string): boolean | null {
  const j = jongseong(word)
  return j === null ? null : j !== 0
}

/**
 * 단어에 붙일 조사를 고른다. 어느 쪽을 넘겨도 된다 — `josa('계란후라이','을')` 과
 * `josa('계란후라이','를')` 은 똑같이 '를' 을 준다.
 *
 * 으로/로 만 규칙이 다르다. **ㄹ 받침은 '로' 를 쓴다** — 서울로, 칼로, 연필로.
 * 받침 유무만 보면 "서울으로" 가 나온다.
 *
 * 판정할 수 없으면(영문·기호로 끝나거나 값이 문자열이 아니면) 받침 없는 쪽을 쓴다.
 * 한국어에서 외래어는 그쪽이 더 자연스럽게 읽히는 경우가 많고, 무엇보다
 * 던지지 않는다.
 */
export function josa(word: string, particle: string): string {
  const pair = PAIRS[particle]
  if (!pair) return particle
  const j = jongseong(word)
  if (j === null || j === 0) return pair[1]
  // 으로/로: ㄹ 받침은 받침 없는 쪽과 같은 형태를 쓴다.
  if ((particle === '으로' || particle === '로') && j === JONG_RIEUL) return pair[1]
  return pair[0]
}

/** 단어와 조사를 붙여서 돌려준다. `withJosa('계란후라이','을')` → '계란후라이를' */
export function withJosa(word: string, particle: string): string {
  return (typeof word === 'string' ? word : '') + josa(word, particle)
}
