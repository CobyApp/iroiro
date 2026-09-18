# iroiro 문서

MVP 단계의 기술 결정과 아키텍처를 정리한 문서.

## 아키텍처 (개발 전 필수 참조)

- **[아키텍처 인덱스](./architecture/README.md)** — 디렉터리 구조, 컨벤션, 라우팅, 인증/데이터 레이어. 코드 작성 전 [overview.md](./architecture/overview.md) 먼저.

## 기술 결정 기록 (왜 이 스택인가)

- [MVP 기술 스택](./mvp-stack.md) — 전체 스택 요약과 비용 구조
- [이미지 저장 및 최적화 전략](./image-strategy.md) — R2 선택 이유, 후보 비교
- [이미지 경로(R2 객체 키) 설계 전략](./image-path-strategy.md) — 키 레이아웃·식별자(UUIDv7)·샤딩·캐싱 결정
- [데이터베이스 및 인증 전략](./database-strategy.md) — 초기 Supabase 선택 이유, 후보 비교 (역사 기록 — 현재는 자체 Postgres · `db/schema.sql`)
- [Cloudflare R2 도입 검토](./r2-adoption.md) — 한도, Dashboard 셋업 절차, CORS·API Token·환경 분리 (살아있는 문서)
- [관리자 페이지 아키텍처](./admin-architecture.md) — 동일 프로젝트로 시작, 분리 시점 기준
- [계정 연동·병합 설계](./account-linking.md) — 소셜 로그인 다중 account를 전화 인증 축으로 통합·병합 (자동 병합 금지·step-up 확인·감사 기록)

## 학습 노트

- **[데이터베이스 설계 레슨](./lessons/README.md)** — 마이그레이션을 설계하며 마주친 Postgres·스키마 결정의 배경 (PK 전략, FK 정책, audit 컬럼, TIMESTAMPTZ, slug 전략, 세션 vs JWT, 롤·RLS, 트랜잭션 GUC 등 16개 주제)

## 운영 · 설정

- [환경변수 레퍼런스](./environment-variables.md) — 전체 환경변수 목록·필수 구분·값 출처 (배포 설정 시 참조)

## 문서 분류

- `architecture/` — **어떻게** 작성하는가 (룰, 구조, 컨벤션)
- `lessons/` — **무엇을** 알아야 하는가 (DB 기술 학습 노트)
- 그 외 docs/ 루트 — **왜** 이 결정을 했는가 (의사결정 기록)
