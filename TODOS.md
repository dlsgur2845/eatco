# TODOS

## Infrastructure

### 웹푸시가 구독만 받고 실제로 발송되지 않는다 (2026-08-26)

**What:** `frontend/public/sw.js` 에 `push` 핸들러가 있고
`POST /api/notifications/push-subscription` 으로 구독도 저장한다. 그런데 **그 구독으로
푸시를 보내는 코드가 어디에도 없다.** `worker/src/index.ts` 의 `scheduled` 핸들러는
`notification_logs` 행만 INSERT 한다 — 앱을 열어야만 보이는 인앱 알림이다.

**Why:** 소비기한 알림은 이 앱이 사용자가 **앱을 열지 않아도** 값을 주는 유일한 기능이다.
지금은 열어야만 알려주는 목록이다. `sw.js` 주석 자체가 "소비기한 알림이 이 앱의 존재
이유라 여기서 조용히 실패하면 안 된다" 고 적고 있다.

**Context:** VAPID 키 3종은 이미 `worker/src/lib/types.ts:8-10` 에 선언돼 있고
`GET /api/notifications/vapid-public-key` 도 있다. 빠진 건 발송뿐이다. Workers 에는
`web-push` npm 패키지를 그대로 못 쓰므로 VAPID JWT 서명을 `crypto.subtle` 로 직접 해야 한다.
`scheduled` 안에서 `notification_logs` INSERT 직후가 자연스러운 자리다.

**Effort:** L (사람) → M (CC)
**Priority:** P2
**Depends on:** VAPID 키를 wrangler secret 으로 실제 설정

### README 가 존재하지 않는 스택을 안내한다 (2026-08-26)

**What:** `README.md` 22·24·34행이 `FastAPI, SQLAlchemy 2.0`, `PostgreSQL 18`,
`docker compose up -d --build` 라고 적혀 있다. 백엔드는 Cloudflare Workers + D1 로 옮겨졌다.

**Why:** 공개 저장소(`dlsgur2845/eatco`)의 정문이 죽은 안내를 한다. CLAUDE.md 는 v1.7.0 에서
고쳤는데 README 는 같이 안 고쳐졌다.

**Context:** CLAUDE.md 의 현재 서술을 그대로 옮기면 된다. 10분.

**Effort:** S / S
**Priority:** P3
**Depends on:** None

### Web Share Target — 공유 시트에서 바로 스캔

**What:** `manifest.webmanifest` 에 `share_target` 을 넣어 사진첩·쿠팡 앱의
«공유 → Eatco» 가 곧바로 영수증 스캔으로 이어지게 한다.

**Why:** 앱 전환이 0회다. 클립보드 붙여넣기보다 단계가 더 적고, DESIGN.md 177행
"이 앱은 사실상 전부 휴대폰에서" 와 가장 잘 맞는 해법이다.

**Cons:** **iOS Safari 는 Web Share Target 을 지원하지 않는다.** 안드로이드 반쪽짜리다.
서비스워커에서 POST 를 받아 라우팅하는 코드도 필요하다.

**Effort:** M / S
**Priority:** P3
**Depends on:** None

### 「식재료 등록」 탭에 직접 입력 경로가 없다

**What:** `RegisterForm` 은 `InventoryPage.tsx:52` 안에만 있고 재고 탭의 등록 버튼으로만 닿는다.
「식재료 등록」이라는 이름의 탭(ScanPage)에는 손으로 하나 넣는 방법이 없다.

**Why:** 영수증이 없는 물건 하나를 넣으려면 탭을 잘못 찾아가야 한다.
`RegisterForm` 에는 이미 자동완성과 보관기한 가이드(`/storage-guide/suggest`)가 붙어 있어서
새 로직이 0줄이다. ScanPage 하단에 「직접 입력할게요」 를 놓고 띄우면 된다.

**Effort:** S / S
**Priority:** P3
**Depends on:** None

### D1 백업 — 스크립트는 생겼고, 자동화는 아직 (2026-08-21)

