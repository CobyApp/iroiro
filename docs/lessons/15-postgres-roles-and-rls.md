# 15. Postgres 롤·소유권과 RLS 적용 — 특권 vs 비특권

## 왜 알아야 하는가

오시코레는 자체 인증으로 전환하며 **RLS(Row Level Security)를 심층방어 backstop**으로 쓴다([13](./13-session-vs-jwt.md)·[14](./14-serverless-session-and-proxy.md)). 그런데 RLS는 *"켜기만 하면 무는"* 게 아니다 — **앱이 어떤 Postgres 롤로 접속하느냐**에 따라 정책이 작동하거나, 통째로 우회된다.

실제로 이 프로젝트는 **현재 모든 API가 `postgres`(소유자/특권) 롤로 접속해 RLS를 우회**하고 있다(`.env.local`·운영 connection string 모두 사용자명이 `postgres`). 즉 카탈로그에 걸린 RLS가 앱 경로엔 효력이 없다. 이 문서는 *왜 그런지*와 *어떻게 켜는지*를 정리한다.

## 핵심 개념

### 롤(role) = 유저 + 그룹 통합

Postgres는 사용자와 그룹을 **롤** 하나로 통합한다. "유저"는 그냥 **LOGIN 속성이 있는 롤**일 뿐. 롤은 ① 객체를 **소유**하고 ② **권한(privilege)**을 가진다. 앱이 DB에 접속할 때 *어떤 롤로* 붙느냐가 `DATABASE_URL`의 사용자 부분으로 정해진다.

### 소유권은 자동으로 부여된다

`CREATE TABLE`을 실행한 롤이 그 테이블의 **소유자**가 된다. Supabase 마이그레이션은 `postgres`로 실행되므로 → `account`·`team` 등의 **소유자 = `postgres`**.

### 특권 vs 비특권의 실질 = "RLS를 우회하느냐"

| 롤 유형 | RLS 적용? | 권한 범위 | 예 |
|---|---|---|---|
| **Superuser** | ❌ 항상 우회(모든 검사 무시) | 전부 | (Supabase는 직접 안 줌) |
| **테이블 소유자** | ❌ 우회 (단 `FORCE`면 적용) | 자기 소유 객체 전권 | `postgres` |
| **BYPASSRLS 롤** | ❌ 우회 | GRANT된 것 | `service_role` |
| **일반(비특권) 롤** | ✅ **적용됨** | **GRANT된 것만** | `anon`·`authenticated`·**`app`** |

- **소유자/특권 롤** = 마스터키. RLS 잠금을 그냥 통과.
- **비특권 롤** = 특정 키(GRANT)만 받고, 건물 출입규칙(RLS)을 따라야 하는 입주자.

### 접속 롤 ≠ 엔드유저 — 롤은 하나, 신원은 컨텍스트(GUC)

직결 ORM(Prisma)에서 RLS를 쓸 때의 핵심: **DB 커넥션은 비특권 롤 하나(`app`)로 통일**하고, "이 요청이 누구냐"는 **롤이 아니라 요청별 GUC**로 전달한다. DAL이 세션 검증 후 `set_config(name, value, is_local=>true)`로 주입한다.

