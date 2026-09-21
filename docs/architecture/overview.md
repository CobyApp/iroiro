# 개요와 핵심 룰 4가지

> **이 문서는 모든 코드 작업 전에 반드시 통과해야 하는 1페이지 요약이다.**
> 더 자세한 설명이 필요하면 표의 링크를 따라가라.

## 한 눈에 보는 구조

```
app/           라우트 셸 (얇게 유지) — (shop) (admin) (auth) (marketing) · api/ · media/
modules/       도메인 (products, orders, posts, collection, auth, admin, ui …)
lib/           횡단 인프라 (db, env, r2, payments, action-result, utils)
components/    shadcn 원본(ui/) + 소수의 도메인 무관 래퍼
db/schema.sql  DB 스키마 단일 진실 (Prisma schema는 db:pull 파생물)
```

스택: Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 + shadcn/ui · Prisma 7 · PostgreSQL 17 · Vitest. 배포는 AWS ECS(서울) — [../deployment.md](../deployment.md).

## 핵심 룰 4가지

### 룰 1 — 도메인 명사면 `modules/`, 횡단 인프라면 `lib/`
> 상세: [conventions §룰1](./conventions.md#룰-1--도메인-vs-횡단)

| ✅ | ❌ |
|---|---|
| `modules/products/` | `lib/products/` |
| `modules/orders/` | `modules/zod/` |
| `lib/db.ts` | `modules/prisma/` |
| `lib/r2/` | `lib/cart/` |

중간지대 금지. 판단 기준: **"다른 프로젝트로 옮길 때 따라가는가"**. 따라가면 `lib/`, 이 도메인에만 있는 거면 `modules/`.

### 룰 2 — Server Actions는 `modules/<도메인>/actions.ts`
> 상세: [conventions §룰2](./conventions.md#룰-2--server-actions-위치)

| ✅ | ❌ |
|---|---|
| `modules/products/actions.ts` | `utils/actions/products.ts` |
| 커지면 `modules/products/actions/` 폴더로 승격 | `app/actions.ts` 같은 전역 |
| OAuth 콜백·헬스체크·크론·webhook만 `app/api/` | `app/api/products/route.ts` (CRUD용) |

### 룰 3 — 권한 가드는 layout, 함수는 `modules/admin/lib/isAdmin.ts`
> 상세: [routing.md](./routing.md)

| ✅ | ❌ |
|---|---|
| `(admin)/layout.tsx`에서 `getCurrentAccount() + isBoardManager()/isAdmin()` 1회 | 페이지마다 가드 호출 |
| 미인증 시 `redirect("/login")`, 권한 없음은 `redirect("/")` | 빈 페이지·404 반환 |
| `isAdmin`은 `modules/admin/lib/isAdmin.ts` 단일 진실 (`account.is_admin`) | 여러 곳에 중복 정의 |
| Server Action은 `requireAdmin()`으로 재검증 | layout 가드만 신뢰 |

### 룰 4 — 인증은 자체 세션 + 카카오·네이버 OAuth만
> 상세: [auth-and-data.md](./auth-and-data.md)

| ✅ | ❌ |
|---|---|
| `middleware.ts`는 `x-pathname` 헤더 전달만 | middleware에서 세션 조회·권한 분기 |
| 세션은 `account_session` 테이블 + `modules/auth` (DAL `getCurrentAccount`) | 외부 인증 SaaS 클라이언트 |
| 권한·리다이렉트는 layout | NextAuth, Better-auth 도입 |

## 데이터 한 줄 규칙

- DB는 둘: 커머스 DB는 `lib/db.ts`의 `db`, **토레카 마스터(team·member·series·series_kind·card)는 dev·prd가 공유하는 카탈로그 DB** `lib/catalog-db.ts`의 `catalogDb`. 접속 롤은 **비특권 `app` / `catalog_app`** — GRANT 매트릭스가 DB 방어선이고 **RLS는 쓰지 않는다**([db-authorization-review](./db-authorization-review.md)). 두 DB 사이 조인·FK 없음(id 값 참조 + 앱에서 합침).
- 스키마 변경은 `db/schema.sql`(커머스) / `db/catalog-schema.sql`(카탈로그) 끝에 `-- [timestamp_name]` 섹션 추가 → `npm run db:reset` → `npm run db:pull && npm run db:generate`. 새 테이블엔 GRANT를 함께 쓴다. dev/prd 적용은 배포 시 `scripts/db-migrate.mjs`(원오프 ECS 태스크)가 자동으로 한다.
- 이미지는 두 벌: 카드 앞면·상품 사진은 업로드 시 clean(원본, 비공개)·wm(워터마크, 공개)을 함께 저장한다. 고객 화면 = wm, 카탈로그 관리·소유자 컬렉션·관리자 다운로드 = clean.
- 소유권(내 주문·내 글)은 쿼리의 `WHERE account_id = 세션` — 앱 DAL 책임.

## 결정 트리 — "어디에 둘지" 30초 판단

```
이 코드가 도메인 명사(상품/주문/회원/관리)와 묶여 있는가?
├── YES → modules/<도메인>/
│         ├── UI?       → modules/<도메인>/components/
│         ├── 액션?     → modules/<도메인>/actions.ts
│         ├── 쿼리·헬퍼? → modules/<도메인>/lib/
│         └── 타입?     → modules/<도메인>/types.ts
└── NO  → lib/
          ├── 외부 SDK 래퍼?  → lib/<sdk>/  (예: r2, payments)
          ├── 환경변수?       → lib/env.ts
          └── 그 외 유틸?     → lib/utils.ts
```

## 작업 시작 전 자가 점검

- [ ] 새 폴더가 룰 1을 어기지 않는가?
- [ ] Server Action을 `app/api/`에 두려 하지 않는가? (외부 호출 엔드포인트가 아니라면)
- [ ] 권한 체크를 페이지가 아니라 layout에 두고, 액션에서 `requireAdmin()`으로 재검증하는가?
- [ ] 외부 인증 라이브러리(NextAuth 등)를 추가하려 하지 않는가?
- [ ] 스키마를 바꿨다면 `db/schema.sql`을 고쳤고 GRANT를 넣었는가? (`prisma/schema.prisma`만 고치지 않았는가)
