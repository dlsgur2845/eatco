-- 가족 데이터 초기화 — 전원 동의 + 7일 복구
--
-- 왜 「지운 표시(deleted_at)」가 아니라 **보관 테이블**인가:
--
-- soft delete 를 쓰면 재료·식단·레시피·추천매칭의 **모든 조회**에
-- `WHERE deleted_at IS NULL` 이 붙어야 한다. 한 군데만 빼먹으면 지웠다고 믿은
-- 데이터가 다시 나타난다 — 그것도 조용히, 한참 뒤에.
-- 행을 통째로 보관 테이블로 옮기면 원래 테이블에서는 진짜로 사라지므로
-- **조회 코드를 한 줄도 안 건드린다.** 복구는 되돌려 넣기다.
--
-- 대가: 복구가 JSON → 컬럼 복원이라, 7일 안에 스키마가 바뀌면 어긋난다.
-- 마이그레이션은 드물고 창은 7일뿐이라 감수한다.

CREATE TABLE family_reset_requests (
  id            TEXT PRIMARY KEY,
  family_id     TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  requested_by  TEXT NOT NULL,
  -- 요청 시점의 구성원 집합(JSON 배열). 동의는 「그때 그 가족」에 대한 동의다.
  -- 실행 직전에 지금 집합과 다르면 stale 로 넘기고 처음부터 다시 받는다.
  member_ids    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','done','cancelled','expired','stale','restored')),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  executed_at   TEXT,
  -- 보관분을 진짜로 지우는 시각 (executed_at + 7일). 복구 창.
  purge_after   TEXT
);

CREATE INDEX idx_reset_family_status ON family_reset_requests(family_id, status);
CREATE INDEX idx_reset_purge ON family_reset_requests(purge_after);

CREATE TABLE family_reset_consents (
  request_id TEXT NOT NULL REFERENCES family_reset_requests(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  agreed_at  TEXT NOT NULL,
  PRIMARY KEY (request_id, user_id)
);

-- 지운 행을 통째로 담아둔다. 7일 뒤 cron 이 비운다.
CREATE TABLE family_reset_archive (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES family_reset_requests(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  row_json   TEXT NOT NULL
);

CREATE INDEX idx_reset_archive_req ON family_reset_archive(request_id, table_name);
