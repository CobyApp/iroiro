# 아키텍처 문서 인덱스

> **코드 작성 전 반드시 [overview.md](./overview.md)를 먼저 읽을 것.**
> 이 인덱스는 AI/사람이 필요한 문서로 빠르게 이동하기 위한 라우터다.
> 이 표가 문서 순서의 **단일 진실**이다 — 파일명에 번호는 붙이지 않는다 (삽입·삭제 시 리넘버링 비용 회피).

## 한 줄 원칙

**formbricks의 `modules/<도메인>/` 컨벤션 + inbox-zero의 `(admin)` 라우트 그룹 + 자체 DB 세션 인증(카카오·네이버 OAuth).** 그 외 패턴은 차용하지 않는다.

## 빠른 탐색

| 역할 | 문서 | 언제 보는가 | 길이 |
|---|---|---|---|
| 진입점 | [overview.md](./overview.md) | **작업 시작 전 매번** | 1페이지 |
| 레퍼런스 | [directory.md](./directory.md) | 새 파일/폴더 만들 때 | 짧음 |
| 룰 상세 | [conventions.md](./conventions.md) | 룰 위반 의심 / 예시 필요 | 중간 |
| 라우팅 | [routing.md](./routing.md) | 라우트·layout·middleware 작업 | 중간 |
| 데이터 | [auth-and-data.md](./auth-and-data.md) | 세션·Prisma·`app` 롤·스토리지(`lib/r2`) 작업 | 중간 |
| 스키마 | [data-modeling.md](./data-modeling.md) | `db/schema.sql` 테이블·컬럼 설계/변경 | 중간 |
| DB 인가 결정 | [db-authorization-review.md](./db-authorization-review.md) | GRANT vs RLS가 궁금할 때 | 중간 |
| 출처 | [references.md](./references.md) | 패턴 출처가 궁금할 때 | 짧음 |

## 작업 유형별 진입점

| 작업 | 먼저 볼 문서 (순서) |
|---|---|
| 새 도메인 추가 (`modules/<X>/` 신설) | overview → directory → conventions |
| 새 라우트/페이지 추가 | overview → routing |
| Prisma 쿼리·Server Action 작성 | overview → auth-and-data (소유권 필터·`app` 롤) → conventions §룰2 |
| 이미지 업로드·서빙 구현 | overview → auth-and-data §스토리지 |
| DB 스키마 변경 (`db/schema.sql`) | overview → data-modeling → auth-and-data §스키마 변경 절차 |
| `/admin` 신규 화면 | overview → routing (권한 가드) |
| 컨벤션 위반 의심 | conventions |
| GRANT·DB 롤 판단 | **db-authorization-review**(결정·근거) → auth-and-data §DB 인가 |
| 배포·환경변수·인프라 | [../deployment.md](../deployment.md) · [../environment-variables.md](../environment-variables.md) |

## 문서 작성 원칙 (이 폴더 자체의 룰)

- 한 문서는 **하나의 컨텍스트**만 다룬다. 여러 컨텍스트가 필요하면 분할.
- 길어지면 분할 후 인덱스에서 링크.
- 룰을 쓸 때는 **반드시 ✅ 예시와 ❌ 반례를 쌍으로** 둔다 — AI가 이를 토큰 절약 신호로 사용한다.
- 의사결정 배경(왜)은 [/docs](../) 상위의 결정 기록 문서·[/docs/specs](../specs/)에, 룰(어떻게)은 이 폴더에.
