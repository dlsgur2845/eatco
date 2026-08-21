# TODOS

## Infrastructure

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

### 공유 레시피 검열이 Gemini 쿼터를 영수증 스캔과 나눠 쓴다

**What:** `/api/shared-recipes` 등록마다 Gemini 를 한 번 부른다(`moderate()`).
영수증 스캔도 같은 키를 쓴다. 무료 티어는 하루 요청 수가 정해져 있다.

**Why:** 쿼터가 소진되면 **영수증 스캔이 먼저 죽는다** — 매일 쓰는 기능이
어쩌다 쓰는 기능 때문에 멈춘다. 지금은 작성자당 하루 10건 상한
(`DAILY_LIMIT`)이 사실상 유일한 방어선이다. 가입 승인제가 있어서 임의의
사람이 늘어나진 않지만, 승인된 사용자 몇 명이 같은 날 몰리면 닿는다.

**Context:** 검열 실패는 `pending` 으로 남고 자동 승인/거절을 하지 않으므로
안전한 쪽으로 실패한다. 즉 지금 당장 위험하진 않고, 쿼터를 다 쓰면 새 레시피가
공개되지 않을 뿐이다. 관측 수단이 없다는 게 진짜 문제다 — 쿼터를 얼마나
쓰고 있는지 아무도 모른다.

**Effort:** S
**Priority:** P3
**Depends on:** None

### 오래된 `pending` 레시피를 아무도 안 본다

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

### 테스트 계정 2개가 관리자 목록에 남아 있다

**What:** `nt-a-1787234799@example.com`, `nt-b-1787234799@example.com` (닉네임 엄마/아빠).

**Why:** 관리자 화면에 실제 가족이 아닌 계정이 섞여 보인다.

**Context:** 이전 세션에서 가족 합류 기능을 검증하느라 만든 계정이다. 관리자 화면의
사용자 삭제로 지우거나 D1 에서 직접 지운다. 같은 가족에 묶여 있는지 먼저 확인할 것.

**Effort:** S
**Priority:** P4
**Depends on:** None

## Completed

### 캘린더 날짜 헬퍼 테스트 없음

**What:** `weekStart` / `shiftMonth` / `daysInMonth` / `gridIndex` / `monthStart` 가
`CalendarPage.tsx` 안에 export 없이 있어 테스트가 불가능했다.

**Context:** `frontend/src/components/calendar/dates.ts` 로 추출하고 22건의 테스트를
붙였다. 말일 넘침(`1월 31일 + 1개월`), 일요일→직전 월요일, 연 경계를 포함한다.

**Completed:** v1.6.0 (2026-08-21)

### 한국어 조사가 `을(를)` 로 화면에 노출

**What:** 알림에 "계란후라이을(를) 올렸어요" 로 나왔다. 5곳에서 같은 패턴.

**Context:** `lib/korean.ts` 에 받침 판정(`(code - 0xAC00) % 28`)과 조사 선택을 넣고
5곳에 적용했다. 프론트/워커 두 사본에 같은 테스트를 돌려 드리프트를 막는다.

**Completed:** v1.6.0 (2026-08-21)
