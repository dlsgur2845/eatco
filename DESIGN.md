# Eatco 디자인 시스템

이 문서는 **실제로 구현되어 있는 것**만 기술한다.

이전 버전은 미편집 LLM 출력물이었다 (파일 전체가 ` ```markdown ` 펜스로 감싸여 있었다).
"The Living Atelier", "데이터가 숨쉰다" 같은 서술과 함께 구현된 적 없는 규칙을 다수
규정했고, 사실오류도 있었다 — *"Body & Labels: `inter` (or Pretendard). Optimized for
Korean legibility."* Inter 에는 한글 글리프가 없다. 그 결과 앱의 모든 한글이 시스템
폰트로 폴백되어 iOS 와 Android 에서 서로 다른 서체로 보였다.

문서를 코드에 맞춘다. 코드를 문서에 맞추지 않는다.

---

## 1. 색

Material Design 3 톤 팔레트. 정의는 `frontend/src/index.css` 의 `@theme` 한 곳뿐이다.

| 역할 | 토큰 | 값 |
|---|---|---|
| Primary | `primary` / `on-primary` | `#006e1c` / `#ffffff` |
| Primary container | `primary-container` / `on-primary-container` | `#4caf50` / `#003c0b` |
| Secondary (주의) | `secondary` / `secondary-container` / `on-secondary-container` | `#8b5000` / `#ff9800` / `#653900` |
| Tertiary (경고) | `tertiary` / `tertiary-container` / `on-tertiary-container` | `#bb1614` / `#ff6c5c` / `#6d0003` |
| Error | `error` / `error-container` | `#ba1a1a` / `#ffdad6` |
| Surface | `surface` / `on-surface` / `on-surface-variant` | `#f8faf8` / `#191c1b` / `#3f4a3c` |
| Surface containers | `-lowest` / `-low` / (base) / `-high` / `-highest` | `#ffffff` / `#f2f4f2` / `#eceeec` / `#e6e9e7` / `#dfe3e0` |
| Outline | `outline` / `outline-variant` | `#6f7a6b` / `#becab9` |

### 절대 규칙: `*-container` 는 배경, 글자는 `on-*-container`

M3 에서 `*-container` 는 **배경 채움색**이다. 전경 텍스트색으로 쓰면 안 된다.
이걸 어겨서 앱의 대비가 전면 미달이었다:

| 잘못된 조합 | 실측 대비 |
|---|---|
| `secondary-container #ff9800` 를 글자색으로 | 2.05:1 |
| `tertiary-container #ff6c5c` 를 글자색으로 | 2.65:1 |
| `primary-container` 위 흰 글자 | 2.78:1 |

**올바른 조합** (전부 기존 토큰, WCAG AA 통과):

| 조합 | 실측 대비 |
|---|---|
| `primary-container` 위 `on-primary-container` | 4.58:1 |
| `surface` 위 `secondary #8b5000` | 6.17:1 |
| `surface` 위 `tertiary #bb1614` | 6.18:1 |
| `surface` 위 `primary #006e1c` | 6.17:1 |
| `surface` 위 `on-surface-variant` | 8.87:1 |

surface 위 색 있는 텍스트가 필요하면 `secondary` / `tertiary` / `primary` 를 쓴다.

이 규칙은 **실제로 적용되어 있다**(2026-08-20 기준 위반 0건). 이전 판에서는 문서에만
써놓고 BottomNav 한 곳만 고쳐서, 홈 화면의 가장 큰 숫자 3개가 2.05:1 / 2.65:1 로
남아 있었다. 문서에 규칙을 쓰면 코드를 전수 검사한다:

    find frontend/src -name '*.tsx' -print0 \
      | xargs -0 grep -noE "text-[a-z-]+-container[a-z-]*" \
      | grep -vE ":text-on-"

**감사 명령은 세 번 틀렸다. 고친 이유를 남긴다.**

1. `--include='*.tsx'` 는 이 저장소 환경(`grep` 이 ugrep 으로 별칭됨)에서
   *"No such file or directory"* 경고만 내고 **아무 파일도 읽지 않은 채 0건**을
   반환했다. 규칙이 지켜져서 0건인지, 검사가 안 돌아서 0건인지 구분되지 않는다.
   `find | xargs` 로 대상을 명시한다.
2. 원래 명령은 인라인 `color:` / `color="` 만 봤다. 이 코드베이스는 색을 거의 전부
   Tailwind 클래스(`text-*-container`)로 쓴다. 즉 **실제 표기법을 검사하지 않고 있었다.**
   이 구멍으로 `placeholder:text-surface-container-highest` 4곳(`#dfe3e0` on `#ffffff`
   = **1.28:1**)이 통과했다. 입력 힌트("예: 우유, 고등어, 삼겹살...")가 안 보여서
   빈 칸처럼 보였다.
3. 줄 단위 `grep -v` 는 **한 줄에 정상 토큰과 위반이 같이 있으면 위반을 가린다.**
   `bg-primary-container text-on-primary-container text-secondary-container` 같은 줄이
   `text-on-` 제외 필터에 통째로 걸려 사라진다. `-o` 로 토큰만 뽑아 개별 판정한다.

`outline #6f7a6b` 는 흰 배경에서 4.49:1, `surface` 위에서 4.29:1 이다. 본문에는 아슬아슬하니
**placeholder 와 보조 텍스트 전용**으로 쓰고 중요한 정보에는 쓰지 않는다.
`outline-variant #becab9` 는 흰 배경에서 **1.70:1** 이다. **텍스트로 쓰지 않는다** —
구분선과 테두리 전용이다.

색만으로 긴급도를 전달하지 않는다. 색과 함께 형태/문구(D-3, D-DAY)를 같이 쓴다.

---

## 2. 타이포그래피

```
--font-body:     Pretendard Variable → Pretendard → Inter → 시스템 한글 폰트
--font-headline: Plus Jakarta Sans → Pretendard Variable → ... → 시스템 한글 폰트
```

Pretendard 가 먼저 와야 한다. Inter / Plus Jakarta Sans 에는 한글 글리프가 없어서,
Pretendard 없이는 `Eatco` `D-3` `12,900` 같은 Latin 만 웹폰트로 렌더되고 한글은 OS 기본
폰트로 떨어져서 **같은 줄에 두 서체가 섞인다**.

### 한글 규칙

- `uppercase` 를 한글에 쓰지 않는다. 무효다.
- `letter-spacing`(`tracking-wider`)을 한글에 쓰지 않는다. 음절 블록이 분해되어 보인다.
- 한글 최소 크기는 **12px**. 한 음절에 자모 2~3개가 들어가므로 11px 한글은 8px Latin 수준이다.
- `word-break: keep-all` 을 전역 적용한다 (`index.css`). 없으면 어절 중간에서 줄바꿈된다.

캡스/트래킹 처리는 Latin 문자열에만 적용한다.

---

## 3. 형태와 깊이

실제로 쓰이고 있는 것:

- **카드 좌측 상태 바** — 폭 1, 높이 9의 둥근 막대로 신선도를 표시. 대시보드/재고/스캔결과 공통.
- **Pill 버튼** — 주요 CTA 는 `rounded-full` + `primary → primary-container` 그라디언트.
- **누름 반응** — 색 변경이 아니라 `active:scale-95`.
- **글래스모피즘** — 모달과 하단 네비게이션에 `backdrop-blur`.
- **앰비언트 섀도우** — `0 10px 40px rgba(25,28,27,0.04)`. 상단바/하단바에 적용.
- **모서리** — 카드 `rounded-2xl`~`rounded-[2.5rem]`, 칩/입력 `rounded-xl`.

그림자와 테두리를 금지하지 않는다. 이전 문서는 "No-Line" 과 "그림자 대신 톤 레이어링"을
규정했지만 코드는 `border-2` 와 `shadow-*` 를 광범위하게 쓰고 있고 결과물도 괜찮다.
지키지 않을 규칙은 적지 않는다.

---

## 4. 모바일 (iOS / Android)

이 앱은 사실상 전부 휴대폰에서, 홈화면에 설치된 상태로 쓰인다.

- `index.html` 의 viewport 에 **`viewport-fit=cover`** 필수. 없으면 `env(safe-area-inset-*)`
  가 항상 0 이라 아래 규칙이 전부 무효가 된다.
- 하단 네비게이션: `padding-bottom: max(1.5rem, env(safe-area-inset-bottom))`
- 상단바: `padding-top: env(safe-area-inset-top)`
- 본문 하단 여백: `calc(8rem + env(safe-area-inset-bottom))`
- **입력 요소는 16px 이상.** 미만이면 iOS 가 포커스 시 확대하고 되돌리지 않는다.
  `index.css` 에서 `input/select/textarea { font-size: max(16px, 1em) }` 로 전역 보장한다.
- `-webkit-tap-highlight-color: transparent` — 기본 반투명 사각형이 `active:scale-*` 와 겹쳐
  이중 깜빡임으로 보인다.
- `overscroll-behavior-y: none` (html) — iOS 스탠드얼론에서 문서 전체가 튕기는 것 방지.
  모달 스크롤 영역에는 `.modal-scroll` (`overscroll-behavior: contain`).
- 터치 타겟 최소 **48×48** (Android 기준. iOS 는 44).
- 여백은 `Layout` 이 소유한다. 페이지가 자체 `px-*` 를 덧붙이면 탭 전환 시 콘텐츠 가장자리가
  점프한다.

---

## 5. 상태

모든 데이터 화면은 네 상태를 구분해야 한다.

| 상태 | 표시 |
|---|---|
| 로딩 | 스켈레톤 (`animate-pulse`), `aria-busy` |
| 비어 있음 | 안내 + 등록 유도 |
| **오류** | **"불러오지 못했어요" + 다시 시도 버튼** |
| 정상 | 데이터 |

**"비어 있음"과 "오류"를 절대 같은 화면으로 처리하지 않는다.** 백엔드가 죽었을 때
"등록된 식재료가 없습니다 + 등록해보세요" 를 띄우면, 가족에게 냉장고가 비었다고 말하고
전부 다시 입력하라고 권하는 셈이 된다.

파괴적 동작(삭제)은 되돌리기(스낵바) 또는 확인을 제공한다.

---

## 6. 접근성

- 대비는 1절의 조합 표를 따른다.
- `outline-none` / `focus:ring-0` 을 쓸 때는 반드시 대체 포커스 표시를 둔다.
  `index.css` 에 전역 `:focus-visible` 이 있다.
- 클릭 가능한 `div` 에는 `role`, `tabIndex`, 키 핸들러를 붙이거나 `button` 을 쓴다.
- 아이콘 전용 버튼에는 `aria-label`.
- 상태 메시지에는 `role="status"`.

---

## 7. 영양 표시

수치는 전부 AI 추정이다. 공공데이터 식약처 API 는 계정 키가 해당 서비스에
등록돼 있지 않아 쓸 수 없다.

- **큰 숫자는 하나만.** kcal 하나. 10 단위 반올림 — 오차가 ±30~40% 인데 일의 자리는 허구다.
- **탄단지는 열량 비율 막대 하나.** 그램 비율로 그리면 지방이 9kcal/g 이라
  막대가 위의 kcal 과 반대되는 이야기를 한다.
- 그램 수치는 12px 한 줄. 궁금한 사람만 읽는다.
- **헤드라인 kcal 은 탄단지에서 역산한 값을 쓴다.** 그래야 사용자가 산수를 검산해도
  헤드라인과 그램 줄이 모순되지 않는다.
- 조리유·양념은 기록되지 않아 **항상 낮게** 나온다. 그걸 문구로 밝힌다.
- 반영되지 않은 재료는 개수와 이름을 밝힌다 ("재료 5개 중 4개 반영 · 소금 제외").
- **누적·추세선은 만들지 않는다.** 커버리지가 30~40% 라 그래프를 그리면 노이즈가
  신호처럼 보인다.

## 8. 모달

`hooks/useModal.ts` 를 쓴다. 직접 오버레이를 만들지 않는다.

- **Android 뒤로가기가 앱을 종료시키지 않게** history 항목을 쌓는다. 이게 가장 중요하다.
  홈화면에 설치된 PWA 는 브라우저 크롬이 없어서, 모달이 히스토리를 안 가지면
  뒤로가기가 라우트를 팝하고 앱이 그냥 닫힌다. 접근성이 아니라 데이터 유실 문제다.
- Escape, body 스크롤 잠금, 포커스 이동/복원, `role="dialog"` + `aria-modal` 포함.
- 스크롤 영역에 `.modal-scroll`.

## 9. 하지 말 것

- 핵심 동작을 `:hover` 뒤에 숨기지 않는다. 터치 기기에는 hover 가 없다.
  (대시보드의 "다 썼어요", 스캔결과의 삭제 버튼이 이 문제로 사실상 보이지 않았다.)
- `#000000` 대신 `on-surface #191c1b`.
- 정의되지 않은 토큰을 쓰지 않는다. Tailwind v4 는 모르는 키에 아무것도 생성하지 않고
  경고도 없다. (`surface-container-highest` 가 정의 없이 13곳에서 쓰이고 있었다.)
- 문자열 조작으로 Tailwind 클래스를 만들지 않는다 (`v.border.replace('border-','bg-')`).
  Tailwind 는 소스에 리터럴로 존재하는 클래스만 생성한다.
- `window.location.href` 로 화면 전환하지 않는다. 스탠드얼론 PWA 에서 콜드 부팅이 된다.
- 진행 상황을 모르면서 퍼센트 진행바를 그리지 않는다. 100%에서 멈춘 것처럼 보여서
  사용자가 작업을 취소한다. 불확정형을 쓴다.
- 되돌릴 수 없는 일괄 동작에 확인 단계를 빼지 않는다.
- 한글에 `uppercase` / `letter-spacing` 을 쓰지 않는다. 전자는 무효이고 후자는
  음절 블록을 분해한다. 한글 최소 크기는 12px.
