-- 0009 — 식단에 레시피 붙이기
--
-- 식단을 적을 때 레시피를 검색해서 고를 수 있게 한다. 고르면 "지금 냉장고에
-- 없는 재료" 를 알려준다.
--
-- ── 왜 재료를 여기에 또 저장하는가 (스냅샷) ──────────────────────────
--
-- recipe_ingredients 는 레시피 원본의 **사본**이다. 중복처럼 보이지만 의도된 것이다.
--
-- 대안 1 — 부족 재료를 고른 순간에 계산해서 memo 에 문장으로 넣는다.
--   식단은 미래의 일이다. 금요일에 화요일 김치찌개를 등록하면서 "두부 없음" 을
--   적어두면, 토요일에 두부를 사는 순간 그 문장은 거짓말이 된다. 부족 목록은
--   곧 장볼 목록인데, 틀린 장볼 목록은 안 보느니만 못하다.
--   → 그래서 **재료만 남기고 부족 여부는 화면을 열 때마다 다시 계산한다.**
--
-- 대안 2 — recipe_id 만 두고 재료는 그때그때 원본에서 읽는다.
--   식품안전나라 레시피는 우리 DB 에 행이 없다 (공공 API + Cache API).
--   그러면 공공 API 가 죽는 날 식단 화면도 같이 죽는다.
--   공유 레시피는 작성자가 고치거나 지울 수 있다. 내가 계획한 재료가 남의
--   수정으로 바뀌면 안 된다 — 계획은 그때 내가 본 것이어야 한다.
--   → 그래서 **재료는 박아두고, recipe_id 는 조리법을 다시 볼 열쇠로만 쓴다.**
--
-- 셋은 항상 함께 움직인다. recipe_id 는 있는데 recipe_ingredients 가 NULL 인
-- 상태(조리법은 보이는데 부족 재료는 못 세는 반쪽)는 만들 수 없어야 한다.
-- 워커의 parseRecipeAttachment() 가 "셋 다 있거나 셋 다 없거나" 를 강제한다.
--
-- ── 컬럼은 반드시 뒤에 붙인다 ────────────────────────────────────────
--
-- 0006 이 meal_plans 를 `INSERT INTO meal_plans_new SELECT * FROM meal_plans`
-- 로 재작성했다. **컬럼 순서에 의존하는 문장이다.** 뒤에 붙이는 건 안전하지만,
-- 다음에 이 테이블을 또 재작성할 일이 생기면 `SELECT *` 를 쓰지 말고 컬럼을
-- 명시할 것. 안 그러면 조용히 어긋난다.
--
-- ADD COLUMN 은 SQLite 에서 메타데이터만 바꾼다 — 재작성도 락도 없다.
-- CHECK 제약을 안 붙이므로 테이블을 다시 만들 이유가 없다 (0003·0006 과 다르다).
-- 셋 다 nullable 이라 기존 행과 옛 워커 코드에 하위 호환이다.

-- 'foodsafety' (식품안전나라 공공 API) | 'custom' (shared_recipes)
ALTER TABLE meal_plans ADD COLUMN recipe_source TEXT;

-- foodsafety 면 RCP_SEQ, custom 이면 shared_recipes.id.
-- **FK 를 걸지 않는다** — 한쪽은 우리 테이블이 아니고, 공유 레시피가 지워져도
-- 식단은 살아 있어야 한다 (스냅샷이 있으므로 재료는 그대로 보인다).
ALTER TABLE meal_plans ADD COLUMN recipe_id TEXT;

-- 재료 이름 JSON 배열. 0001 의 custom_recipes 와 같은 표현을 쓴다.
ALTER TABLE meal_plans ADD COLUMN recipe_ingredients TEXT;
