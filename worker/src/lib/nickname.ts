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
/* 길이 상한은 글자 수가 아니라 **바이트 수**다. 14바이트.
   한글 1자 = 2바이트로 센다 → 한글 7자 / 영문·숫자 14자 / 섞으면 그 사이.

   왜 2바이트인가: 한국에서 "닉네임 14바이트" 라고 할 때의 그 관례가
   EUC-KR/CP949 기준이고, 자바스크립트 문자열의 내부 표현(UTF-16)도
   한글 1자가 2바이트다 ('가'.length === 1).
   UTF-8 로 세면 한글이 3바이트라 4자밖에 안 돼서 이름으로 쓰기 어렵다.

   저장은 UTF-8 이지만 그건 사용자가 알 바가 아니다. 이 숫자는 "얼마나 긴
   이름까지 허용할 것인가" 를 정하는 규칙이지 저장 공간 계산이 아니다. */
const MAX_BYTES = 14

/* 한글 **완성형**, 영문, 숫자만. 공백·이모지·특수문자 전부 거절.
   자모(ㄱㄴㄷ, ㅎㅇ, ㅏㅏ)는 **불완전한 한글이라 거절한다.**
   화이트리스트라서 호환 자모(ㄱ-ㅎㅏ-ㅣ)뿐 아니라 한글 자모 블록(U+1100~),
   반각 자모(U+FFA0~)까지 자동으로 걸린다 — 범위를 하나씩 막을 필요가 없다. */
const ALLOWED = /^[가-힣a-zA-Z0-9]+$/

/** 한글 1자 = 2, 그 외(영문·숫자) = 1. 허용 문자가 그 둘뿐이라 이걸로 충분하다. */
function byteLength(s: string): number {
  let n = 0
  for (const ch of s) n += /[가-힣]/.test(ch) ? 2 : 1
  return n
}

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
  if (byteLength(value) > MAX_BYTES) {
    /* 사용자에게 "바이트" 라고 말하지 않는다. 그건 우리 구현 사정이고,
       듣는 쪽에는 "몇 글자까지 되는지" 만 필요하다. */
    return { ok: false, message: '닉네임이 너무 길어요. 한글 7자, 영문·숫자 14자까지 쓸 수 있어요.' }
  }
  if (!ALLOWED.test(value)) {
    /* 자모만 쓴 경우를 따로 짚어준다. "한글만 썼는데 왜 안 되지" 가 되지 않게.
       ㄱㄴㄷ, ㅎㅇ, ㅏㅏ 같은 것들이 여기로 온다. */
    if (/[ㄱ-ㅎㅏ-ㅣ\u1100-\u11FF\uFFA0-\uFFDC]/.test(value)) {
      return { ok: false, message: '자음·모음만으로는 만들 수 없어요. 완성된 한글을 써주세요.' }
    }
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

export { MIN_LEN as NICKNAME_MIN, MAX_BYTES as NICKNAME_MAX_BYTES, byteLength as nicknameBytes }
