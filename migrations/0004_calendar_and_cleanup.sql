-- 가족 식단 캘린더 + 죽은 테이블 정리.
--
-- 정리 대상은 전부 0행이고 코드 참조도 없음을 확인하고 지운다:
--   cooking_logs / cooking_log_items — 요리 기록 화면이 삭제되면서 고아가 됐다
--   custom_recipes                   — 내 레시피 화면이 삭제되면서 고아가 됐다
--   storage_guides                   — 보관법 기능은 data/storage-guides.ts 상수에서
--                                      읽는다. 테이블은 만들어만 놓고 한 번도 안 썼다
--   ingredient_nutrition             — 영양 계산 화면을 걷어내기로 했다
--
-- 자식 테이블을 먼저 지운다. FK 순서를 틀리면 통째로 실패한다.
DROP TABLE IF EXISTS cooking_log_items;
DROP TABLE IF EXISTS cooking_logs;
DROP TABLE IF EXISTS custom_recipes;
DROP TABLE IF EXISTS storage_guides;
DROP TABLE IF EXISTS ingredient_nutrition;

-- ── 식단 ─────────────────────────────────────────────────────
--
-- 범용 캘린더가 아니라 식단표다. 시간·반복·참석자 같은 필드를 만들면
-- 대부분 비어 있게 된다. 필요한 건 날짜 + 끼니 + 뭘 먹을지 세 개다.
CREATE TABLE meal_plans (
  id              TEXT PRIMARY KEY,
  family_id       TEXT NOT NULL REFERENCES families(id),
  -- 'YYYY-MM-DD' (KST 기준). lib/dates.ts 의 todayKst() 와 같은 표현.
  plan_date       TEXT NOT NULL,
  meal_slot       TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner')),
  title           TEXT NOT NULL,
  memo            TEXT,
  created_by      TEXT REFERENCES users(id),
  -- 이름 스냅샷. 관리자가 계정을 지워도 "누가 적었는지" 는 남아야 한다.
  -- created_by 는 NULL 이 될 수 있지만 이 컬럼은 남는다.
  created_by_name TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- 주간 조회가 유일한 읽기 패턴이다. (가족, 날짜) 복합 인덱스면 충분하다.
CREATE INDEX ix_meal_plans_family_date ON meal_plans(family_id, plan_date);

-- ── 댓글 ─────────────────────────────────────────────────────
CREATE TABLE meal_comments (
  id              TEXT PRIMARY KEY,
  meal_plan_id    TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  -- family_id 를 중복 저장한다. 권한 검사를 조인 없이 하기 위해서다.
  -- 댓글 쿼리 전부가 "내 가족 것인가" 를 먼저 물어보는데, 그때마다
  -- meal_plans 를 조인하면 코드가 지저분해진다.
  family_id       TEXT NOT NULL REFERENCES families(id),
  body            TEXT NOT NULL,
  created_by      TEXT REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX ix_meal_comments_plan ON meal_comments(meal_plan_id, created_at);
