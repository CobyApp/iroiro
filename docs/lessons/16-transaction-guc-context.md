# 16. 트랜잭션 GUC로 요청 컨텍스트 주입 (RLS용 — 미채택)

> 🗄️ **미채택 설계 (2026-08-01).** 이 프로젝트는 RLS를 쓰지 않기로 해서 GUC 주입도 도입하지 않는다
> ([db-authorization-review.md](../architecture/db-authorization-review.md)).
> 문서는 **개념 설명으로 보존**한다 — RLS를 되살리면 이 설계가 그대로 필요하고,
> 트랜잭션 스코프·커넥션 풀 수명 같은 내용은 RLS와 무관하게 유효하다.
> 현재 코드에는 `set_config` 호출이 없다(`grep -rn set_config modules lib` → 0건). `db.$transaction`은
> 여러 곳에서 쓰지만 원자성 목적이며 GUC 주입은 하지 않는다.

## 왜 알아야 하는가

RLS 정책([15](./15-postgres-roles-and-rls.md)의 이력)은 *"지금 이 요청이 누구냐"* — 본인 `account_id`, 어드민 여부 — 를 알아야 행을 거른다. 그런데 자체 인증이라 DB 안에는 요청 신원이 없다 — 세션은 앱이 `account_session`을 조회해 아는 것이고, 접속 롤은 누구든 `app` 하나다(Supabase처럼 JWT를 읽는 `auth.uid()` 같은 함수도 없다). 그러면 **그 신원을 요청마다 DB 안으로 어떻게 전달**하나?

답은 **트랜잭션 스코프 GUC**다. DAL이 매 요청 트랜잭션에 "현재 사용자" 값을 박고, RLS 함수가 그걸 읽어 강제한다. 이 문서는 트랜잭션·GUC 개념부터 주입 코드, 그리고 풀링 환경에서 *왜 트랜잭션 스코프여야 하는지*까지 정리한다.

## 핵심 개념

### 트랜잭션(transaction)

DB의 **원자적 작업 단위** — 여러 SQL을 묶어 전부 성공(COMMIT) 아니면 전부 취소(ROLLBACK).

```sql
BEGIN;
  ...
COMMIT;            -- 또는 ROLLBACK
```

- 트랜잭션은 시작~끝 동안 **한 커넥션을 점유**한다.
- **autocommit**: `BEGIN` 없이는 *문 하나하나가 각자 별도 트랜잭션*. 그래서 여러 문을 같은 트랜잭션으로 묶으려면 명시적 트랜잭션(Prisma `$transaction`)이 필요하다.

### 커넥션/세션 vs 트랜잭션 — 수명 차이

| 개념 | 수명 | 상태 유지 |
|---|---|---|
| 커넥션/세션 | 접속~끊김 | `SET`(세션 GUC)은 여러 트랜잭션을 넘어 유지 |
| 트랜잭션 | BEGIN~COMMIT | `SET LOCAL`(트랜잭션 GUC)은 끝나면 리셋 |

### GUC(Grand Unified Configuration)

Postgres의 **런타임 설정 변수**. 빌트인 예: `timezone`, `work_mem`, `search_path`.

- 읽기: `current_setting('이름')` (또는 `current_setting('이름', true)` → 미설정 시 NULL)
- 쓰기: `SET 이름 = 값` 또는 `set_config('이름', '값', is_local)`

**커스텀 GUC**: 이름에 **점(`.`)**이 들어가면(`app.is_admin`, `app.current_account_id`) Postgres가 모르는 변수여도 자유롭게 set/read할 수 있다. 이게 **요청별 컨텍스트를 DB로 나르는 표준 수단**이다. 테이블에 저장되는 게 아니라 세션/트랜잭션 메모리에 잠깐 붙는 **휘발성 런타임 값**.

### 두 스코프 — 핵심

```sql
SET app.is_admin = 'true';                  -- ① 세션 스코프
set_config('app.is_admin', 'true', false);  --    (동일)

SET LOCAL app.is_admin = 'true';            -- ② 트랜잭션 스코프
set_config('app.is_admin', 'true', true);   --    (동일, is_local=true)
```

| | 수명 | 끝나면 |
|---|---|---|
| **① 세션(`SET`)** | 커넥션 내내, 여러 트랜잭션을 넘어 | 끊기거나 다시 바꿀 때까지 남음 |
| **② 트랜잭션(`SET LOCAL`)** | 현재 트랜잭션 안에서만 | COMMIT/ROLLBACK 시 자동 소멸 |

"트랜잭션에 GUC 주입" = ②. 값이 **딱 한 트랜잭션(= 한 요청)만큼만** 살고 자동으로 사라진다.

## 왜 반드시 트랜잭션 스코프여야 하나 — 커넥션 풀

커넥션 풀에선 **물리 커넥션 하나를 여러 요청·여러 사용자가 돌려 쓴다.** 우리 앱도 그렇다 — ECS 컨테이너 안의 Prisma(`@prisma/adapter-pg`)가 프로세스 수명 동안 `pg` 풀을 유지하고, 요청마다 풀에서 커넥션을 빌려 쓰고 반납한다([`lib/db.ts`](../../lib/db.ts)). 서버리스가 아니어도 문제는 같다.

- **세션 스코프(`SET`)로 박으면** → 내 요청이 끝나도 값이 커넥션에 **남는다**. 다음 요청이 같은 커넥션을 받으면 내 `app.is_admin='true'`를 물려받아 → 남이 나로 행세하거나 비-어드민이 어드민이 됨 = **컨텍스트 누수(context bleed) = 심각한 보안 사고**.
- **트랜잭션 스코프(`SET LOCAL`)로 박으면** → 트랜잭션 끝나는 순간 자동 소거 → 다음 요청에 절대 안 샌다. 안전.

