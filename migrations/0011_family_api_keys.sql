-- 가족 API 키 (BYOK) — 각자 키로 백엔드에서 호출
--
-- **키는 절대 평문으로 저장하지 않는다.** `wrangler d1 export` 백업이 전체 테이블
-- 평문 덤프라(backups/*.sql 실물 확인), 평문으로 넣으면 백업 파일마다 키가
-- 복사된다. AES-GCM 으로 암호화해서 넣고, 복호화 키는 SECRET_KEY 에서
-- HKDF 로 파생한다 (세션 서명과 다른 키 — 한 키를 두 용도로 쓰지 않는다).
--
-- **이게 푸는 문제와 안 푸는 문제를 헷갈리지 말 것.**
-- 푸는 것: 비용·할당량을 가족끼리 나눈다. 앱이 요금을 안 낸다.
-- 안 푸는 것: Gemini 지역차단. 그건 워커가 어디서 실행되느냐의 문제라
-- 개인 키로 바꿔도 그대로다. 2026-08-27 HKG 에서 세 제공자 모두 막혔다.

CREATE TABLE family_api_keys (
  id             TEXT PRIMARY KEY,
  family_id      TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL CHECK (provider IN ('gemini','anthropic','openai')),
  -- '우리집 Gemini' 처럼 누구 것인지 알아볼 라벨.
  label          TEXT NOT NULL,
  -- base64(iv ‖ ciphertext). 평문 금지.
  key_cipher     TEXT NOT NULL,
  -- '••••4f2a'. 복호화 없이 화면에 보여주기 위해 저장 시점에 만들어 둔다.
  key_hint       TEXT NOT NULL,
  added_by       TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  -- 「순서 지정」 모드의 순위. NULL 은 맨 뒤.
  priority       INTEGER,
  -- 제공자 호출 수 (스캔 수가 아니다 — 5장 스캔은 5회).
  -- 누적으로 둔다. 초기화하면 나중에 추가된 키가 따라잡을 기회가 사라진다.
  calls          INTEGER NOT NULL DEFAULT 0,
  last_used_at   TEXT,
  -- 429 를 맞으면 이 시각까지 쉰다.
  cooldown_until TEXT,
  -- 401/403 이면 끈다. 다시 시도해봐야 소용없다.
  disabled       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT
);

CREATE INDEX idx_family_keys_pick ON family_api_keys(family_id, disabled, calls);

-- 'least_used'(기본, 교대로) | 'priority'(순서 지정)
ALTER TABLE families ADD COLUMN key_strategy TEXT NOT NULL DEFAULT 'least_used';
