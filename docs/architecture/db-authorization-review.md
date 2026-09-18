# DB 인가 계층 재검토 (2026-08-01) — 실측·결정·근거

> **상태: 결정 완료(2026-08-01).** 이 문서가 결정의 **근거 원본**이다.
> 각 문서의 규칙은 [rls-best-practices.md](./rls-best-practices.md)·[auth-and-data.md](./auth-and-data.md)·
> [lessons/15](../lessons/15-postgres-roles-and-rls.md)에 반영했고, 여기서는 **왜 그렇게 정했는지**를 남긴다.

## 결정 요약

```
RLS      11개 테이블 전부 제거 (정책 DROP + DISABLE + 헬퍼 함수 2개 DROP)
GRANT    유지 — app 롤 전환으로 비로소 작동시킴
인가     앱 DAL 단일화 (requireAdmin · requireAccount)
```

근거는 [결정과 근거](#결정과-근거) 절. 실측이 먼저 오고 결정이 그 뒤에 온다.

## 왜 이 논의가 시작됐나

게시판 `post`·`post_comment`의 `author_name`·`author_code`(작성 시점 닉네임 스냅샷)를 없애고
**현재 닉네임을 읽는** 방향을 검토하면서 시작됐다. 스펙은 스냅샷의 이유를 이렇게 적고 있었다.

> 현재 이름 실시간 표시는 `account` own-row RLS 때문에 불가
> — [community-design.md](../superpowers/specs/2026-07-19-community-design.md)

"RLS 때문에 불가"라는 서술이 맞는지 확인하다가, **RLS가 현재 아무것도 강제하지 않는다**는 사실이
드러났다. 그래서 개별 기능이 아니라 인가 계층 전체를 다시 봤다.

## 실측 — 무엇이 실제로 작동하고 있나

로컬 DB에 직접 질의해 확인했다(2026-08-01, `feat/community`).

### 1. 앱은 테이블 소유자로 접속한다

```
current_user = postgres   rolsuper = false   rolbypassrls = true
post·post_comment·account 소유자 = postgres
```

`rolbypassrls = true`이므로 **RLS 정책이 앱 쿼리에 적용되지 않는다.**
이 사실 자체는 [lessons/15](../lessons/15-postgres-roles-and-rls.md)에 이미 기록돼 있다
("`app` 롤 전환이 Option 3를 켜는 스위치").

### 2. GRANT 설계도 함께 무효다 — 새로 확인

소유자는 GRANT의 대상이 아니라 암묵적 전권을 가진다. 실측:

```
has_table_privilege('postgres', 'post', 'DELETE') = true    ← 현재 접속 롤
has_table_privilege('app',      'post', 'DELETE') = false   ← 설계된 롤
```

`post`·`post_comment`·`post_photo`에 DELETE를 부여하지 않은 것은 **soft delete를 DB가 강제**하려는
설계인데, 지금은 작동하지 않는다. 앱 버그로 `deleteMany`를 호출하면 그대로 지워진다.

**GRANT 매트릭스는 이미 완비되어 있다** — 28개 테이블 전부, 누락 0건.
도메인별 구분도 되어 있다(`post`=INSERT/SELECT/UPDATE · `post_report`=INSERT/SELECT ·
`pending_post_photo`=DELETE 포함). 즉 **접속 유저만 바꾸면 즉시 켜진다.**

### 3. Data API를 쓰지 않는다 — 새로 확인

| 확인 | 결과 |
|---|---|
| `supabase.from(...)` 테이블 쿼리 | **0건** (앱 전체) |
| `@/lib/supabase/*` import | **`middleware.ts` 한 곳** |
| `account` 등 민감 테이블의 anon 권한 | `REVOKE ALL ... FROM anon, authenticated` |

[lessons/15](../lessons/15-postgres-roles-and-rls.md)가 "우리는 미사용"이라 적어둔 것이
코드 수준에서 확인됐다.

### 4. Supabase Auth 자체를 쓰지 않는다 — 새로 확인

`middleware.ts`가 부르는 `updateSession()`은 매 요청 `supabase.auth.getUser()`를 호출한다.
그런데 이 프로젝트의 인증은 **카카오·네이버 자체 OAuth + `account_session`** 이다.
Supabase 세션 쿠키는 애초에 발급되지 않으므로 이 호출은 **아무 일도 하지 않는다.**

같은 함수가 세팅하는 `x-pathname` 헤더도 소비처가 없다 — 관리자 외곽 게이트를 제거하면서
유일한 소비자가 사라졌다(`60eea90` 이전 커밋).

### 5. RLS 활성 테이블은 11개, 성격은 3갈래

```sql
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class ... WHERE relrowsecurity;
```

| 성격 | 테이블 | 정책 |
|---|---|---|
| 경계 데이터(PII·결제) | `account` · `account_identity` · `order_address` · `payment` | 본인 행만 |
| 신고(경계) | `post_report` · `post_comment_report` | 본인 신고 + 관리자 |
| 카탈로그(공개) | `team` · `member` · `product` · `product_photo` | 공개 읽기 / 관리자 쓰기 |

`FORCE ROW LEVEL SECURITY`는 **11개 전부 미적용**이다. 즉 소유자(`postgres`)는 무조건 우회한다.

### 6. `app` 롤은 접속할 수 없다

```
app: rolcanlogin = false, rolbypassrls = false
```

`app`은 **권한 그릇(NOLOGIN)** 으로 만들어져 있다. GRANT는 다 받아뒀지만 아무도 그 롤로 접속할 수
없어 권한이 쓰이지 않는다. 마이그레이션 주석이 이미 이 상태를 전제하고 있다.

> LOGIN·비밀번호는 버전관리 밖에서 부여: `ALTER ROLE app WITH LOGIN PASSWORD '***';`
> — [init_catalog](../../supabase/migrations/20260508132935_init_catalog.sql)

부수 확인:

- `GRANT USAGE ON SCHEMA public TO app` — **있음**(없으면 테이블 GRANT가 통째로 무효)
- 시퀀스 25개에 USAGE 미부여 — identity 컬럼이라 INSERT 권한으로 동작하는 게 표준이나 **전환 후 실검증 대상**
- 롤은 클러스터 단위 객체 + 마이그레이션이 `IF NOT EXISTS`로 가드 → **`db:reset`에도 LOGIN이 유지된다**(1회 부여로 끝)
- RLS 헬퍼 함수 `current_account_id()`·`is_admin()`은 정책에서만 쓰임 → 정책 제거 시 함께 정리 대상

## 기존 문서의 전제와 달라진 점

[rls-best-practices.md](./rls-best-practices.md)의 결론은 이 근거에 서 있다.

> 우리는 Supabase + **(잠재적) Data API 노출** 맥락이라, RLS-off의 가장 강력한 실증인
> **CVE-2025-48757**(정책 없는 노출 테이블이 anon 키만으로 대량 유출)이 정확히 우리 위험 클래스다.

**"(잠재적)"이 핵심이다.** 조사 결과 이 프로젝트는 Data API를 잠재적으로도 쓰지 않는다 —
쿼리 0건, 민감 테이블은 GRANT에서 차단, 인증조차 자체 구현이다.

그 문서 자신이 이 경우의 판단 기준을 이미 적어뒀다.

> Data API에서 `REVOKE`된 테이블의 RLS는 *app 롤 앱-버그 대비 backstop*일 뿐이라,
> **경계 데이터가 아니면** 그 값이 도메인-순수성 비용을 넘지 못한다.

즉 문서를 뒤집는 게 아니라, **문서가 전제한 위험이 실제로는 해당하지 않음이 확인된 것**이다.

## 현재 방어 상태 정리

| 위협 | RLS가 막나 | GRANT가 막나 |
|---|---|---|
| Data API 대량 유출(CVE 클래스) | 해당 없음 — 미사용 | 해당 없음 |
| `anon` 키 노출 | 해당 없음 — REVOKE로 차단 | ✅ 차단 중 |
| 앱 버그(잘못된 hard delete) | ❌ 우회 중 | ❌ 소유자라 무효 |
| `DATABASE_URL` 유출 | ❌ 우회 중 | ❌ 소유자라 무효 |
| SQL injection | ❌ 우회 중 | ❌ 소유자라 무효 |

**현재 실질 방어선은 앱 DAL 한 겹이다.** RLS도 GRANT도 작동하지 않는다.

## 선택지

`app` 롤 전환에는 **두 가지 목적이 섞여 있다.** 분리해서 보면 난이도가 크게 다르다.

| 목적 | 필요 작업 | 난이도 |
|---|---|---|
| **A. GRANT 매트릭스 활성화** | `DATABASE_URL` 접속 유저 교체 + 기능 검증 | 낮음 — 설계는 이미 완비 |
| **B. RLS 정책 작동** | A + **매 트랜잭션 GUC 주입**([lessons/16](../lessons/16-transaction-guc-context.md)) + 정책 디버깅 | 높음 — 모든 쿼리 경로 영향 |

B가 어려운 이유는 커넥션 풀에서 GUC가 트랜잭션 경계를 넘어 새면 **다른 사용자 컨텍스트로
조회**될 수 있기 때문이다. 그래서 `set_config(..., true)`를 매 트랜잭션에 주입해야 한다.

### 안 1 — A만 (RLS 제거 + `app` 롤 전환) ← **채택**

```
인가 판정   앱 DAL 단일화 (requireAdmin·requireAccount)
DB 방어선   GRANT 매트릭스 (soft delete 강제, 컬럼 제한 UPDATE)
```

### 안 2 — A + B (원래 계획 완수)

- RLS가 실제 방어선이 됨 — 앱 버그가 남의 행을 읽는 것까지 차단
- 비용: GUC 주입을 모든 쿼리 경로에 도입 + 조용한 0행 디버깅 부담

### 안 3 — 현상 유지

**권하지 않는다.** 작동하지 않는 정책이 설계 논의를 계속 왜곡한다.
이번 `author_name` 논의가 그 실례다 — 실제로는 아무것도 막지 않는 정책 때문에
공개 프로필 테이블 신설을 검토했다.

## 결정과 근거

**안 1을 채택한다** (2026-08-01).

### 1. RLS의 최대 명분이 이 프로젝트에 해당하지 않는다

기존 결론의 근거는 CVE-2025-48757(Data API 대량 유출)이었다. 그런데 실측 3·4에서 이 프로젝트가
**Data API도 Supabase Auth도 쓰지 않음**이 확인됐다. 위험 클래스 자체가 없다.

### 2. `app` 롤 전환이 "부분 유지"를 불가능하게 만든다 — 가장 실질적인 근거

`app` 롤은 `rolbypassrls = false`다. 전환하는 순간 RLS가 **실제로 작동하기 시작**한다.
그런데 GUC(`app.current_account_id`)를 주입하지 않으면 정책이 `NULL`과 비교해 **모든 조회가 0행**이
된다(fail-closed).

```
app 롤 전환  +  RLS 유지  +  GUC 미주입   →   앱이 통째로 깨짐
```

즉 11개 테이블 각각에 대해 **"제거"냐 "GUC 주입"이냐를 택일**해야 한다. 경계 데이터만 남기는
절충안은 GUC 작업(안 2의 비용 전부)을 그대로 떠안는다 — "RLS 정리로 단순해진다"는 이점이 사라진다.

### 3. 경계 데이터에 RLS를 남겨도 방어 독립성이 약하다

RLS가 막는 시나리오는 "앱 DAL이 뚫렸을 때"인데, **GUC를 주입하는 주체가 그 앱 DAL이다.**
앱이 뚫리면 GUC도 조작 가능하므로 두 계층이 독립적이지 않다.

반면 GRANT는 앱이 바꿀 수 없다 — DB 롤 권한이라 접속 자격증명이 유출되지 않는 한 유지된다.
**같은 복잡도를 쓴다면 GRANT 쪽이 방어 대비 효율이 높다.**

### 4. GRANT는 이미 완비돼 있고, 켜는 비용이 거의 없다

28개 테이블 누락 0건, 스키마 USAGE 부여됨, 도메인별 구분(soft delete 강제·컬럼 제한 UPDATE)까지
설계 완료. **접속 유저 교체만 남았다.** RLS(GUC 주입 + 정책 디버깅)와 난이도가 비교되지 않는다.

### 5. 되돌릴 수 있다

정책 SQL은 git 히스토리에 남고, 소유키(`account_id`)는 앱 필터용으로 테이블에 그대로 있다.
경계 판단이 바뀌면 정책 재작성 + `ENABLE`로 복구 가능하다(스키마·Prisma 변경 불필요).

### 채택하지 않은 이유 — 안 2

원래 계획(RLS 완수)을 접는 것이라 근거를 남긴다. 안 2가 추가로 막는 것은 **"앱 DAL 버그로 남의 행을
읽는 경우"** 인데, 근거 3에서 보듯 그 방어가 앱 DAL 자신에 의존한다. 반면 비용(모든 쿼리 경로의
GUC 주입, 커넥션 풀 수명 관리, 조용한 0행 디버깅)은 확정적이다. **비용은 확실하고 이득은 조건부**라
현 단계에서는 균형이 맞지 않는다고 판단했다.