**What:** `scripts/backup-d1.sh` 가 원격 D1 을 `backups/` 에 SQL 로 덤프한다.
첫 백업을 실제로 떴고, 빈 sqlite 에 복원해서 열리는 것까지 확인했다
(사용자 2 / 가족 1 / 식재료 7 — 프로덕션과 일치).

**남은 일:** 아직 **수동이다.** 사람이 기억해야 도는 백업은 결국 안 돈다.
Cron Trigger 가 이미 매시 정각에 돌고 있으니(`wrangler.jsonc` 의 `triggers.crons`)
거기 붙이는 게 자연스럽지만, Worker 안에서는 `wrangler d1 export` 를 못 쓴다 —
D1 HTTP API 를 직접 부르거나 GitHub Actions 로 빼야 한다.
저장할 곳도 정해야 한다. R2 가 자연스러운데 이 계정은 R2 가 꺼져 있다(아래 항목).

**아는 것 두 가지:**
- `backups/` 는 gitignore 돼 있다. **실제 가족 데이터라 저장소에 넣으면 안 된다.**
- D1 은 무료 플랜에도 Time Travel(30일)이 있다. 잘못된 마이그레이션을 되돌리는
  데는 그쪽이 더 정확하다(`wrangler d1 time-travel info eatco`). 이 덤프는
  30일이 지났거나, DB 자체가 사라졌거나, 계정 접근을 잃은 경우를 위한 것이다.
  되돌림 지점은 `backups/ROLLBACK.md` 에 적어뒀다(gitignore 안이라 로컬에만 있다).

**Effort:** M
**Priority:** P2
**Depends on:** R2 활성화 (저장 위치를 R2 로 할 경우)

### CI/CD 자동 배포가 트리거되지 않음

**What:** Workers Builds 가 push 에 반응하지 않는다. `total_count: 0`.

**Why:** 매번 로컬에서 `wrangler deploy` 를 手動으로 돌려야 한다. 배포와 커밋이
갈라질 수 있다.

**Context:** Cloudflare 대시보드에서 Disconnect 후 재연결하고 Build command 를
`npm run build` 로 지정해야 한다. 대시보드 조작이 필요해서 코드로 못 고친다.

**Effort:** S
**Priority:** P2
**Depends on:** None

### 빈 상태 아이콘이 거의 안 보인다

**What:** `notifications_off`(1.62:1), `photo_camera`(1.68:1),
`restaurant`(1.95:1). 옆에 설명 글이 있어서 WCAG 위반은 아니지만(장식으로
분류), 눈으로 보면 거의 안 보인다.

**Why:** 빈 상태에서 아이콘은 "여기가 비었다" 를 한눈에 알리는 역할인데
지금은 배경에 묻힌다. 예전에 10px 아이콘이 "의미를 알 수 없는 점 하나" 로
보였던 것과 같은 종류다.

**Context:** `opacity: 0.4~0.5` 와 `text-outline-variant` 가 겹쳐서 그렇다.
둘 중 하나만 쓰면 된다.

**Effort:** S
**Priority:** P4
**Depends on:** None

### 대시보드 HTML 이 엣지에 캐시된다

**What:** 배포 직후 `https://eatco.dlsgur2845.workers.dev/` 를 그냥 받으면
**이전 번들 해시**를 가리키는 HTML 이 온다. `?cb=<타임스탬프>` 나
`Cache-Control: no-cache` 를 붙이면 새 해시가 온다.

**Why:** 자산 파일명이 내용 해시라 결국 스스로 낫는다(옛 HTML → 옛 자산, 둘 다
아직 존재). 하지만 배포 직후 "왜 안 바뀌지" 로 시간을 쓰게 된다. 실제로
이번에 배포가 실패한 줄 알고 한 번 확인했다.

**Context:** `wrangler.jsonc` 의 assets 설정에 HTML 만 `no-cache` 로 두는
헤더 규칙을 넣으면 된다. 자산은 지금처럼 오래 캐시해도 안전하다.

**Effort:** S
**Priority:** P4
**Depends on:** None

### 가입 자체는 여전히 누구나 할 수 있다 (막는 건 로그인)

**What:** 승인제는 **로그인**을 막는다. `POST /api/auth/register` 는 여전히
누구에게나 열려 있고, 아무나 users 행을 만들 수 있다.

