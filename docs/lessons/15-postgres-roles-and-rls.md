# 15. Postgres 롤·소유권과 GRANT 매트릭스 — 특권 vs 비특권

## 왜 알아야 하는가

이 프로젝트의 **DB 방어선은 GRANT 매트릭스**다 — 앱은 비특권 롤 `app`으로 접속하고, `db/schema.sql`이 테이블마다 "이 롤은 SELECT·INSERT만, DELETE는 못 한다"를 명시한다. 그런데 GRANT는 *"쓰기만 하면 무는"* 게 아니다 — **앱이 어떤 Postgres 롤로 접속하느냐**에 따라 권한 검사가 작동하거나, 통째로 우회된다. 소유자로 붙으면 GRANT는 장식이다.

> **이력.** 2026-06-09 자체 인증 설계 때는 RLS(Row Level Security)를 심층방어 backstop으로 삼고 `app` 롤 전환을 "RLS를 켜는 스위치"로 봤다. 2026-08-01 재검토([db-authorization-review.md](../architecture/db-authorization-review.md))에서 RLS를 전부 제거했고, `app` 롤 전환의 목적은 **GRANT 매트릭스 활성화**로 바뀌었다. 전환은 완료됐다 — 로컬·dev·prd 모두 `app`으로 접속한다.

## 핵심 개념

### 롤(role) = 유저 + 그룹 통합

Postgres는 사용자와 그룹을 **롤** 하나로 통합한다. "유저"는 그냥 **LOGIN 속성이 있는 롤**일 뿐. 롤은 ① 객체를 **소유**하고 ② **권한(privilege)**을 가진다. 앱이 DB에 접속할 때 *어떤 롤로* 붙느냐가 `DATABASE_URL`의 사용자 부분으로 정해진다.

### 소유권은 자동으로 부여된다

`CREATE TABLE`을 실행한 롤이 그 테이블의 **소유자**가 된다. `db/schema.sql`은 소유자 롤로 실행하므로:

| 환경 | 소유자(스키마 적용 롤) | 앱 접속 롤 |
|---|---|---|
| 로컬 (`compose.yml` postgres) | `postgres` | `app` |
| RDS `iroiro-dev` / `iroiro-prd` | `iroiro_admin` (마스터 유저, SSM `DATABASE_URL_OWNER`) | `app` (SSM `DATABASE_URL`) |

### 특권 vs 비특권의 실질 = "GRANT 검사를 받느냐"

| 롤 유형 | GRANT 검사? | 권한 범위 | 예 |
|---|---|---|---|
| **Superuser** | ❌ 항상 우회(모든 검사 무시) | 전부 | 로컬 `postgres` |
| **테이블 소유자** | ❌ 자기 객체엔 전권 | 소유 객체 전권 + `GRANT` 발행 | `iroiro_admin`, 로컬 `postgres` |
| **일반(비특권) 롤** | ✅ **적용됨** | **GRANT된 것만** | **`app`** |

- **소유자/특권 롤** = 마스터키. `REVOKE`·컬럼 GRANT가 아무리 정교해도 그냥 통과.
- **비특권 롤** = 특정 키(GRANT)만 받은 입주자. `post` DELETE를 안 줬으면 진짜로 못 지운다(soft delete 강제).

> RDS의 마스터 유저(`iroiro_admin`)는 superuser가 아니라 `rds_superuser` 멤버다 — 그래도 소유자라 자기 테이블엔 전권이다. 소유자 우회를 막는 장치는 없으므로(RLS의 `FORCE`가 그 역할이었지만 미사용) **앱이 소유자로 붙지 않는 것**이 유일한 규율이다.

### 접속 롤 ≠ 엔드유저 — 롤은 하나, 신원은 앱 DAL

로그인 여부·어드민 여부에 따라 DB 롤을 바꾸지 않는다. 비로그인 방문자·일반회원·어드민 **모두 `app` 롤 하나**로 접속하고, "이 요청이 누구냐"는 앱 DAL(`modules/auth/dal.ts`의 `getCurrentAccount`, `requireAdmin`·`requireAccount`)이 판정한다. DB는 **롤 단위(테이블·컬럼) 권한**만 강제하고, **행 단위(본인 행 한정)는 앱 쿼리의 `WHERE account_id = …`**가 담당한다.

| 엔드유저 | 접속 DB 롤 | 행 스코프 판정 | DB가 막는 것 |
|---|---|---|---|
| 비로그인 방문자 | `app` | 앱: 세션 없음 → 공개 조회만 | 테이블·컬럼 GRANT 범위 밖 |
| 로그인 일반회원 | `app` | 앱: `WHERE account_id = 세션.account_id` | 동일 |
| 로그인 어드민 | `app` | 앱: `requireAdmin` | 동일 |

