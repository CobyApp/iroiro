# 관리자 페이지 아키텍처

## 결정

**MVP는 사용자 페이지와 동일 프로젝트에서 시작하고, 임계점에 도달하면 분리한다.**

## 같은 프로젝트로 시작하는 이유

- 코드 공유: 타입(`Product`, `Order`), Prisma 클라이언트(`lib/db.ts`), 스토리지 유틸(`lib/r2/`) 재사용
- 배포 1회: ECS 서비스 1개(환경당), 환경변수 1세트
- 인증 통합: 같은 DB 세션(`account_session`)을 쓰고 `account.is_admin`으로만 구분
- 분리 시 인증·배포·CI를 두 번 세팅해야 하므로 MVP 속도가 느려짐

## 디렉토리 구조

```
app/
├── (shop)/              # 사용자용 라우트 그룹
│   ├── page.tsx
│   ├── products/
│   └── cart/
├── (admin)/             # 관리자 라우트 그룹
│   └── admin/
│       ├── layout.tsx   # 권한 체크 레이아웃 (account.is_admin)
│       ├── products/
│       └── orders/
├── api/
modules/<도메인>/         # 비즈니스 로직 (양쪽 공유)
lib/                     # db · r2 · payments 등 인프라 유틸 (양쪽 공유)
```

**원칙**: 비즈니스 로직은 `modules/`·`lib/`에 두고 `(shop)`·`(admin)`은 UI만 담당.
나중에 분리할 때 `modules/`·`lib/`를 패키지로 떼어내면 마이그레이션 비용이 작다.

## 보안 — 1일차부터 필수

분리는 미뤄도 되지만 권한 격리는 처음부터 적용한다.

### 1. DB 방어선 — 비특권 `app` 롤 + GRANT 매트릭스
앱은 소유자가 아닌 `app` 롤로 접속하고, 테이블별 권한은 `db/schema.sql`의 GRANT로 명시한다(TRUNCATE 미부여 등). RLS는 쓰지 않는다 — 근거와 검증 항목은 [architecture/db-authorization-review.md](./architecture/db-authorization-review.md).
프론트엔드 권한 체크가 우회되어도 DB가 마지막 방어선이 된다.

### 2. 레이아웃 권한 체크
`/admin` 접근 통제는 `app/(admin)/layout.tsx`가 단독으로 담당한다 — DB 세션으로 현재 계정을 읽어(`modules/auth/dal.ts`) 미로그인은 `/login`, 권한이 없으면 `/`로 redirect. 판정의 단일 진실은 `modules/admin/lib/isAdmin.ts`(`account.is_admin` 컬럼; 부여는 `UPDATE account SET is_admin = TRUE` 수동 운영)이고, 게시판 moderator는 커뮤니티 관리 섹션만 본다(`isBoardManager`). 쓰기 경로(Server Action)는 layout과 별개로 `requireAdmin()` / `requireBoardManager()`를 다시 호출한다.
`middleware.ts`는 `x-pathname` 헤더만 심고 인가에는 관여하지 않는다(라우팅 룰은 [architecture/routing.md](./architecture/routing.md)).

> 이력: 초기 설계는 Supabase RLS + 미들웨어 `user_metadata.role` 체크였다. 자체 인증(DB 세션)·app 롤 GRANT로 전환하면서 위 형태가 됐다.

## 분리 시점 신호

다음 중 2개 이상에 해당하면 분리를 검토한다.

- 관리자 페이지 번들 크기가 사용자 페이지 LCP에 영향
- 관리자 전용 무거운 라이브러리 도입 (차트, 리치 에디터 등)
- 관리자 배포 주기를 사용자와 다르게 가져가야 할 때
- 관리자 트래픽이 사용자 서비스에 영향을 줄 때

## 분리 시 마이그레이션 경로

- Turborepo 기반 모노레포로 전환
- `modules/`·`lib/`를 `packages/core`로 추출
- `apps/shop`, `apps/admin`으로 앱 분리
- ECS 서비스 2개로 분리 배포(같은 클러스터·ALB 공유, host 규칙으로 라우팅)