**Why:** 승인 대기 계정이 쌓이면 관리자 목록이 그걸로 덮인다. D1 쓰기도
계정당 1행씩 든다(무료 10만/일). 가족·알림 설정을 미승인 상태에서 만들지 않게
고쳤으므로 계정당 9행 → 1행으로 줄었지만, 0은 아니다.

**Context:** 지금은 URL 을 아는 사람이 사실상 가족뿐이라 급하지 않다.
필요해지면 register 에 IP 기준 상한을 두거나, 같은 이메일 재시도를 조용히
성공시키는(계정은 안 만드는) 방식이 있다. Cloudflare Rate Limiting 규칙을
Worker 앞에 두는 게 제일 싸다.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Gemini 쿼터를 얼마나 쓰는지 아무도 모른다 (2026-08-23 갱신)

**What:** 레시피 검토(개선/공개)와 영수증 스캔이 같은 Gemini 키를 쓴다.
무료 티어는 하루 요청 수가 정해져 있는데 **사용량을 볼 방법이 없다.**

**바뀐 것 (v1.7.0):** 등록할 때마다 Gemini 를 부르던 `moderate()` 가 없어졌다.
이제 작성자가 «개선 검토»(요리별 시간당 1회) 나 «공개 검토» 를 눌렀을 때만
부르고, 내용이 안 바뀐 재공개는 아예 안 부른다. 압력이 크게 줄었다.

**Why:** 그래도 관측 수단이 없다는 건 그대로다. 쿼터가 소진되면 **영수증 스캔이
먼저 죽는다** — 매일 쓰는 기능이 어쩌다 쓰는 기능 때문에 멈춘다. 지금은 얼마나
남았는지 알 방법이 없어서, 죽고 나서야 안다.

**Effort:** S
**Priority:** P3
**Depends on:** None

### R2 가 계정에서 활성화돼 있지 않다

**What:** `wrangler.jsonc` 에 `eatco-uploads` 바인딩이 있지만 런타임에
`code 10042: Please enable R2 through the Cloudflare Dashboard` 로 실패한다.

**Why:** 지금은 쓰는 코드가 없어서 영향이 없다. 다만 **바인딩이 있고 배포도
통과하기 때문에** 다음에 누가 R2 를 쓰려고 하면 조용히 실패한다. 실제로 레시피
카탈로그 캐시를 R2 에 넣었다가 try/catch 에 삼켜져 아무 일도 안 하고 있었다.

**Context:** 대시보드에서 R2 를 켜면 된다(무료 티어 10GB). 안 켤 거라면
`wrangler.jsonc` 의 `r2_buckets` 와 `Env.UPLOADS` 타입을 지우는 게 정직하다.
영수증 원본 이미지 보관 같은 걸 하려면 필요하다.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Notifications

### Web Push 가 설정된 적이 없다

**What:** `/api/notifications/vapid-public-key` 가 503 을 반환한다. 매 세션 콘솔 에러 1건.

**Why:** 소비기한 알림이 앱을 열었을 때만 보인다. 푸시의 요점을 못 살리고 있고,
사용자에게는 원인 모를 콘솔 에러로 남는다.

**Context:** 두 가지가 다 없다 — VAPID 시크릿(`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`)이
등록되지 않았고, **발송 코드 자체가 없다.** `frontend/public/sw.js` 에 `push` 핸들러는
있지만 그걸 깨울 서버 코드가 없다. 키만 넣는다고 동작하지 않는다.

**Effort:** L
**Priority:** P2
**Depends on:** None

## Frontend

### 상단 고정 컨트롤 — 다른 화면

**What:** InventoryPage 필터 칩, ExpensesPage 탭, AdminPage 탭이 스크롤하면 사라진다.

**Why:** 식단 탭과 같은 패턴이지만 **자동 스크롤이 없다.** 사용자가 직접 내려간 것이라
되돌아가는 건 자기 행동의 되돌리기다. 식단만 앱이 강제로 1000px 밀어냈다.

