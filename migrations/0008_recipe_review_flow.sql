-- 0008 — 레시피: 가족 범위 기본 + 개선/공개 검토
--
-- 바뀌는 것:
--   1. 등록하면 **가족만** 본다. 공개는 작성자가 눌러야 일어난다.
--   2. 등록 시 자동 검열이 없어진다. 공개 검토가 그 자리를 대신한다.
--   3. 수정하면 승인이 풀린다. 단 내용이 그대로면 안 풀린다.
--
-- `pending` 상태가 사라진다. 예전에는 등록 직후 waitUntil 로 Gemini 를 돌리고
-- 결과를 기다렸는데, Gemini 가 실패하면 pending 에 갇혀서 아무도 다시 안 봤다
-- (재시도 Cron 도, 관리자 화면도 없었다). 이제 검토는 사용자가 눌러서 그 자리에서
-- 끝나므로 갇힐 구간 자체가 없다.
--
-- 프로덕션 0행이라 재생성이 안전하다. CHECK 는 ALTER 로 못 붙이므로
-- CREATE TABLE 에서 넣는다 (0003·0006 에서 이미 겪었다).

PRAGMA defer_foreign_keys = true;

CREATE TABLE shared_recipes_new (
  id             TEXT PRIMARY KEY,

  /* 가족 범위. 공개 전까지 이 가족만 본다.
     NULL 을 허용하는 이유: 작성자가 가족을 떠나도 글은 남아야 한다.
     그때는 공개된 것만 보이고 가족 목록에서는 빠진다. */
  family_id      TEXT REFERENCES families(id) ON DELETE SET NULL,

  title          TEXT NOT NULL,
  category       TEXT NOT NULL,
  cooking_method TEXT NOT NULL,
  ingredients    TEXT NOT NULL,
  manual_steps   TEXT NOT NULL,
  tip            TEXT,
  calories       TEXT,

  author_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name    TEXT NOT NULL,
  author_key     TEXT NOT NULL,
  is_anonymous   INTEGER NOT NULL DEFAULT 0,

  /* 지금 누가 볼 수 있나. 기본은 가족. */
  visibility     TEXT NOT NULL DEFAULT 'family'
                 CHECK (visibility IN ('family', 'public')),

  /* 공개 검토 결과. 'none' 은 아직 눌러본 적 없음.
     'pending' 이 없는 건 의도다 — 위 주석 참고. */
  status         TEXT NOT NULL DEFAULT 'none'
                 CHECK (status IN ('none', 'approved', 'rejected')),
  status_reason  TEXT,
  moderated_at   TEXT,

  /* 재승인 판정의 핵심.
       content_hash  : 지금 내용의 해시 (제목·분류·재료·순서·팁)
       approved_hash : 승인받았을 때의 해시
     둘이 같으면 승인이 아직 유효하다. 저장 버튼을 눌렀어도 내용이 안 바뀌었으면
     해시가 같으므로 Gemini 를 다시 부르지 않는다. 요청의 "변경된 내용이 없이
     저장됐다면 재승인 불필요" 가 이 한 줄로 성립한다. */
  content_hash   TEXT NOT NULL,
  approved_hash  TEXT,

  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

INSERT INTO shared_recipes_new
  (id, family_id, title, category, cooking_method, ingredients, manual_steps, tip,
   calories, author_id, author_name, author_key, is_anonymous,
   visibility, status, status_reason, moderated_at, content_hash, approved_hash,
   created_at, updated_at)
SELECT
  id,
  (SELECT family_id FROM users WHERE users.id = shared_recipes.author_id),
  title, category, cooking_method, ingredients, manual_steps, tip,
  calories, author_id, author_name, author_key, is_anonymous,
  -- 예전에 승인됐던 건 공개 상태로 옮긴다. 나머지는 가족 범위로 내려온다.
  CASE WHEN status = 'approved' THEN 'public' ELSE 'family' END,
  CASE WHEN status IN ('approved', 'rejected') THEN status ELSE 'none' END,
  status_reason, moderated_at,
  '',    -- 해시는 아래에서 코드가 다시 채운다 (지금은 0행이라 의미 없음)
  NULL,
  created_at, created_at
FROM shared_recipes;

DROP TABLE shared_recipes;
ALTER TABLE shared_recipes_new RENAME TO shared_recipes;

-- 목록 조회는 (가족) 과 (공개+승인) 두 갈래다. 각각 인덱스를 준다.
-- D1 은 **스캔한 행 수**로 과금한다 (무료 5M행/일, 계정 전체 공유).
CREATE INDEX ix_shared_recipes_family ON shared_recipes(family_id, created_at DESC);
CREATE INDEX ix_shared_recipes_public ON shared_recipes(visibility, status, created_at DESC);
CREATE INDEX ix_shared_recipes_author ON shared_recipes(author_key, created_at DESC);

/* 개선 검토 이력.
   요리별 시간당 1회 제한을 여기서 센다 — 마지막 행의 created_at 을 본다.
   화면에는 최신 1개만 펼치고 나머지는 접어둔다 (한 번에 쭉 나열하지 않는다). */
CREATE TABLE recipe_improvements (
  id          TEXT PRIMARY KEY,
  recipe_id   TEXT NOT NULL REFERENCES shared_recipes(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  /* 조언을 받은 시점의 내용 해시. 그 뒤로 레시피가 바뀌었는지 화면에서
     "이 조언은 지금 내용 기준이 아니에요" 를 말해줄 수 있다. */
  content_hash TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX ix_recipe_improvements_recipe ON recipe_improvements(recipe_id, created_at DESC);