## 작업 순서

DB 전체 reset으로 새 SQL을 적용하므로 **중간 상태가 없다** — 순서 의존성 없이 한 번에 진행한다.
(pre-launch라 베타 DB도 자유롭게 재구축 가능)

| # | 작업 | 대상 |
|---|---|---|
| 1 | RLS 정책 DROP + `DISABLE ROW LEVEL SECURITY` (11테이블) | `init_catalog`·`init_account`·`init_order`·`init_post` |
| 2 | 헬퍼 함수 `current_account_id()`·`is_admin()` DROP | `init_catalog`·`init_account` |
| 3 | `ALTER ROLE app WITH LOGIN PASSWORD` (git 밖, 환경별 1회) | 로컬·베타·운영 |
| 4 | `DATABASE_URL` 접속 유저 `postgres` → `app` | `.env.local`·배포 환경변수 |
| 5 | 문서 갱신 | 아래 [문서 갱신 범위](#문서-갱신-범위) |

### 검증 결과 (2026-08-01 완료)

GRANT가 비로소 작동하므로 **권한 오류가 나는 곳이 곧 GRANT 누락**이었다.

- [x] `db:reset` → `validate`(770) → 통합(19) → 실 DB 검증(대기 사진 소비 8 · 잠금 13) → production build
- [x] **쓰기 실동작** — identity 시퀀스는 별도 GRANT 없이 INSERT 권한만으로 동작함을 확인(설계 주석대로)
- [x] `db:pull`·`db:generate` — `app` 롤로 정상 동작

#### 전환이 잡아낸 것

**`purgeAllProducts`가 `inventory_item`을 hard delete하고 있었다** — 그 테이블에는 DELETE GRANT가 없다.
`postgres` 롤로는 드러나지 않던 결함이다.

분석 결과 **코드 쪽이 잘못이었다.** 이 도구의 의도는 카탈로그 재구축(백업 → 전체 삭제 → 외부 API
재수집)이고, 화면도 `order_item`·`collection_item`은 "삭제되지 않는다"고 안내한다. 그런데
`inventory_item`(구매 결과 원장)만 삭제 대상에 들어가 있었다.

더 결정적으로, **컬렉션 카드의 이름·썸네일·수량이 이 원장의 스냅샷에서 나온다**
(`modules/collection/lib/queries.ts` — `product` 테이블은 아예 참조하지 않는다).
지우면 "활성 0 등록 제외"에 걸려 **컬렉션이 빈 채로 보인다.** 즉 `collection_item`을 남긴다는
설계 의도를 코드가 스스로 무력화하고 있었다.

→ `purgeAllProducts`에서 `inventory_item` 삭제를 제거하고 보존 그룹으로 옮겼다.
   GRANT(`INSERT, SELECT, UPDATE` — DELETE 없음)가 `order_item`과 같은 계열로 분류한 것과 일치한다.

#### 테스트 인프라 분리

통합 테스트·실 DB 검증 스크립트의 **픽스처 정리**는 hard delete가 필요한데 `app` 롤에는 그 권한이
없다. 검증 대상(앱 코드)은 `app` 롤로 돌려야 의미가 있으므로, **정리에만** 소유자 연결을 쓴다
(`tests/integration/_privileged-db.ts` · `DATABASE_URL_PRIVILEGED`).
전체를 소유자로 돌리면 GRANT 검증 가치가 사라진다.

## 문서 갱신 범위

| 문서 | 변경 |
|---|---|
| [rls-best-practices.md](./rls-best-practices.md) | 결론 교체(유지 → 제거). 커뮤니티 리서치·정책 작성 규칙은 재도입 대비로 보존 |
| [auth-and-data.md](./auth-and-data.md) | 접근 경로 표의 RLS 열 갱신 |
| [lessons/15](../lessons/15-postgres-roles-and-rls.md) | `app` 롤 전환 목적에서 RLS 제거, GRANT 활성화로 재정의 |
| [lessons/16](../lessons/16-transaction-guc-context.md) | GUC 주입은 **미채택 설계**로 표시(개념 설명은 보존) |

## 조사 중 확인한 부수 사실

### 뷰(VIEW)는 이 목적에 쓸 수 없다

공개 필드만 노출하는 뷰를 검토했으나 철회했다. Postgres 공식 문서:

> 기반 릴레이션에 RLS가 켜져 있으면 기본적으로 **뷰 소유자의 RLS 정책이 적용된다.**
> — [CREATE VIEW](https://www.postgresql.org/docs/current/sql-createview.html)

| 뷰 설정 | 목적 달성 | 평가 |
|---|---|---|
| `security_invoker = false`(기본) | 가능 | **안티패턴** — Supabase가 린트로 경고 |
| `security_invoker = true` | 불가 — 호출자 권한이라 RLS에 막힘 | 권장 설정 |

동작하는 설정이 경고 대상이고, 안전한 설정은 목적 미달이다.
([Postgres Views: The Hidden Security Gotcha in Supabase](https://dev.to/datadeer/postgres-views-the-hidden-security-gotcha-in-supabase-ckd))

### RLS는 컬럼을 제한하지 못한다

> RLS는 어떤 **행**에 접근할지는 통제하지만, 행 안의 어떤 **컬럼**에 접근할지는 통제하지 못한다.
> — [PostgreSQL 5.9 Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

`account`에 "남의 행도 읽되 `display_name`만"이라는 정책을 쓸 수 없다. 정책을 열면 이메일·전화번호·
`is_admin`이 함께 열린다. 컬럼 GRANT로 좁히는 것도 불가 — `app` 롤은 세션 DAL을 위해
**본인 행에서는 전 컬럼**을 읽어야 하는데, GRANT는 롤 단위라 "본인은 전부, 남은 일부"를 표현할 수 없다.

### 탈퇴 계정은 이미 해결돼 있다

`softDeleteAccount`가 탈퇴 시 `display_name`을 `"탈퇴한 회원"`으로 덮어쓴다.
현재 이름을 읽어도 자동으로 처리되므로 별도 폴백이 필요 없다.

### 스냅샷을 유지할 근거는 RLS 말고도 있다

`author_name` 제거를 검토할 때 함께 확인된 것 — 아래는 RLS와 무관하게 남는다.

| 근거 | 내용 |
|---|---|
| **사칭** | 닉네임을 남의 이름으로 바꾸면 **과거 글까지 소급**해 그 이름으로 보인다 |
| 신고 증거 | `post_report.snapshot`은 시점 동결이 목적 — 작성자 이름만 실시간이면 증거가 어긋난다 |
| 외부 리뷰 판정 | "수정 시 재시드는 같은 작성자의 글마다 이름이 달라진다"로 이미 한 차례 기각 |

스펙이 RLS만 근거로 적어둬 **RLS가 유일한 이유처럼 읽히는 것**은 사실이다. 방향이 정해지면
이 항목들도 스펙에 함께 적는다.

## 이 결정이 풀어주는 것

`author_name`·`author_code` 스냅샷 제거(이 논의의 발단)가 **단순 JOIN 문제로 내려앉는다.**
공개 프로필 테이블도, 뷰도 불필요하다 — `account`를 직접 읽으면 된다.

다만 스냅샷을 없앨지는 **별개 판단**으로 남는다. RLS를 걷어내도 사칭·신고 증거 동결이라는 근거가
남기 때문이다([스냅샷을 유지할 근거](#스냅샷을-유지할-근거는-rls-말고도-있다) 절).

## 출처

- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL — CREATE VIEW (`security_invoker`)](https://www.postgresql.org/docs/current/sql-createview.html)
- [Supabase — User Management (public profiles 패턴)](https://supabase.com/docs/guides/auth/managing-user-data)
- [Postgres Views: The Hidden Security Gotcha in Supabase](https://dev.to/datadeer/postgres-views-the-hidden-security-gotcha-in-supabase-ckd)
- 저장소 내부: [rls-best-practices.md](./rls-best-practices.md) · [auth-and-data.md](./auth-and-data.md) ·
  [lessons/15](../lessons/15-postgres-roles-and-rls.md) · [lessons/16](../lessons/16-transaction-guc-context.md)