**Context:** 식단에 넣은 스크롤-오프 방식(`.cal-subbar` in `index.css`)이 자리를 잡으면
같은 패턴을 적용할지 판단한다. 해당 위치: `InventoryPage.tsx:651`,
`ExpensesPage.tsx:205`, `AdminPage.tsx:374`.

**Effort:** M
**Priority:** P3
**Depends on:** 식단 스크롤-오프 바가 실사용에서 검증될 것

### `korean.ts` 가 프론트/워커에 이중으로 존재

**What:** `frontend/src/lib/korean.ts` 와 `worker/src/lib/korean.ts` 가 같은 파일이다.

**Why:** 한쪽만 고치면 알림 문구와 화면 문구의 조사가 갈린다.

**Context:** 두 빌드가 패키지를 공유하지 않아서 복제했다. 지금은
`frontend/src/lib/korean.test.ts` 가 **양쪽을 모두 import 해서 같은 단언을 돌리는 것**으로
드리프트를 막고 있다 — 고정 단언 21건 + 단어 27개 × 조사 11개 전수 대조. 공유 패키지를 만들면 더 깨끗하지만, 솔로 프로젝트에
워크스페이스 빌드 설정을 얹는 비용이 더 크다고 판단했다.

**Effort:** M
**Priority:** P3
**Depends on:** None

### e2e 스펙이 저장소에 없다

**What:** 레이아웃·스크롤 검증을 매번 임시 Playwright 스크립트로 하고 있다.

**Why:** jsdom 은 레이아웃을 계산하지 않는다 — 고정 바 위치, 폭 맞춤, 터치 타겟
크기는 **실제 브라우저로만** 검증된다. 지금은 그 검증이 커밋되지 않아 다음 변경에서
조용히 깨질 수 있다.

**Context:** 최소 스펙: 320/360/390px 에서 (a) 컨트롤 바가 실제 상단바 아래 고정,
(b) 오늘 카드가 바에 가리지 않음, (c) 모든 컨트롤 >= 44x44. Playwright 를 devDeps 에
넣으면 `npm install` 이 브라우저 ~150MB 를 받는다. 솔로 프로젝트에 그만한 값을 하는지
판단 필요.

**Effort:** M
**Priority:** P3
**Depends on:** None

### 아이콘 크기 클래스가 앱 전체에서 무시된다

**What:** `text-sm` / `text-4xl` 같은 클래스가 `.material-symbols-outlined` 에 안 먹는다.
전부 24px 로 그려진다.

**Why:** 구글 폰트 스타일시트가 **레이어 밖** 저자 CSS인데 Tailwind v4 는
`@layer utilities` 로 내보낸다. 같은 명시도면 레이어 밖이 이긴다. 그래서
`.material-symbols-outlined { font-size: 24px }` 가 유틸리티를 덮는다.

**Context:** 인라인 `style={{fontSize}}` 만 이긴다 — `RecipeCard.tsx` 와
`NotificationsPage.tsx` 가 그렇게 하고 있다. 빈 상태의 `text-6xl` 일러스트
아이콘(`InventoryPage.tsx:719`, `ExpensesPage.tsx:138`)이 의도와 달리 24px 다.
`index.css` 에서 `.material-symbols-outlined { font-size: inherit }` 를 주고
크기를 유틸리티로 넘기는 방법이 있다. 앱 전역이라 한 번에 봐야 한다.

**Effort:** M
**Priority:** P3
**Depends on:** None

### `today` 가 마운트 시점에 고정된다

**What:** `const today = useMemo(() => kstToday(), [])` — 화면을 켜둔 채 자정을
넘겨도 갱신되지 않는다.

**Why:** 주방에 태블릿을 켜두거나 설치형 PWA 를 안 닫는 사용법에서, 자정을 넘기면
어제 카드에 "오늘" 배지가 그대로 붙어 있고 "오늘로" 가 어제로 데려간다.

**Context:** `visibilitychange` 나 자정 타이머로 다시 계산하면 된다. 컨트롤이
상시 도달 가능해지면서 "오늘로" 를 누를 일이 늘어 더 잘 드러난다.

**Effort:** S
**Priority:** P3
**Depends on:** None

