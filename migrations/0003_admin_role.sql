-- 관리자 역할.
--
-- "제일 처음 가입한 사용자가 관리자 1호" 규칙을 스키마에 고정한다.
-- 신규 가입 시점의 승격은 애플리케이션(routes/auth.ts, lib/identity.ts)이
-- users 테이블이 비어 있는지 보고 결정한다. 여기서는 기존 행을 백필한다.
--
-- role 은 'admin' | 'member'. CHECK 제약을 걸고 싶지만 SQLite 의
-- ALTER TABLE ADD COLUMN 은 CHECK 를 붙일 수 없다(테이블 재생성이 필요).
-- 값은 애플리케이션에서만 쓰므로 쓰기 경로를 좁히는 쪽을 택한다.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

-- 이미 가입한 사용자가 있으면 가장 오래된 계정을 관리자로 올린다.
-- created_at 이 같은 경우를 대비해 id 로 타이를 깬다 — 그래야 이 마이그레이션이
-- 몇 번을 돌아도 같은 사람을 고른다.
UPDATE users SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);