> 트랜잭션 스코프라 **transaction-mode 외부 풀러(PgBouncer·RDS Proxy 등)와도 호환**된다 — `SET LOCAL`은 트랜잭션 경계 안에 갇히므로. 세션 스코프 `SET`은 그런 풀러에서 아예 보장이 안 된다.

**비유**: 세션 GUC = 커넥션 화이트보드에 적기(지울 때까지 남아 다음 사람이 봄). 트랜잭션 GUC = 끝나면 자동 폐기되는 포스트잇.

## 코드/문법

### `SET LOCAL`이 아니라 `set_config()`를 쓰는 이유

```sql
SET LOCAL app.is_admin = $1                    -- ❌ SET은 파라미터 바인딩 불가(리터럴만)
SELECT set_config('app.is_admin', $1, true)    -- ✅ 일반 함수라 파라미터 안전
```

`SET`은 값에 바인드 파라미터를 못 써 문자열 조립이 필요 → 인젝션 위험. **`set_config()`는 함수라 값을 파라미터로 안전하게** 넘긴다. 그래서 ORM 주입엔 `set_config()`를 쓴다. 값은 항상 **text**(boolean은 `'true'`/`'false'` 문자열).

### Prisma — 트랜잭션 안에서 주입 + 같은 tx로 쿼리

```ts
// modules/auth/withAuthContext.ts
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type SessionCtx = { accountId: string; isAdmin: boolean };

export function withAuthContext<T>(
  s: SessionCtx,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_account_id', ${s.accountId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_admin', ${s.isAdmin ? "true" : "false"}, true)`;
    return work(tx);                              // 반드시 같은 tx로 쿼리해야 GUC가 적용됨
  });
}
```

`${...}`는 Prisma 바인드 파라미터라 인젝션 안전(`set_config('app.is_admin', $1, true)`로 나감).

### RLS가 읽는 지점

```sql
-- is_admin()        : SELECT current_setting('app.is_admin', true) = 'true'
-- current_account_id(): NULLIF(current_setting('app.current_account_id', true), '')::uuid
-- 정책 USING        : id = current_account_id() OR is_admin()
```

## 이 프로젝트의 결정

> ❌ **미채택.** 아래는 2026-06-09 설계안이며 구현되지 않았다. RLS를 쓰지 않기로 하면서
> GUC 주입의 소비자가 사라졌다 — [15](./15-postgres-roles-and-rls.md)·
> [db-authorization-review.md](../architecture/db-authorization-review.md).

<details>
<summary>설계안 (2026-06-09) — RLS 재도입 시 참조</summary>

1. **요청 신원 GUC 2종** — `app.current_account_id`(본인), `app.is_admin`(어드민).
2. **DAL이 트랜잭션에 `set_config(..., true)`로 주입**, 같은 트랜잭션 클라이언트로 RLS 쿼리 실행.
3. **값의 출처** — `account.is_admin`(DB 진실원) → `verifySession()` → GUC. (`account_session`은 RLS 없는 부트스트랩이라 토큰으로 조회 가능)
4. **부트스트랩 순서** — `account`는 FORCE RLS라, 먼저 `current_account_id`를 박아야 자기 행(과 `is_admin`)을 읽을 수 있다: 세션→account_id→GUC→account.is_admin→is_admin GUC.
5. **클라이언트 불가** — GUC는 서버 트랜잭션 안에서만 주입 → 사용자가 못 건드림 → RLS 신뢰 가능.


</details>

## 함정·주의

- **세션 스코프(`SET`/`is_local=false`) 금지** — 풀링 시 context bleed. 반드시 `SET LOCAL`/`set_config(..., true)`. 같은 이유로 `SET TIME ZONE`·`search_path`처럼 요청별로 바꾸고 싶은 값도 트랜잭션 스코프로.
- **GUC는 `tx`에 박고 쿼리도 `tx`로** — 전역 `db`로 쿼리하면 다른 커넥션이라 GUC 미적용 → 0행/거부. 흔한 버그.
- **값은 text** — `set_config` 2번째 인자는 문자열. boolean은 `'true'`/`'false'`로(그래야 `is_admin()`의 `= 'true'`와 일치).
- **트랜잭션 밖 `SET LOCAL`은 무효** — autocommit(문 단위 트랜잭션)에선 그 문장만 영향. 반드시 명시적 트랜잭션으로 GUC + 쿼리를 묶을 것.
- **미설정 시 fail-closed** — `current_setting(..., true)`가 NULL → 정책 거부(어드민/본인 아님). 안전한 기본값.

## 참고

- [13. 세션 관리 — DB 세션 vs JWT](./13-session-vs-jwt.md)
- [15. Postgres 롤·소유권과 GRANT 매트릭스](./15-postgres-roles-and-rls.md) — 접속 롤은 하나(`app`), 신원은 앱 DAL(RLS 시절엔 GUC)
- [`docs/architecture/auth-and-data.md`](../architecture/auth-and-data.md)
- [PostgreSQL — `set_config()` / `current_setting()`](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET)
- [PostgreSQL — `SET` / `SET LOCAL`](https://www.postgresql.org/docs/current/sql-set.html)
- 실제 스키마: [`db/schema.sql`](../../db/schema.sql) — 2026-08-01 이후 RLS 정책·`current_account_id()`·`is_admin()` 함수가 모두 제거되어 **지금은 GUC를 읽는 SQL이 없다.** 위 설계안의 SQL은 옛 Supabase 마이그레이션(`init_account`·`init_catalog`)에 있었고 통합 시 제외됐다.
