# 데이터베이스 설계 레슨

이로이로(`iroiro`) DB 스키마([`db/schema.sql`](../../db/schema.sql))를 설계하면서 마주친 결정과 그 배경을 정리한 학습 노트.
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
2. [Extension](./02-postgres-extensions.md) — Postgres에 끼워넣는 모듈 시스템 (pgcrypto, postgis 등). 이 프로젝트는 확장 0개 — 로컬·RDS 어디서든 같은 스키마.

### 스키마 설계
3. [Primary Key 전략](./03-primary-key-strategy.md) — UUID vs `BIGINT IDENTITY`, 한국 이커머스 사례. 카탈로그는 IDENTITY, 회원 계열은 앱 생성 UUIDv7.
4. [Audit 컬럼](./04-audit-columns.md) — `created_at/by`, `updated_at/by`. DB 트리거 vs 앱 레벨 제어 — 앱 레벨을 택한 이유.
5. [Foreign Key 정책](./05-foreign-keys.md) — DB FK를 둘 것인가 앱에서 관리할 것인가.

### 타입 선택
6. [TEXT vs VARCHAR](./06-text-vs-varchar.md) — Postgres에선 같은 구현, MySQL 직관이 안 통함.
7. [TIMESTAMPTZ](./07-timestamptz.md) — UTC 저장 + 세션 TZ 자동 변환. `DATETIME(6)`과 다른 점.

### 외부 자원 연동
8. [객체 스토리지 패턴 (S3 호환)](./08-r2-storage-pattern.md) — DB는 메타데이터, 객체 스토리지는 바이트. AWS S3(운영)·MinIO(로컬)를 `aws4fetch`로 같은 코드로. 공개/비공개 두 버킷, 서버 경유 업로드, `/media/...` HMAC 프록시 서빙, `R2_REGION` 서명 스코프. 이름의 `R2`는 이력.
9. [URL Slug 전략](./09-url-slug-strategy.md) — 영미권 vs 한국 패턴, slug 도입 시점.
10. [Database URL 비밀번호 인코딩](./10-database-url-password.md) — RDS 접속 문자열(SSM `DATABASE_URL`)에 비밀번호 특수문자가 들어갈 때 percent-encoding 규칙. `#`·`/`는 즉시 `ERR_INVALID_URL`. `?sslmode=verify-full&sslrootcert=…` query와 문자 충돌 주의, `setup.sh`는 영숫자만 생성.

### 인증·세션
13. [세션 관리 — DB 세션 vs JWT](./13-session-vs-jwt.md) — 무상태(JWT)·DB 세션·인메모리 비교, 탈취 모델, 만료·폐기. 서버는 RAM에 세션을 두지 않는다 — 세션은 곧 테이블의 한 행. JWT의 "자연 복구"는 access 토큰만 샜을 때만 성립.
15. [Postgres 롤·소유권과 GRANT 매트릭스](./15-postgres-roles-and-rls.md) — 소유자는 GRANT를 우회하고 비특권 롤만 검사받는다. 앱은 비특권 `app` 롤로 접속(로컬·RDS 모두 완료), `db/schema.sql`의 REVOKE 베이스라인 + 명시 GRANT가 DB 방어선. RLS는 2026-08-01 제거 — 행 스코프는 앱 DAL. LOGIN은 `db-reset.sh`/`db-apply.sh`가 부여.
16. [트랜잭션 GUC로 요청 컨텍스트 주입 (미채택)](./16-transaction-guc-context.md) — 트랜잭션·GUC 개념, 세션 vs 트랜잭션 스코프, `set_config(..., true)`. 세션 스코프는 풀링서 context bleed → 반드시 트랜잭션 스코프 + 같은 tx로 쿼리. RLS 제거로 미채택, 개념 보존.

## 추천 읽기 순서

처음 합류했다면 **3 → 5 → 4 → 7 → 6 → 1 → 15 → 13 → 8 → 9 → 10 → 2** 순서 — 실제 코드 영향이 큰 것부터. 16은 RLS를 되살릴 때만.

> 번호 11·12·14는 비어 있다 — Vercel 리전·R2 CORS·서버리스 세션 노트였고 AWS ECS(장수 컨테이너)·S3·서버 경유 업로드로 옮기면서 전제가 사라져 삭제했다. 다른 문서의 링크가 파일명에 걸려 있어 번호는 다시 매기지 않는다.

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

- 실제 스키마(단일 정본): [`db/schema.sql`](../../db/schema.sql) — 로컬 적용 `npm run db:reset`([`scripts/db-reset.sh`](../../scripts/db-reset.sh)), RDS 적용 [`infra/aws/db-apply.sh`](../../infra/aws/db-apply.sh)
- 인증·데이터 룰: [`docs/architecture/auth-and-data.md`](../architecture/auth-and-data.md) · RLS 제거 근거: [`docs/architecture/db-authorization-review.md`](../architecture/db-authorization-review.md)
- 인프라·배포: [`docs/deployment.md`](../deployment.md) — ECS Express Mode·RDS·S3·SSM
- 이미지: [`docs/image-path-strategy.md`](../image-path-strategy.md) (객체 키 설계) · [`docs/product-image-protection.md`](../product-image-protection.md) (`/media/...` 서빙)
- 환경변수: [`docs/environment-variables.md`](../environment-variables.md)
