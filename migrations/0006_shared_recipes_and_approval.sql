-- 0006 — 공유 레시피 + 가입 승인제 + 관리자 사용자 삭제 버그 수정
--
-- 세 가지를 한 번에 한다. 앞의 둘은 새 기능이고, 마지막은 **이미 살아 있는 버그**다.
-- 새 테이블에 같은 모양의 FK 를 또 만들기 전에 원본을 고친다.

PRAGMA defer_foreign_keys = true;

-- ── 1. 관리자 사용자 삭제가 500 나던 버그 ────────────────────────────
--
-- meal_plans.created_by 와 meal_comments.created_by 가
-- `TEXT REFERENCES users(id)` 로만 선언돼 있다. ON DELETE 가 없으면 SQLite 는
-- NO ACTION 이고, D1 은 FK 를 강제한다. 그래서 식단을 한 번이라도 올린 사용자를
-- 관리자 화면에서 지우면 `FOREIGN KEY constraint failed (19)` 가 나고,
-- db.batch() 가 원자적이라 삭제 전체가 롤백된다.
--
-- 로컬 sqlite 로 admin.ts 의 배치를 그대로 재현해 확인했다.
-- 지금까지 안 터진 건 meal_plans 가 0행이기 때문이다. 캘린더를 쓰는 순간 터진다.
--
-- 0004 의 주석은 이미 의도를 적어놨다 —
--   "created_by 는 NULL 이 될 수 있지만 이 컬럼은 남는다"
-- 의도는 ON DELETE SET NULL 이었는데 SQL 이 그 말을 안 했다. 이제 말하게 한다.
-- SQLite 는 FK 를 ALTER 로 못 바꾸므로 테이블을 다시 만든다 (둘 다 0행).

CREATE TABLE meal_plans_new (
  id              TEXT PRIMARY KEY,
  family_id       TEXT NOT NULL REFERENCES families(id),
  plan_date       TEXT NOT NULL,
  meal_slot       TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner')),
  title           TEXT NOT NULL,
  memo            TEXT,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
INSERT INTO meal_plans_new SELECT * FROM meal_plans;
DROP TABLE meal_plans;
ALTER TABLE meal_plans_new RENAME TO meal_plans;
CREATE INDEX ix_meal_plans_family_date ON meal_plans(family_id, plan_date);

CREATE TABLE meal_comments_new (
  id              TEXT PRIMARY KEY,
  meal_plan_id    TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  family_id       TEXT NOT NULL REFERENCES families(id),
  body            TEXT NOT NULL,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
INSERT INTO meal_comments_new SELECT * FROM meal_comments;
DROP TABLE meal_comments;
ALTER TABLE meal_comments_new RENAME TO meal_comments;
CREATE INDEX ix_meal_comments_plan ON meal_comments(meal_plan_id, created_at);

-- ── 2. 가입 승인제 ────────────────────────────────────────────────
--
-- 지금까지 가입이 완전히 열려 있었다 (초대·허용목록·이메일 인증 전부 없음).
-- URL 만 알면 누구나 계정을 만들었다. 아래 공유 레시피가 "모든 사용자가 읽는
-- 쓰기 가능한 데이터" 라서, 그대로 두면 모르는 사람이 쓴 글을 가족이 읽게 된다.
--
-- 기존 사용자는 전부 승인 상태로 올린다. 새 가입은 0 으로 들어오고
-- 관리자가 승인해야 로그인이 된다 (첫 가입자=관리자 1호는 자동 승인).
ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;
UPDATE users SET approved = 1;

-- ── 3. 공유 레시피 ────────────────────────────────────────────────
--
-- **이 테이블은 가족 스코프가 아니다.**
-- admin.ts 의 가족 삭제 배치와 auth.ts 의 가족 정리 배치에 넣지 말 것.
-- 가족이 사라져도 레시피는 남는다.
--
-- 이름이 custom_recipes 가 아닌 이유: 0001 에 같은 이름의 가족 스코프 테이블이
-- 있었고 0004 에서 지웠다 (5개월간 0행). git log 가 되돌리기처럼 읽히지 않게
-- 새 이름을 쓴다. 설계도 다르다 — 그때는 family_id NOT NULL 이었다.
CREATE TABLE shared_recipes (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  category       TEXT NOT NULL,
  cooking_method TEXT NOT NULL,
  -- JSON 배열. 0001 의 custom_recipes 와 같은 표현을 쓴다.
  -- 재료로 인덱스를 걸 수 없다는 뜻이기도 하다 — 지금 규모에선 문제없다.
  ingredients    TEXT NOT NULL,
  manual_steps   TEXT NOT NULL,
  tip            TEXT,
  -- Gemini 가 추정한 칼로리. 사용자에게 묻지 않는다 (아무도 모른다).
  calories       TEXT,

  -- 작성자 세 컬럼. 하나로 합치면 안 된다.
  --   author_id   : 계정이 살아 있는 동안의 링크. 탈퇴하면 NULL 이 된다.
  --   author_name : 표시용 스냅샷. 기명일 때만 밖으로 나간다.
  --   author_key  : HMAC(SECRET_KEY, user.id). FK 가 없어서 탈퇴해도 남는다.
  --                 한 사람의 글을 모아 보거나 등록 빈도를 세는 데 쓴다.
  --                 새어나가도 읽는 쪽에 아무 의미가 없다.
  author_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name    TEXT NOT NULL,
  author_key     TEXT NOT NULL,
  is_anonymous   INTEGER NOT NULL DEFAULT 0,

  -- pending 이 기본이다. Gemini 가 죽어도 등록은 되고, 작성자에게만 보인다.
  -- CHECK 는 CREATE TABLE 에 있어야 한다 — SQLite 는 ALTER 로 못 붙인다
  -- (0003 에서 이미 겪었다).
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  status_reason  TEXT,
  moderated_at   TEXT,

  created_at     TEXT NOT NULL
);

-- 목록 조회는 (status, 최신순) 하나뿐이다. 인덱스가 없으면 D1 이 전 행을 스캔하고,
-- D1 은 **스캔한 행 수**로 과금한다 (무료 5M행/일, 계정 전체 공유).
CREATE INDEX ix_shared_recipes_status ON shared_recipes(status, created_at DESC);
-- "내가 쓴 글" 과 등록 빈도 제한이 이걸 탄다.
CREATE INDEX ix_shared_recipes_author ON shared_recipes(author_key, created_at DESC);
