# DB 인가 계층 — GRANT 매트릭스 채택, RLS 미사용 (결정 2026-08-01)

> **상태: 결정 완료(2026-08-01), 현재도 유효.** 이 문서가 "왜 RLS 대신 GRANT인가"의 **근거 원본**이다.
> 운영 규칙은 [auth-and-data.md §DB 인가](./auth-and-data.md#db-인가--grant-매트릭스-rls-미사용)에, 실제 권한은 [`db/schema.sql`](../../db/schema.sql)의 각 도메인 GRANT 섹션에 있다.
> 롤·소유권·RLS 기전은 [lessons/15](../lessons/15-postgres-roles-and-rls.md), GUC 주입(미채택)은 [lessons/16](../lessons/16-transaction-guc-context.md).

## 결정 요약

```
RLS      사용하지 않는다 (정책·헬퍼 함수 전부 제거, db/schema.sql에 RLS 구문 없음)
GRANT    DB 방어선 — 앱은 비특권 `app` 롤로 접속, 테이블별 명시 권한만
인가     앱 DAL 단일화 (getCurrentAccount · requireAdmin · requireBoardManager + 소유권 WHERE)
```

## 왜 이 논의가 시작됐나

게시판 `post`·`post_comment`의 `author_name`·`author_code`(작성 시점 닉네임 스냅샷)를 없애고 현재 닉네임을 읽는 방향을 검토하다가, 커뮤니티 설계 초안의 "`account` own-row RLS 때문에 실시간 표시 불가"라는 서술을 확인했다. 그 과정에서 **RLS가 실제로는 아무것도 강제하지 않는다**는 사실이 드러나 인가 계층 전체를 다시 봤다.

## 실측 — 당시 무엇이 실제로 작동하고 있었나 (2026-08-01, 로컬 DB)

1. **앱이 테이블 소유자로 접속하고 있었다.** `current_user = postgres`, `rolbypassrls = true` → RLS 정책은 앱 쿼리에 적용되지 않는다.
2. **GRANT 설계도 함께 무효였다.** 소유자는 GRANT 대상이 아니라 암묵적 전권을 가진다. `has_table_privilege('app','post','DELETE') = false`로 soft delete를 DB가 강제하도록 설계돼 있었지만, 접속 롤이 `postgres`라 앱 버그로 `deleteMany`를 부르면 그대로 지워졌다.
   반면 **GRANT 매트릭스 자체는 전 테이블 완비**돼 있었다(누락 0건, 도메인별 구분 포함). 접속 유저만 바꾸면 즉시 켜지는 상태.
3. **RLS의 최대 명분이 이 프로젝트에 없었다.** RLS를 도입한 근거는 "공개 API 키로 DB에 직접 닿는 경로가 열릴 수 있다"는 위험 클래스였는데, 인증은 자체 구현(`account_session`)이고 DB에 닿는 경로는 **Prisma 하나**뿐임이 코드 수준에서 확인됐다.
4. **RLS 활성 테이블은 11개**(경계 데이터 `account`·`account_identity`·`order_address`·`payment`, 신고 2종, 카탈로그 4종). `FORCE ROW LEVEL SECURITY`는 전부 미적용 → 소유자는 무조건 우회.
5. **`app` 롤은 NOLOGIN 권한 그릇**으로만 존재했다. LOGIN·비밀번호는 버전관리 밖에서 부여하는 설계(현재 `scripts/db-reset.sh`·`infra/aws/db-apply.sh`가 담당).

당시 실질 방어선은 **앱 DAL 한 겹**이었다 — RLS도 GRANT도 작동하지 않았다.

## 선택지

`app` 롤 전환에는 두 목적이 섞여 있었고 난이도가 크게 달랐다.

| 목적 | 필요 작업 | 난이도 |
|---|---|---|
| **A. GRANT 매트릭스 활성화** | `DATABASE_URL` 접속 유저 교체 + 기능 검증 | 낮음 — 설계 완비 |
| **B. RLS 정책 작동** | A + **매 트랜잭션 GUC 주입**([lessons/16](../lessons/16-transaction-guc-context.md)) + 정책 디버깅 | 높음 — 모든 쿼리 경로 영향 |

- **안 1 — A만 (RLS 제거 + `app` 롤 전환) ← 채택**
- 안 2 — A + B (RLS 완수): 앱 버그가 남의 행을 읽는 것까지 차단하지만, GUC 주입을 모든 쿼리 경로에 도입 + 조용한 0행 디버깅 부담
- 안 3 — 현상 유지: 권하지 않음. 작동하지 않는 정책이 설계 논의를 계속 왜곡한다(이번 `author_name` 논의가 실례)

## 결정과 근거

**안 1을 채택한다** (2026-08-01).

1. **RLS의 최대 명분이 해당하지 않는다.** DB에 닿는 경로가 Prisma(`app` 롤) 하나라 "외부 키로 정책 없는 테이블에 직접 접근" 위험 클래스가 없다.
2. **`app` 롤 전환이 "부분 유지"를 불가능하게 만든다.** `app`은 `rolbypassrls = false`라 전환 순간 RLS가 실제로 작동하는데, GUC(`app.current_account_id`)를 주입하지 않으면 정책이 `NULL`과 비교해 **모든 조회가 0행**(fail-closed)이 된다. 즉 테이블마다 "제거"냐 "GUC 주입"이냐를 택일해야 하고, 경계 데이터만 남기는 절충안도 안 2의 비용을 전부 떠안는다.
3. **경계 데이터에 RLS를 남겨도 방어 독립성이 약하다.** RLS가 막는 시나리오는 "앱 DAL이 뚫렸을 때"인데, GUC를 주입하는 주체가 그 앱 DAL이다. 반면 GRANT는 앱이 바꿀 수 없다 — 접속 자격이 유출되지 않는 한 유지된다. 같은 복잡도라면 GRANT 쪽이 방어 대비 효율이 높다.
4. **GRANT는 이미 완비돼 있고 켜는 비용이 거의 없다.** 접속 유저 교체만 남았다.
5. **되돌릴 수 있다.** 정책 SQL은 git 히스토리에 남고, 소유키(`account_id`)는 앱 필터용으로 테이블에 그대로 있다. 경계 판단이 바뀌면 정책 재작성 + `ENABLE`로 복구 가능(스키마·Prisma 변경 불필요).

**안 2를 채택하지 않은 이유**: 추가로 막는 것은 "앱 DAL 버그로 남의 행을 읽는 경우"인데 그 방어가 앱 DAL 자신에 의존한다(근거 3). 비용(모든 쿼리 경로의 GUC 주입, 커넥션 풀 수명 관리, 0행 디버깅)은 확정적이고 이득은 조건부라 균형이 맞지 않는다.

## 적용 결과

| # | 작업 | 현재 위치 |
|---|---|---|
| 1 | RLS 정책 DROP + `DISABLE ROW LEVEL SECURITY`, 헬퍼 함수 `current_account_id()`·`is_admin()` DROP | `db/schema.sql`에는 RLS·헬퍼가 존재하지 않는다(통합 시 반영) |
| 2 | `ALTER ROLE app WITH LOGIN PASSWORD …` (git 밖, 환경별 1회) | 로컬 `scripts/db-reset.sh`, RDS `infra/aws/db-apply.sh` |
| 3 | `DATABASE_URL` 접속 유저 → `app` | `.env.local.example`, SSM `/iroiro/<env>/DATABASE_URL` |
| 4 | 문서 반영 | [auth-and-data.md](./auth-and-data.md) · [lessons/15](../lessons/15-postgres-roles-and-rls.md) · [lessons/16](../lessons/16-transaction-guc-context.md)(GUC 주입은 미채택 설계로 표시) |

### 검증 (2026-08-01 완료)

GRANT가 비로소 작동하므로 **권한 오류가 나는 곳이 곧 GRANT 누락**이었다.

- [x] DB reset → `npm run validate` → 통합 테스트 → 실 DB 검증 → production build
- [x] identity 시퀀스는 별도 GRANT 없이 테이블 INSERT 권한만으로 동작(설계 주석대로)
- [x] `db:pull`·`db:generate`가 `app` 롤로 정상 동작

**전환이 잡아낸 결함**: `purgeAllProducts`가 `inventory_item`(구매 결과 원장)을 hard delete하고 있었다 — 그 테이블에는 DELETE GRANT가 없다. 컬렉션 카드의 이름·썸네일·수량이 이 원장의 스냅샷에서 나오므로 지우면 컬렉션이 빈 채로 보였다. 코드 쪽을 고쳐 삭제 대상에서 제외했고, GRANT(`INSERT, SELECT, UPDATE`)가 `order_item`과 같은 계열로 분류한 것과 일치한다.

**테스트 인프라 분리**: 통합 테스트의 픽스처 정리는 hard delete가 필요한데 `app` 롤에는 권한이 없다. 검증 대상(앱 코드)은 `app` 롤로 돌려야 의미가 있으므로 **정리에만** 소유자 연결을 쓴다(`tests/integration/_privileged-db.ts` · `DATABASE_URL_PRIVILEGED`).

## 조사 중 확인한 부수 사실

### 뷰(VIEW)는 이 목적에 쓸 수 없다
공개 필드만 노출하는 뷰를 검토했으나 철회했다. 기반 테이블에 RLS가 켜져 있으면 기본(`security_invoker = false`)은 **뷰 소유자의 권한으로 우회**되어 안티패턴이고, 권장 설정(`security_invoker = true`)은 호출자 권한이라 RLS에 막혀 목적 미달이다 — [CREATE VIEW](https://www.postgresql.org/docs/current/sql-createview.html).

### RLS는 컬럼을 제한하지 못한다
RLS는 어떤 **행**에 접근할지는 통제하지만 행 안의 어떤 **컬럼**인지는 통제하지 못한다([Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)). `account`에 "남의 행도 읽되 `display_name`만" 정책은 쓸 수 없다. 컬럼 GRANT로 좁히는 것도 불가 — `app` 롤은 세션 DAL을 위해 본인 행에서 전 컬럼을 읽어야 하는데, GRANT는 롤 단위라 "본인은 전부, 남은 일부"를 표현할 수 없다.

### 탈퇴 계정은 이미 해결돼 있다
`softDeleteAccount`가 탈퇴 시 `display_name`을 `"탈퇴한 회원"`으로 덮어쓴다. 현재 이름을 읽어도 자동 처리되므로 별도 폴백이 필요 없다.

### 스냅샷을 유지할 근거는 RLS 말고도 있다
| 근거 | 내용 |
|---|---|
| 사칭 | 닉네임을 남의 이름으로 바꾸면 과거 글까지 소급해 그 이름으로 보인다 |
| 신고 증거 | `post_report.snapshot`은 시점 동결이 목적 — 작성자 이름만 실시간이면 증거가 어긋난다 |
| 외부 리뷰 판정 | "수정 시 재시드는 같은 작성자의 글마다 이름이 달라진다"로 이미 한 차례 기각 |

## 이 결정이 풀어주는 것

`author_name`·`author_code` 스냅샷 제거(이 논의의 발단)가 **단순 JOIN 문제로 내려앉는다.** 공개 프로필 테이블도, 뷰도 불필요하다 — `account`를 직접 읽으면 된다. 다만 스냅샷을 없앨지는 위 "스냅샷을 유지할 근거"가 남으므로 **별개 판단**이다.

## 출처

- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL — CREATE VIEW (`security_invoker`)](https://www.postgresql.org/docs/current/sql-createview.html)
- 저장소 내부: [auth-and-data.md](./auth-and-data.md) · [lessons/15](../lessons/15-postgres-roles-and-rls.md) · [lessons/16](../lessons/16-transaction-guc-context.md) · [`db/schema.sql`](../../db/schema.sql)