> **비교 — Supabase/PostgREST 방식.** PostgREST는 JWT를 보고 `SET ROLE anon`/`authenticated`로 **롤을 전환**하고 RLS로 행을 거른다. 우리는 Data API가 없고 서버 코드만 DB에 닿으므로 롤 전환·RLS 없이 **롤 1개 + 앱 DAL**로 간다. 그 롤 두 개(`anon`/`authenticated`)와 관련 GRANT는 `db/schema.sql` 통합 때 제거됐다.

## 코드/문법

### 비특권 롤 생성 — 재실행 안전

```sql
-- db/schema.sql: 롤이 없으면 NOLOGIN 스텁으로 생성(IF NOT EXISTS 가드)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
        EXECUTE 'CREATE ROLE app NOLOGIN';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app;     -- 없으면 테이블 GRANT가 전부 무효(스키마 진입 관문)
```

롤은 **데이터베이스가 아니라 클러스터 단위 객체**다. `scripts/db-reset.sql`이 public 스키마를 통째로 비워도 롤은 남고, 위 `IF NOT EXISTS`가 재생성을 건너뛰므로 LOGIN·비밀번호가 유지된다.

### LOGIN 부여 — 버전관리 밖, 스크립트가 대신 한다

`CREATE ROLE app NOLOGIN`은 권한 그릇일 뿐 접속할 수 없다. 비밀번호가 들어가므로 `db/schema.sql`에 넣지 않고, 환경별 스크립트가 스키마 적용 직후 실행한다:

| 환경 | 명령 | 하는 일 |
|---|---|---|
| 로컬 | `npm run db:reset` → [`scripts/db-reset.sh`](../../scripts/db-reset.sh) | `db-reset.sql`(비우기) → `db/schema.sql` → `ALTER ROLE app WITH LOGIN PASSWORD 'app'` |
| RDS | [`infra/aws/db-apply.sh <env>`](../../infra/aws/db-apply.sh) | SSM에서 `DATABASE_URL_OWNER`·`DATABASE_URL` 조회 → 소유자로 `db/schema.sql`(스키마가 이미 있으면 건너뜀) → `DATABASE_URL`의 비밀번호를 뽑아 `ALTER ROLE app WITH LOGIN PASSWORD '…'` → `app`으로 접속 테스트 |

`DATABASE_URL`은 항상 `postgresql://app:…@…/iroiro`다 — 로컬 `.env.local`도, SSM `/iroiro/<env>/DATABASE_URL`도. 소유자 URL(`DATABASE_URL_OWNER`)은 스키마 적용·운영자 수기 작업 전용이며 앱에 주입하지 않는다.

### GRANT 매트릭스 — REVOKE 베이스라인 + 명시 GRANT

```sql
-- 환경별 기본 권한을 비운 뒤(베이스라인) 의도한 권한만 준다 → 결과가 결정적
REVOKE ALL ON post, post_comment, post_report, post_comment_report, post_photo, pending_post_photo FROM app;
GRANT SELECT, INSERT, UPDATE ON post TO app;              -- DELETE 없음 = soft delete 강제
GRANT SELECT, INSERT ON post_report TO app;
GRANT UPDATE (resolution, resolved_by, resolution_note, resolved_at, updated_at) ON post_report TO app;  -- 컬럼 제한 UPDATE
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_post_photo TO app;  -- 만료 정리 잡이 hard delete
```

설계 규칙(`db/schema.sql` 롤 섹션 주석):
- **`ALL` 대신 명시 권한.** `TRUNCATE`는 어디에도 주지 않는다(테이블을 즉시 비우므로 심층방어로 제외).
- **이력 테이블은 DELETE 미부여** — `order`·`order_item`·`payment`·`auction_bid`·`point_transaction` 등은 정정하지 않고 쌓는다.
- **컬럼 수준 GRANT**로 권한 상승 차단 — 신고 처리 컬럼만 UPDATE 허용처럼 "이 롤이 바꿔도 되는 컬럼"을 좁힌다. 소유자라면 컬럼 GRANT도 무시하므로, 이것이 작동하는 이유도 **`app`이 비특권**이라서다.
- **IDENTITY 컬럼은 시퀀스 GRANT 불필요** — `GENERATED AS IDENTITY`의 시퀀스는 컬럼에 종속돼 테이블 INSERT 권한만으로 동작한다(구식 `serial`이면 `GRANT USAGE ON SEQUENCE`가 따로 필요).
- **`CREATE`는 주지 않음** — `app`은 기존 객체만 사용. 새 객체는 소유자(스키마 적용)의 몫.

## 왜 RLS를 버렸나 (2026-08-01)

