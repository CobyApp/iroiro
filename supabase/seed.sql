-- ============================================================================
-- seed.sql — 로컬 개발 전용. `supabase db reset` 시 마이그레이션 뒤에 자동 실행된다.
--   (config.toml의 [db.seed] enabled=true, sql_paths=["./seed.sql"])
--
--   ⚠️ 이 파일은 로컬에만 적용된다. `supabase db push`는 migrations/ 만 원격에 보낸다.
--      따라서 아래 비밀번호는 로컬 고정값이어도 무방하며, 베타·운영에는 반영되지 않는다.
--      베타·운영은 같은 구문을 각 환경에서 별도 비밀번호로 1회 수동 실행한다
--      (migrations/20260508132935_init_catalog.sql의 "app 롤 LOGIN 부여" 주석 참조).
-- ============================================================================

-- app 롤에 접속 자격 부여 — 마이그레이션은 NOLOGIN(권한 그릇)으로만 만든다.
-- 이 롤로 접속해야 GRANT 매트릭스가 실제로 작동한다(소유자 postgres는 GRANT 대상이 아님).
-- 로컬 비밀번호는 minioadmin/minioadmin과 같은 계열의 공개 개발 디폴트다.
ALTER ROLE app WITH LOGIN PASSWORD 'app';

-- 로컬 DATABASE_URL:
--   postgresql://app:app@127.0.0.1:54322/postgres