### 기간 전환 중 빈 카드 구간

**What:** ◀/▶ 를 누르면 응답이 올 때까지 ~250ms 동안 라벨은 새 기간인데 카드가
비어 있고, 로딩 표시도 빈 상태 안내도 안 나온다.

**Why:** 첫 로드 이후에는 스켈레톤을 일부러 억제한다(`booted.current`). 깜빡임을
피하려던 건데, 컨트롤이 상시 도달 가능해져 기간 이동이 잦아지면 이 구간이 자주 보인다.

**Context:** 요청 순서 가드는 잘못된 데이터가 그려지는 걸 막지만 이 공백은 못 막는다.
기간 이동일 때만 얕은 로딩 표시를 주는 방법이 있다. 요청 취소(`AbortController`)도
없어서 연타하면 왕복이 그대로 다 나간다.

**Effort:** S
**Priority:** P4
**Depends on:** None

### 워커에 테스트 러너가 없다 (일부 우회 중)

**What:** `worker/` 에 테스트 프레임워크가 없어 `worker/src/routes/` 는 커버리지 0% 다.

**Why:** 알림 문구 생성처럼 사용자가 매일 보는 문자열이 프론트 테스트가
`worker/src/lib/korean.ts` 를 건너서 import 할 때만 검증된다. 라우트 로직
(422 가드, 알림 조립)은 전혀 안 잡힌다.

**Context:** `vitest` + `@cloudflare/vitest-pool-workers`, 또는 D1 을 스텁한 평범한
vitest 로도 된다. 그러면 "송인혁님이 8월 21일 아침에 계란후라이를 올렸어요" 를
끝에서 끝까지 단언할 수 있다.

**Effort:** M
**Priority:** P3
**Depends on:** None

### 재고 화면과 「나의 요리」 렌더 상태에 테스트가 없다 (2026-08-27)

**What:** v1.9.0 커버리지 감사에서 남긴 구멍 세 곳이다.
`InventoryPage.tsx` 는 **테스트 파일 자체가 없고**, `MyRecipesPage` 는 순수 함수
(`groupRecipes`)만 테스트돼 있고 렌더 4상태(스켈레톤·빈·오류·묶음)와 검토 패널
배선은 안 잡힌다. `getMyRecipes` 도 직접 테스트가 없다.

**Why:** 이번 릴리스에서 고친 재고 수정 버그(`put` → `patch`)가 바로 그
테스트 없는 파일에서 나왔다. 요청 방식 한 글자가 틀려서 저장이 **조용히**
실패하고 있었고, 화면은 아무 말도 안 했다. 같은 자리에서 같은 종류가 또 난다.

**Context:** `MvpDashboardPage.test.tsx` 가 이번에 생겼으니 목킹 패턴은 그대로
가져다 쓰면 된다(`api/scan` 목 + `renderWithRouter`). 재고 쪽은 "수정 폼을 저장하면
PATCH 가 나간다" 한 줄이면 이번 버그를 잡는다.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Calendar

### 월별 보기가 점만 보여준다

**What:** 월 격자에 메뉴 이름이 없고 점 3개까지만 표시된다.

**Why:** "뭐 먹지" 에 답하지 못하는 보기다. 화면의 31% 가 크롬이고 격자는 작다.

**Context:** 390px 에서 칸당 45px 라 두 글자도 안 들어간다. 사용자가 **하루 전에 직접
요청한 기능**이고 실사용 데이터가 없어서 유예했다. 몇 주 써보고 판단한다.

**Effort:** L
**Priority:** P4
**Depends on:** 실사용 관찰

### 주 보기에서 지나간 날짜 카드 접기

**What:** 월~목이 지났어도 224px 짜리 카드로 자리를 다 차지한다.

**Why:** 주 문서가 2182px 인 근본 원인이다. 접으면 ~850px 로 줄고 자동 스크롤 자체가
거의 불필요해진다. CEO/디자인 리뷰어가 독립적으로 같은 제안을 했다.

**Context:** 재보니 문서는 줄어도 토글은 여전히 235px 위에 남아서 고정 바를 대체하지
못한다. 그리고 식단 화면 렌더링 방식을 바꾸는 건 요청 범위를 넘어서 유예했다.