RLS의 최대 명분은 *DB에 직접 닿는 신뢰할 수 없는 경로*(Supabase Data API의 `anon` 키 등)를 행 단위로 막는 것인데, 자체 인증으로 전환하면서 그 경로가 사라졌다 — DB에 닿는 건 서버 코드(Prisma, `app` 롤)뿐이다. 남은 시나리오는 "앱 DAL이 `WHERE account_id`를 빠뜨리는 버그"인데, 이걸 RLS로 막으려면 신원을 트랜잭션 GUC로 DB에 주입해야 하고([16](./16-transaction-guc-context.md)) 그 주입 주체가 바로 그 앱 DAL이라 **방어의 독립성이 약하다**. 반면 비용은 확실했다 — 정책 11개와 헬퍼 함수 유지, 트랜잭션 강제, 정책 누락 시 0행 반환이라는 디버깅 난이도. 실측에서 소유자 접속으로 RLS가 *이미 아무것도 강제하지 않고 있었다*는 사실도 드러났다. 그래서 정책·`ENABLE/FORCE ROW LEVEL SECURITY`·헬퍼 함수(`current_account_id()`·`is_admin()`)를 모두 제거하고, **롤 단위는 GRANT, 행 단위는 앱 DAL**로 책임을 나눴다. `db/schema.sql`에는 RLS 관련 문장이 없다.

## 비교 표 — 이 프로젝트의 두 롤

| | 소유자 (`iroiro_admin` / 로컬 `postgres`) | `app` |
|---|---|---|
| 분류 | 소유자/특권 | 비특권 |
| GRANT 검사 | 우회(자기 객체 전권) | **적용** |
| 권한 | 전권 | GRANT된 최소권한 |
| 용도 | `db/schema.sql` 적용·변경분 SQL·운영자 수기 보정 | **앱 런타임 접속** |
| 접속 문자열 | SSM `DATABASE_URL_OWNER` (앱에 주입 X) | SSM `DATABASE_URL` / 로컬 `.env.local` |

## 이 프로젝트의 결정

1. **앱 런타임은 비특권 `app` 롤로 접속한다.** 목적은 GRANT 매트릭스를 실제로 작동시키는 것. 로컬·dev·prd 모두 적용 완료.
2. **RLS는 쓰지 않는다.** 행 스코프 인가는 앱 DAL(`requireAdmin`·`requireAccount` + `WHERE account_id`) 단일화.
3. **GUC 주입도 하지 않는다** — RLS가 없으면 소비자가 없다([16](./16-transaction-guc-context.md)은 개념 보존).
4. **롤·GRANT는 `db/schema.sql`에, LOGIN 자격은 스크립트·SSM에.** 새 테이블을 추가하면 **같은 변경분에 `GRANT … TO app`을 반드시 포함**한다.

## 함정·주의

- **소유자로 접속하면 GRANT가 전부 우회된다** — 정책이 아무리 많아도 장식. `DATABASE_URL`의 유저가 `app`인지 항상 확인.
- **새 테이블에 GRANT 누락 → 운영에서 `42501 permission denied`** — 로컬에서 소유자로 테스트하면 안 보이고 배포 후 터진다. 실제로 경매·알림·시리즈·중고거래 테이블이 이 사고를 겪어 보정 SQL이 `db/schema.sql`에 남아 있다(PR #31 사례). 로컬도 `app`으로 붙는 이유가 이것이다.
- **`GRANT USAGE ON SCHEMA public` 누락** → 테이블 GRANT가 무효(권한은 줬는데 스키마 진입을 못 함). PG15+에서는 `public`의 기본 권한이 좁아져 명시 부여가 필수.
- **컬럼 GRANT는 비특권 롤에만 의미** — 소유자/특권 롤은 컬럼 권한도 무시.
- **롤은 클러스터 객체** — `db-reset.sql`로 스키마를 비워도 남는다. 로컬에서 롤을 완전히 지우려면 `npm run services:down`(볼륨 삭제)이 필요.
- **비밀번호는 git 밖** — 롤·권한은 `db/schema.sql`로, LOGIN 자격은 로컬 스크립트(고정 `app`)·SSM(`/iroiro/<env>/DATABASE_URL`)으로. 특수문자 함정은 [10](./10-database-url-password.md).

## 참고

- [13. 세션 관리 — DB 세션 vs JWT](./13-session-vs-jwt.md)
- [16. 트랜잭션 GUC로 요청 컨텍스트 주입](./16-transaction-guc-context.md) — 미채택 설계의 개념 보존
- [`docs/architecture/db-authorization-review.md`](../architecture/db-authorization-review.md) — RLS 제거 결정의 실측·근거 원본
- [`docs/architecture/auth-and-data.md`](../architecture/auth-and-data.md) — 인증·데이터 룰
- [`docs/deployment.md`](../deployment.md) — RDS·SSM·`db-apply.sh` 운영 절차
- [PostgreSQL — Database Roles](https://www.postgresql.org/docs/current/user-manag.html)
- [PostgreSQL — Privileges (`GRANT`/`REVOKE`, 컬럼 권한)](https://www.postgresql.org/docs/current/ddl-priv.html)
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) (미사용 — 소유자 우회·`FORCE` 규칙 참고용)
- 실제 정본: [`db/schema.sql`](../../db/schema.sql) 롤·GRANT 섹션 · [`scripts/db-reset.sh`](../../scripts/db-reset.sh) · [`infra/aws/db-apply.sh`](../../infra/aws/db-apply.sh)
