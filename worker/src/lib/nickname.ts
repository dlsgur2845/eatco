import { check as korcen } from 'korcen'
import { profanity } from '@2toad/profanity'

/**
 * 닉네임 검증 — 글자 규칙 + 비속어.
 *
 * **서버에만 둔다.** 프론트에도 같은 규칙을 보여주지만 그건 안내일 뿐이고,
 * 진짜 방어는 여기다. curl 한 줄이면 프론트는 통째로 건너뛴다.
 *
 * 사전은 npm 두 개를 쓴다. 실측으로 고른 것이다:
 *   - korcen (Apache-2.0)      — 한국어. 시발·시1발·ㅅㅂ·병신·ㅄ·좆·개새끼 잡음.
 *                                 **시발점을 오탐하지 않는다.**
 *   - @2toad/profanity (MIT)   — 영어. fuck·shit·asshole, 대소문자 섞기와
 *                                 "f u c k" 같은 띄어쓰기 우회까지 잡음.
 *
 * badwords-ko 는 탈락시켰다 — 크기 대비 얻는 게 없고(씨발은 잡지만 ㅅㅂ 를
 * 놓친다), 아래 보완 목록으로 같은 범위를 덮는다.
 *
 * 두 패키지로도 안 되는 게 있어서 아래 보완 목록을 둔다:
 *   - korcen 은 **씨발을 놓친다** (시발은 잡는데 씨발은 못 잡는다. 실측).
 *   - 어느 쪽도 "씨-발" 처럼 구분자를 끼운 형태를 못 잡는다.
 * 정규화로 구분자를 털고, 남는 구멍만 목록으로 메운다.
 */

const MIN_LEN = 2
const MAX_LEN = 20

/* 한국어(완성형 + 자모), 영어, 숫자만. 공백·이모지·특수문자 전부 거절.
   자모를 허용하는 이유: "ㅋㅋ" 같은 건 한국어 닉네임으로 자연스럽다.
   대신 비속어 쪽에서 ㅅㅂ·ㅄ 를 잡는다. */
const ALLOWED = /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]+$/

/**
 * 우회 정규화. 사전에 넣기 **전에** 돌린다.
 *
 * 구분자를 털면 "씨-발", "씨.발", "씨 발" 이 전부 "씨발" 로 모인다.
 * 글자 규칙이 이미 특수문자를 막지만, 정규화는 규칙 검사와 독립적으로
 * 돌아야 한다 — 나중에 규칙이 느슨해져도 사전은 계속 맞아야 한다.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/g, '')
}

/* 두 패키지가 놓치는 것 + **어근 자체를 막고 싶은 것**을 담는다.
   부분 문자열로 검사한다.

   여기에 시발·발기 가 들어가 있으므로 "시발점", "발기부전" 도 막힌다.
   그게 의도다 — 닉네임 칸이라 그렇다. 문장 속에서라면 시발점은 멀쩡한
   단어지만, **표시 이름으로 그걸 쓰려는 사람은 그 단어를 노린 것**이다.
   korcen 은 문맥을 봐서 시발점을 통과시키는데, 여기서 그 판단을 덮는다.

   대신 대가가 있다: 이 어근을 품은 멀쩡한 단어도 같이 막힌다
   (시발역, 발기인 등). 목록을 늘릴 때는 nickname.test.ts 의 "허용" 목록으로
   실제 이름들이 여전히 통과하는지 확인할 것. */
const SUPPLEMENT = [
  '씨발', '씨빨', '시발', '시팔', '씹', '좆', '보지', '자지', '븅신', '병신', '섹스', '발기',
]

export interface NicknameError {
  ok: false
  message: string
}
export interface NicknameOk {
  ok: true
  value: string
}

export function validateNickname(raw: unknown): NicknameOk | NicknameError {
  if (typeof raw !== 'string') return { ok: false, message: '닉네임을 입력해주세요.' }
  const value = raw.trim()

  if (!value) return { ok: false, message: '닉네임을 입력해주세요.' }
  if (value.length < MIN_LEN) return { ok: false, message: `닉네임은 ${MIN_LEN}자 이상이어야 해요.` }
  if (value.length > MAX_LEN) return { ok: false, message: `닉네임은 ${MAX_LEN}자 이내로 입력해주세요.` }
  if (!ALLOWED.test(value)) {
    return { ok: false, message: '닉네임에는 한글, 영문, 숫자만 쓸 수 있어요.' }
  }

  const norm = normalize(value)
  if (!norm) return { ok: false, message: '닉네임을 입력해주세요.' }

  // 세 겹으로 본다. 하나라도 걸리면 거절.
  const hit =
    SUPPLEMENT.some((w) => norm.includes(w)) ||
    safeCheck(() => korcen(norm)) ||
    safeCheck(() => profanity.exists(norm))

  if (hit) return { ok: false, message: '사용할 수 없는 닉네임이에요. 다른 이름을 써주세요.' }

  return { ok: true, value }
}

/* 사전 패키지가 예상 밖 입력에 던지면 **통과시킨다.**
   여기서 던지면 닉네임 변경 전체가 500 이 된다. 필터가 고장났다고
   멀쩡한 사용자를 막는 것보다, 그 한 건을 놓치는 쪽이 낫다. */
function safeCheck(fn: () => boolean): boolean {
  try {
    return fn() === true
  } catch {
    return false
  }
}

export { MIN_LEN as NICKNAME_MIN, MAX_LEN as NICKNAME_MAX }