**Effort:** M
**Priority:** P4
**Depends on:** None

## Housekeeping

### `wip/cooking-log-v1` 브랜치가 죽어 있다

**What:** 로컬/원격 모두에 있는데 `main` 에 없는 커밋이 **0개**다.

**Why:** 이미 합쳐진 브랜치가 남아 있으면 다음에 볼 때 "여기 뭐가 있나" 를 다시 확인하게 된다.

**Context:** `git branch -d wip/cooking-log-v1 && git push origin --delete wip/cooking-log-v1`.

**Effort:** S
**Priority:** P4
**Depends on:** None

### 가족 구성원 둘 다 관리자다

**What:** 프로덕션 계정 2개(송인혁, 손보경)가 모두 `role='admin'` 이다.

**Why:** 관리자는 **모든 가족의 데이터**를 보고 사용자를 지울 수 있다.
가족 구성원이라고 그 권한이 필요한 건 아니다. 손보경님이 의도적으로
관리자인지, 첫 설정 때 그렇게 된 건지 확인이 필요하다.

**Context:** 예전 TODO 는 이 둘을 "테스트 계정" 이라고 적어뒀는데 틀렸다 —
실제 사용 중인 계정이다. 관리자 화면에서 역할만 바꾸면 된다(1클릭).

**Effort:** S
**Priority:** P3
**Depends on:** 사용자 확인

## 식단 ↔ 레시피 (2026-08-23 이후)

식단에 레시피를 붙이는 기능이 들어갔다 (검색 → 선택 → 부족한 재료).
그때 범위 밖으로 미뤄둔 것들이다. 전부 blast radius 밖이거나 요청 밖이었다.

### 레시피 상세에서 "이 날 식단으로" (역방향)

**What:** 지금은 식단 → 레시피 방향만 된다. 레시피를 보다가 "이거 화요일에
해먹자" 를 하려면 식단 탭으로 가서 다시 검색해야 한다.

**Why:** 자연스러운 반대 방향이다. 다만 날짜·끼니를 고르는 UI 가 새로 필요하다.

**Effort:** M  **Priority:** P3  **Depends on:** None

### 부족한 재료 → 냉장고에 바로 추가

**What:** 식단 상세의 "부족한 재료" 를 눌러 냉장고 등록 화면으로 넘긴다.

**Why:** 부족 목록의 다음 행동이 장보기이고, 장을 보면 냉장고에 넣는다.
지금은 그 사이를 손으로 건너야 한다.

**Effort:** M  **Priority:** P3  **Depends on:** None

### 초성 검색 (ㄱㅊㅉㄱ → 김치찌개)

**What:** 검색이 지금은 완성된 음절만 본다.

**Why:** 폰에서 초성만 치는 사람이 많다. 한글 자모 분해가 필요하다
(`lib/nickname.ts` 에 자모 판별 코드가 이미 조금 있다).

**Effort:** M  **Priority:** P4  **Depends on:** None

### "이번 주 장볼 것" 합계 화면

**What:** 주간 식단의 부족한 재료를 전부 모아 한 목록으로.

**Why:** 지금은 식단을 하나씩 열어야 뭘 사야 할지 안다. 주간 카드의
"N개 부족" 배지가 그 신호의 절반만 준다.

**Context:** 서버가 이미 식단마다 `missing_items` 를 계산한다. 주 단위로
합치고 중복만 제거하면 된다 — 새 계산이 필요 없다.

**Effort:** L  **Priority:** P3  **Depends on:** None

### 식단 알림 문구에 부족 재료 한 줄

**What:** "새 식단이 올라왔어요" 알림에 "두부, 대파가 없어요" 를 덧붙인다.

**Why:** 크기는 작지만(3줄) **알림 문구는 "친절" 이 "소음" 으로 바뀌는 자리다.**
알림에 정보를 하나 더 넣을 때마다 알림 전체를 무시하게 될 위험이 는다.
넣기 전에 실제로 알림을 읽는지 보는 게 낫다.

