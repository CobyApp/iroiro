# 데이터베이스 설계 레슨

`iroiro` DB 스키마(`db/schema.sql`, 구 Supabase 마이그레이션)를 설계하면서 마주친 결정과 그 배경을 정리한 학습 노트.
스키마를 보다가 *"왜 이렇게 됐지?"* 가 궁금하거나, Postgres가 처음이라면 읽어보세요.

## 디렉토리 분류

이 디렉토리는 같은 `docs/` 안의 다른 문서와 역할이 다릅니다.

| 위치 | 역할 |
|---|---|
| `docs/architecture/` | **어떻게** 작성하는가 (룰·구조·컨벤션) |
| `docs/<주제>.md` (루트) | **왜** 이 스택인가 (스택 결정 기록) |
| **`docs/lessons/` (여기)** | **무엇을** 알아야 하는가 (DB 기술 학습 노트) |

## 목차

### Postgres 기본 문법
1. [DDL 코멘트](./01-postgres-comments.md) — `COMMENT ON ...` 문법과 조회. MySQL의 인라인 코멘트가 안 통함.
2. [Extension](./02-postgres-extensions.md) — Postgres에 끼워넣는 모듈 시스템 (pgcrypto, postgis 등).

### 스키마 설계
3. [Primary Key 전략](./03-primary-key-strategy.md) — UUID vs `BIGINT IDENTITY`, 한국 이커머스 사례.
4. [Audit 컬럼](./04-audit-columns.md) — `created_at/by`, `updated_at/by`와 Supabase 트리거 패턴.
5. [Foreign Key 정책](./05-foreign-keys.md) — DB FK를 둘 것인가 앱에서 관리할 것인가.

### 타입 선택
6. [TEXT vs VARCHAR](./06-text-vs-varchar.md) — Postgres에선 같은 구현, MySQL 직관이 안 통함.
7. [TIMESTAMPTZ](./07-timestamptz.md) — UTC 저장 + 세션 TZ 자동 변환. `DATETIME(6)`과 다른 점.

### 외부 자원 연동
8. [R2 스토리지 패턴](./08-r2-storage-pattern.md) — DB는 메타데이터, 객체 스토리지는 바이트.
9. [URL Slug 전략](./09-url-slug-strategy.md) — 영미권 vs 한국 패턴, slug 도입 시점.
10. [Database URL 비밀번호 인코딩](./10-database-url-password.md) — Supabase connection string에 비밀번호 특수문자가 들어갈 때 percent-encoding 규칙. `#`·`/`는 즉시 `ERR_INVALID_URL`.
12. [R2 CORS 정책](./12-r2-cors-policy.md) — 브라우저 직접 PUT 업로드의 preflight 요구. 로컬 MinIO는 관용적·R2는 엄격해서 *로컬에선 OK인데 운영에서 403* 함정.

### 인증·세션
13. [세션 관리 — DB 세션 vs JWT](./13-session-vs-jwt.md) — 무상태(JWT)·DB 세션·인메모리 비교, 탈취 모델, 만료·폐기. 서버는 RAM에 세션을 두지 않는다 — 세션은 곧 테이블의 한 행. JWT의 "자연 복구"는 access 토큰만 샜을 때만 성립.
14. [서버리스 세션과 Next 16 Proxy/DAL](./14-serverless-session-and-proxy.md) — 서버 인스턴스 없이 DB 세션이 되는 이유, Next 16 미들웨어→Proxy 개명·Node 런타임, Proxy(쿠키 optimistic)+DAL(authoritative) 2계층, 커넥션 풀러 필수.
15. [Postgres 롤·소유권과 RLS 적용](./15-postgres-roles-and-rls.md) — 특권(소유자)는 RLS 우회, 비특권 롤만 적용. 앱은 비특권 `app` 롤로 접속해야 RLS가 작동. 접속 롤은 하나, 신원은 GUC. 현재는 `postgres`라 RLS 전면 우회 중.
16. [트랜잭션 GUC로 RLS에 요청 컨텍스트 주입](./16-transaction-guc-context.md) — 트랜잭션·GUC 개념, 세션 vs 트랜잭션 스코프, `set_config(..., true)`로 요청 신원 주입. 세션 스코프는 풀링서 context bleed → 반드시 트랜잭션 스코프 + 같은 tx로 쿼리.

## 추천 읽기 순서

처음 합류했다면 **3 → 5 → 4 → 7 → 6 → 1 → 8 → 9 → 2** 순서 — 실제 코드 영향이 큰 것부터.

특정 결정이 궁금하면 목차에서 바로 골라 읽으세요. 각 문서는 독립적으로 읽힙니다.

## 각 문서 포맷

```
## 왜 알아야 하는가
## 핵심 개념
## 코드/문법
## 비교 표
## 이 프로젝트의 결정
## 참고
```

## 관련 파일

- 실제 스키마: [`db/schema.sql`](../../db/schema.sql)
- 인증·데이터 룰: [`docs/architecture/auth-and-data.md`](../architecture/auth-and-data.md)
- 스택 결정 기록: [`docs/database-strategy.md`](../database-strategy.md), [`docs/image-strategy.md`](../image-strategy.md)
