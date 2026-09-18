-- ============================================================================
-- db-reset.sql — 원격(베타) DB 완전 비우기
--   public 스키마의 테이블·뷰·머티뷰·시퀀스·함수/프로시저·타입을 전부 제거하고
--   마이그레이션 이력(supabase_migrations.schema_migrations)을 초기화한다.
--   확장(extension) 소속 객체와 롤(app/anon/authenticated)은 보존(의도).
--
-- 카탈로그 기반(객체명 비-하드코딩)이라 DDL이 늘어도 이 파일은 그대로 쓴다.
-- 이 파일은 "비우기"만 한다. 재생성은 supabase/migrations/* 정본을 순서대로
-- 적용한다(docs/supabase-adoption.md "마이그레이션 운영 전략").
--   → 완전 재세팅 = 이 파일 실행 후 마이그레이션 전체 적용.
--
-- 사용: 파일 전체를 베타 Dashboard SQL Editor에 붙여넣고 1회 Run.
-- 이 파일은 마이그레이션이 아니며 supabase CLI가 자동 실행하지 않는다
--   (supabase/ 밖에 있음 · migrations/ 아님 · seed 대상 아님).
-- ⚠️ public 데이터·객체를 전부 삭제한다. 실행 전 반드시 대상이 beta 인지 확인.
-- 한 트랜잭션이라 중간 실패 시 전체 롤백(대상은 기존 상태 유지).
-- ============================================================================
begin;

-- 1) public 객체 전부 제거 (확장 소속 함수/타입은 보존)
do
$$
    declare
        r record;
    begin
        for r in select matviewname n from pg_matviews where schemaname = 'public'
            loop execute format('drop materialized view if exists public.%I cascade', r.n); end loop;
        for r in select viewname n from pg_views where schemaname = 'public'
            loop execute format('drop view if exists public.%I cascade', r.n); end loop;
        for r in select tablename n from pg_tables where schemaname = 'public'
            loop execute format('drop table if exists public.%I cascade', r.n); end loop;
        for r in select sequencename n from pg_sequences where schemaname = 'public'
            loop execute format('drop sequence if exists public.%I cascade', r.n); end loop;
        for r in select p.oid::regprocedure sig
                 from pg_proc p
                          join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'
                   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
            loop execute format('drop routine if exists %s cascade', r.sig); end loop;
        for r in select t.oid::regtype ty
                 from pg_type t
                          join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public'
                   and t.typtype in ('e', 'd')
                   and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
            loop execute format('drop type if exists %s cascade', r.ty); end loop;
    end
$$;

-- 2) 마이그레이션 이력 초기화 (이력 테이블이 있을 때만 — 없으면 무시)
do
$$
    begin
        if to_regclass('supabase_migrations.schema_migrations') is not null then
            delete from supabase_migrations.schema_migrations;
        end if;
    end
$$;

commit;