**Effort:** S  **Priority:** P4  **Depends on:** None

### GET /calendar 에 LIMIT 이 없다

**What:** 주간·월간 조회가 `WHERE plan_date BETWEEN ?` 만 걸고 상한이 없다.

**Why:** 실제로는 31일 × 3끼로 묶여 있어서 문제가 안 된다. 다만 한 끼에
식단을 여러 개 올릴 수 있으므로 이론상 상한이 없다. D1 은 스캔한 행 수로
과금한다.

**Effort:** S  **Priority:** P4  **Depends on:** None

### RecipeDetailModal 의 팁이 이모지를 아이콘으로 쓴다

**What:** `RecipeDetailModal.tsx` 의 팁 블록이 전구 이모지를 장식으로 쓴다.

**Why:** 이모지를 UI 장식으로 쓰는 건 "AI 가 만든 화면" 신호 중 하나다.
옆에 글이 있어서 치명적이진 않다. Material Symbols 아이콘이 이미 전역에 있다.

**Effort:** S  **Priority:** P4  **Depends on:** None

### 레시피 카탈로그 갱신이 수동이다 (2026-08-23)

**What:** 카탈로그를 배포 자산으로 구웠다. 갱신하려면
`node scripts/build-recipe-catalog.mjs` → 커밋 → 배포를 사람이 해야 한다.

**Why:** 식품안전나라 1,156건은 거의 안 바뀌는 공공 데이터라 급하지 않다.
다만 «언제 마지막으로 받았는지» 를 아무도 모른다. 파일에 생성 시각이 없다.

**Context:** 자동화하려면 GitHub Actions 가 필요한데, 이 저장소는 CI 자동 배포
자체가 아직 안 돈다(위 항목). 그게 먼저다.
작은 개선: 빌드 스크립트가 파일에 생성 시각을 같이 넣게 하면 «6개월 된 카탈로그»
를 알아챌 수 있다.

**Effort:** S  **Priority:** P4  **Depends on:** CI/CD 자동 배포

### 카탈로그 JSON 이 공개 URL 로 노출된다

**What:** `/recipe-catalog-full.json` (1.66MB) 을 누구나 받을 수 있다.

**Why:** 공공 데이터라 유출 문제는 없다. 다만 크롤러가 반복해서 받으면
Workers 무료 요청 한도(10만/일)를 먹는다. 지금 규모에선 문제없다.

**Context:** 막으려면 자산이 아니라 D1 이나 KV 로 옮겨야 한다. 그때는 콜드
문제가 다시 생기므로 거래가 나쁘다. 그냥 기록해 둔다.

**Effort:** —  **Priority:** P4  **Depends on:** None


## Completed

### 오래된 `pending` 레시피를 아무도 안 본다
**Completed:** v1.7.0 (2026-08-23)

레시피 검토 흐름으로 **갇힐 구간 자체가 없어졌다.** 등록할 때 자동 검열을 하지
않으므로 `pending` 이 생기지 않고, 0008 마이그레이션에서 그 상태를 스키마
CHECK 절에서 지웠다 (`none`/`approved`/`rejected` 만 남았다). 검토는 작성자가
눌러서 그 자리에서 끝나고, Gemini 가 실패하면 아무것도 기록하지 않는다 —
빈 결과가 시간 제한을 먹어서 한 시간 동안 다시 못 받는 일을 막기 위해서다.

<details><summary>원래 항목</summary>


**What:** Gemini 호출이 실패하면 레시피가 `pending` 으로 남는다. 작성자에게는
«검토 중» 으로 보이고, 다른 사람에게는 아예 안 보인다. 되살릴 경로가 없다.

**Why:** 정상 작성자의 정상 레시피가 Gemini 장애 때문에 영영 안 보이게 된다.
작성자는 왜인지 모른다.

**Context:** 관리자 화면에 «검토 중» 목록과 수동 승인 버튼을 두거나,
Cron 이 오래된 pending 을 재시도하면 된다. 스키마는 이미 준비돼 있다
(`status`, `status_reason`, `moderated_at`).

**Effort:** S
**Priority:** P3
**Depends on:** None

</details>