| 엔드유저 | 접속 DB 롤 | DAL이 주입하는 GUC | RLS 결과 |
|---|---|---|---|
| 비로그인 방문자 | `app` | 없음 → `current_account_id()`=NULL · `is_admin()`=false | 카탈로그 공개 읽기만, account/* 0행(fail-closed) |
| 로그인 일반회원 | `app` | `app.current_account_id`=본인 · `app.is_admin`=false | 본인 account R/W, 카탈로그 쓰기X |
| 로그인 어드민 | `app` | `app.current_account_id`=본인 · `app.is_admin`=true | 본인 것 + 전체 read + 카탈로그 쓰기 |

> **Supabase(PostgREST)와의 차이**: PostgREST는 JWT를 보고 `SET ROLE anon`/`SET ROLE authenticated`로 **롤 자체를 전환**한다(롤 전환 방식). 우리는 **롤은 `app` 하나 + GUC**로 신원을 전달한다(컨텍스트 방식). 둘 다 per-user RLS를 작동시키지만 기전이 다르다.

> **"anon"의 두 의미 주의**: 우리 앱의 익명 방문자도 Prisma라서 **`app` 롤로 접속**한다(세션이 없을 뿐). Supabase의 `anon` *롤*은 Data API(PostgREST) 전용이고 우리 앱은 안 쓴다. 우리 모델에선 로그인 여부가 롤이 아니라 GUC 문제다.

### 참고: Data API의 `anon`/`authenticated`는 어떻게 갈리나 (우리는 미사용)

우리는 자체 인증이라 안 쓰지만, Supabase Data API(PostgREST)를 조금이라도 열면 이 두 롤이 등장하므로 기전을 정리한다. **롤은 요청마다 토큰으로 정해진다.**

1. PostgREST는 항상 **`authenticator`** 롤로 접속한다 — 권한 거의 없는 *스위치 롤*(`anon`·`authenticated`·`service_role`의 멤버라 `SET ROLE`만 가능).
2. 요청 JWT의 **`role` 클레임**을 읽어 그 요청 트랜잭션 동안 `SET ROLE`한다:

| 요청 | 결과 롤 | 트리거 |
|---|---|---|
| JWT 없음 / anon(publishable) 키 | `anon` | 미로그인. anon 키는 **공개**(브라우저에 실림) = 사실상 인터넷 공개 접근 |
| Supabase Auth 로그인 사용자 JWT | `authenticated` | `sub` → `auth.uid()`로 본인 스코프 |
| service_role(secret) 키 | `service_role` | 서버 신뢰 경계, RLS 우회 |

3. 이후 쿼리가 그 롤로 실행되며 RLS가 적용된다(`anon`/`authenticated`). 같은 JWT-롤 기전이 Storage·Realtime·Edge Functions에도 동일하게 적용된다.

**우리 앱과의 대비**: 우리는 Prisma 직결이라 이 경로를 안 탄다 — 로그인이든 익명이든 전부 `app` 롤로 접속하고 신원은 GUC로 전달한다([16](./16-transaction-guc-context.md)). 그래서 **Supabase Auth를 안 쓰는 한 `authenticated` JWT가 발급될 일이 없어 그 롤은 사실상 미사용**이고, `anon`은 카탈로그를 Data API로 공개 조회하는 만큼만 쓰인다(주문/PII는 두 롤에서 `REVOKE`되어 Data API로는 접근 불가).

## 코드/문법

### 비특권 롤 생성 + 스키마 USAGE (필수)

```sql
CREATE ROLE app NOLOGIN;                 -- 마이그레이션(버전관리): 롤·권한만 정의
GRANT USAGE ON SCHEMA public TO app;     -- 없으면 테이블 GRANT가 무효
```
```sql
-- 버전관리 밖(시크릿): 접속용 LOGIN·비밀번호는 git에 올리지 않는다
ALTER ROLE app WITH LOGIN PASSWORD '***';
```
그리고 `DATABASE_URL`의 사용자를 `postgres` → `app`으로 전환.

### 소유자까지 RLS 적용 — FORCE

```sql
ALTER TABLE account ENABLE ROW LEVEL SECURITY;   -- 비특권 롤에 적용
ALTER TABLE account FORCE  ROW LEVEL SECURITY;    -- 소유자(postgres)에게도 적용
```
`FORCE`는 소유자 우회까지 막지만 **superuser는 못 막는다**(Supabase `postgres`는 superuser 아님 + 우린 `app`으로 접속하니 무관).

### 컬럼 수준 GRANT — 권한 상승 차단

```sql
-- app은 is_admin 컬럼에 INSERT/UPDATE 권한 없음 → 스스로 admin 못 됨
GRANT INSERT (id, email, phone, display_name) ON account TO app;
GRANT UPDATE (email, phone, display_name, updated_at) ON account TO app;
```
이게 작동하는 이유도 **app이 비특권**이라서다 — 소유자라면 컬럼 GRANT도 무시한다.

## 비교 표 — 이 프로젝트의 두 롤

| | `postgres` (현재 접속 롤) | `app` (목표 접속 롤) |
|---|---|---|
| 분류 | 소유자/특권 | 비특권 |
| RLS | 우회 | **적용** |
| 권한 | 전권 | GRANT된 최소권한 |
| 용도 | 마이그레이션 실행·관리 | **앱 런타임 접속** |
| 컬럼 GRANT·RLS 효력 | 무시됨 | **작동** |

## 이 프로젝트의 결정

> 🔄 **2026-08-01 변경.** 아래 (2026-06-09) 결정 중 **RLS·GUC 부분은 채택하지 않는다.**
> `app` 롤 전환은 유지하되 목적이 바뀌었다 — RLS 활성화가 아니라 **GRANT 매트릭스 활성화**다.
> 근거: [db-authorization-review.md](../architecture/db-authorization-review.md).

**현행 (2026-08-01)**

1. **앱 런타임은 비특권 `app` 롤로 접속.** 목적은 **GRANT를 실제로 작동시키는 것** —
   소유자(`postgres`)는 GRANT 대상이 아니라 `post` DELETE 미부여 같은 설계가 현재 무효다.
2. **RLS는 쓰지 않는다.** 정책·헬퍼 함수(`current_account_id()`·`is_admin()`) 모두 제거.
   인가는 앱 DAL(`requireAdmin`·`requireAccount`) 단일화.
3. **GUC 주입도 하지 않는다** — RLS가 없으면 소비자가 없다([16](./16-transaction-guc-context.md)).
4. **LOGIN은 버전관리 밖에서 1회 부여** — `ALTER ROLE app WITH LOGIN PASSWORD '***'`.
   롤은 클러스터 객체이고 마이그레이션이 `IF NOT EXISTS`로 가드하므로 `db:reset`에도 유지된다.

<details>
<summary>이전 결정 (2026-06-09, 자체 인증 설계 — 구현 전)</summary>

1. **앱 런타임은 비특권 `app` 롤로 접속.** 이걸로 접속해야 RLS·컬럼GRANT가 비로소 작동.
2. **신원은 GUC로** — `app.current_account_id` · `app.is_admin`. 셋(비로그인/일반/어드민) 다 같은 `app` 롤, GUC만 다름.
3. **FORCE RLS는 account/*(신규·PII)에만**, 카탈로그엔 안 검 — phased activation.
4. **`is_admin`은 컬럼 GRANT에서 제외** — 앱이 스스로 admin 못 되게.
5. **현재 상태**: `DATABASE_URL`이 `postgres`라 RLS 전면 우회 중 → `app` 롤 전환이 스위치.

**무엇이 달라졌나**: 2·3·5의 전제(RLS를 실제 방어선으로 삼는다)가 재검토에서 뒤집혔다.
Data API 미사용이 확인돼 RLS의 최대 명분이 사라졌고, GUC 주입 주체가 앱 DAL 자신이라
방어 독립성도 약하다. 1(app 롤)과 4(is_admin 보호)는 GRANT 관점에서 그대로 유효하다.

</details>

## 함정·주의

- **`postgres`로 접속하면 RLS가 전부 우회된다** — 정책이 아무리 많아도 장식. RLS를 의도했다면 **반드시 비특권 롤로 접속**.
- **`GRANT USAGE ON SCHEMA public` 누락** → 테이블 GRANT가 무효(권한은 줬는데 스키마 진입을 못 함).
- **`FORCE`는 소유자까지, superuser는 못 막음** — 신뢰 경계 판단 시 누가 superuser인지 확인.
- **컬럼 GRANT는 비특권 롤에만 의미** — 소유자/특권 롤은 컬럼 권한도 무시.
- **GUC는 `set_config(..., true)`(= `SET LOCAL`)로 트랜잭션 스코프** — 세션 레벨 `SET`은 서버리스 풀러가 커넥션 재사용 시 앞 사용자 컨텍스트가 새는(context bleed) 보안 사고. [14](./14-serverless-session-and-proxy.md) 참고.
- **비밀번호는 git 밖** — 롤·권한은 마이그레이션으로, LOGIN 자격은 별도 시크릿으로.

## 참고

- [13. 세션 관리 — DB 세션 vs JWT](./13-session-vs-jwt.md)
- [14. 서버리스 세션과 Next 16 Proxy/DAL](./14-serverless-session-and-proxy.md)
- [`docs/architecture/auth-and-data.md`](../architecture/auth-and-data.md) — 인증·데이터 룰
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) (소유자 우회·`FORCE`·`BYPASSRLS` 규칙)
- [PostgreSQL — Database Roles](https://www.postgresql.org/docs/current/user-manag.html)
- [Supabase — Roles (`anon`·`authenticated`·`service_role`)](https://supabase.com/docs/guides/database/postgres/roles)
- 실제 마이그레이션: [`init_catalog.sql`](../../supabase/migrations/20260508132935_init_catalog.sql) (app 롤 생성·GRANT) · [`init_account.sql`](../../supabase/migrations/20260608142249_init_account.sql) (RLS·컬럼GRANT)
