# iroiro 문서

기술 결정·아키텍처·운영 절차를 정리한 문서. 현재 스택: Next.js 16(App Router) · React 19 · Prisma 7 + PostgreSQL 17(AWS RDS) · AWS S3 · AWS ECS Express Mode(Fargate) · 자체 OAuth(카카오·네이버, DB 세션).

## 운영 · 설정 (배포·시크릿 다룰 때)

- **[배포·브랜치 전략](./deployment.md)** — 환경(dev/prd)·도메인·AWS 리소스(ECS·RDS·S3·SSM·EventBridge), GitHub Actions CI/CD, 최초 프로비저닝, DB 스키마 변경 운영, 비용, 롤백. **인프라의 단일 진실**(살아있는 문서)
- [카카오·네이버 로그인 설정](./oauth-setup.md) — 제공자 콘솔 등록 절차, 환경별 콜백 URL, `.env.local`/SSM 값 채우기, 검증·문제 해결
- [환경변수 레퍼런스](./environment-variables.md) — 전체 환경변수 목록·필수 구분·값 출처·운영 값 위치(SSM `/iroiro/<env>/…`)

## 아키텍처 (개발 전 필수 참조)

- **[아키텍처 인덱스](./architecture/README.md)** — 코드 작성 전 [overview.md](./architecture/overview.md) 먼저.
  - [overview.md](./architecture/overview.md) — 진입점, 한 페이지 요약
  - [directory.md](./architecture/directory.md) — 디렉터리 구조·파일 배치
  - [conventions.md](./architecture/conventions.md) — 룰 상세·예시
  - [routing.md](./architecture/routing.md) — 라우트 그룹·layout·middleware
  - [auth-and-data.md](./architecture/auth-and-data.md) — 인증(DB 세션)·데이터 접근(Prisma)·스토리지 작업
  - [data-modeling.md](./architecture/data-modeling.md) — DB 테이블·컬럼 설계 규칙(`db/schema.sql`)
  - [db-authorization-review.md](./architecture/db-authorization-review.md) — `app` 롤 + GRANT 매트릭스(RLS 미사용) 결정·근거
  - [references.md](./architecture/references.md) — 패턴 출처

## 설계 기록 (왜 이 결정을 했는가)

- [이미지 경로(S3 객체 키) 설계 전략](./image-path-strategy.md) — 키 레이아웃·식별자(UUIDv7)·샤딩·캐싱 결정
- [고객용 상품 이미지 보호](./product-image-protection.md) — `/media/*` HMAC 서명 라우트·`sharp` 워터마크·운영에서 닫아야 할 우회 경로
- [관리자 페이지 아키텍처](./admin-architecture.md) — 동일 프로젝트로 시작, `account.is_admin` 인가, 분리 시점 기준
- [계정 연동·병합 설계](./account-linking.md) — deferred 가입(`pending_account`), 전화 인증 축 병합(자동 병합 금지·step-up·감사 기록)
- [장바구니·주문·결제 플로우 설계](./order-checkout-payment.md) — 상태 모델, 재고 원자 차감, 배송비 정책, `lib/payments` 포트/어댑터(mock)

## 학습 노트

- **[데이터베이스 설계 레슨](./lessons/README.md)** — 스키마를 설계하며 마주친 Postgres 결정의 배경(PK 전략, FK 정책, audit 컬럼, TIMESTAMPTZ, slug, 객체 스토리지 패턴, 세션 vs JWT, 롤·GRANT, 트랜잭션 GUC 등)

## 문서 분류

- `deployment.md` · `oauth-setup.md` · `environment-variables.md` — **어떻게 운영**하는가 (절차, 살아있는 문서)
- `architecture/` — **어떻게** 작성하는가 (룰, 구조, 컨벤션)
- `lessons/` — **무엇을** 알아야 하는가 (DB 기술 학습 노트)
- `specs/` · `research/` · 그 외 docs/ 루트 — **왜** 이 결정을 했는가 (의사결정 기록)

> 코드·컬럼의 `r2_key` / `lib/r2/` / `R2_*` 이름은 Cloudflare R2를 쓰던 시기의 것이다. 현재 스토리지는 AWS S3(로컬 MinIO)이며 이름만 남아 있다.
