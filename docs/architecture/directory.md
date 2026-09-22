# 디렉터리 구조

## 전체 트리 (2026-09 기준, 대표 항목만)

```
iroiro/                              단일 Next.js 16 앱 — 모노레포 X
├── app/                             라우트 셸만 (얇게)
│   ├── (shop)/                      소비자 영역 — 홈·상품·중고·컬렉션·커뮤니티·주문·마이페이지
│   │   ├── layout.tsx               헤더·푸터·모바일 탭바 (인증 무관)
│   │   ├── page.tsx                 홈
│   │   ├── _components/             (shop) 전용 셸 부품 (탭바·네비·푸터)
│   │   ├── products/[id]/  used/[id]/  collections/[publicCode]/
│   │   ├── posts/[publicCode]/  notices/[publicCode]/  messages/[id]/
│   │   ├── cart/  checkout/[orderNo]/  orders/[orderNo]/  wishlist/
│   │   ├── mypage/ (addresses·bids·edit·favorites·points·settings)
│   │   └── login-required/          비로그인 기능 진입 안내
│   ├── (admin)/                     관리자 영역 (/admin/…)
│   │   ├── layout.tsx               getCurrentAccount + isBoardManager/isAdmin 가드 (룰 3)
│   │   └── admin/                   대시보드·catalog·products·orders·members·posts·reviews·points·settings …
│   ├── (auth)/                      login/  signup/  (중앙 정렬 레이아웃)
│   ├── (marketing)/                 guide/  privacy/  terms/  welcome/
│   ├── api/
│   │   ├── auth/[provider]/route.ts             OAuth 시작 (kakao·naver)
│   │   ├── auth/[provider]/callback/route.ts    OAuth 콜백 → 세션 발급 / pending_account
│   │   ├── health/route.ts                      ALB 헬스체크 (공개, DB 미접근)
│   │   └── cron/close-auctions/route.ts         EventBridge 호출 (Bearer CRON_SECRET)
│   ├── media/                       HMAC 서명 이미지 라우트 (sharp 축소·워터마크)
│   │   ├── product-photos/[photoId]/[variant]/[signature]/route.ts
│   │   ├── product-thumbnails/[productId]/[variant]/[signature]/route.ts
│   │   └── post-photos/[photoId]/[signature]/route.ts
│   ├── invite/[code]/route.ts       초대 링크 → 리퍼럴 쿠키
│   ├── layout.tsx  manifest.ts  not-found.tsx  globals.css
│
├── middleware.ts                    x-pathname 요청 헤더 세팅만
│
├── modules/                         도메인 응집 (components/ · actions.ts · lib/ · types.ts)
│   ├── auth/                        dal.ts(getCurrentAccount) · lib/session·cookies·pending-account·oauth/
│   ├── admin/                       lib/isAdmin.ts · requireAdmin.ts · roles.ts · requireBoardManager.ts · nav.ts(메뉴 데이터)
│   │                                components/AdminShell(관리자·카탈로그 공용 셸) · AdminSidebar · AdminPage · AdminPageHeader
│   ├── products/  used/  cards/  series/  teams/  members/  team-members/  import/
│   ├── cart/  orders/  addresses/  points/  reviews/  auction/  wishlist/  favorites/
│   ├── collection/  posts/ (actions/ 폴더로 승격)  notices/  messages/  notifications/
│   ├── banners/  site-settings/  referral/  dashboard/  marketing/
│   └── ui/                          도메인 무관 디자인 시스템 확장 (+ stories/)
│
├── lib/                             횡단 인프라만
│   ├── db.ts                        Prisma 7 + @prisma/adapter-pg 싱글턴 (app 롤 접속)
│   ├── env.ts                       zod 환경변수 검증
│   ├── r2/                          S3 호환 스토리지 (client·presign·relay·get·ugc)
│   ├── payments/                    결제 게이트웨이 포트 + mock 어댑터
│   ├── action-result.ts             ActionResult / DomainError / runAction
│   ├── prisma-errors.ts  public-code.ts  photo-client.ts  datetime.ts  i18n.ts  utils.ts
│
├── components/                      shadcn 원본(ui/) + 소수의 도메인 무관 래퍼 (PageTransition 등)
├── db/schema.sql                    ★ DB 스키마 단일 진실 (테이블·인덱스·GRANT 전부)
├── prisma/schema.prisma             db:pull 파생물 (camelCase @map 수동 유지)
├── prisma.config.ts
├── scripts/                         db-reset.sh / db-reset.sql · husky·에이전트 hook 스크립트
├── infra/aws/                       setup.sh (프로비저닝) · db-apply.sh (RDS 스키마 적용)
├── .github/workflows/               ci.yml (lint·typecheck·test) · deploy.yml (ECR → ECS)
├── Dockerfile                       .next/standalone 런타임 이미지
├── compose.yml                      로컬 postgres:17 + MinIO
├── tests/                           src 트리 mirror (lib/ modules/ app/ integration/)
├── public/
└── docs/                            architecture/ · specs/ · lessons/ · 결정 기록
```

## 폴더 책임 표

| 폴더 | 책임 | 들어가야 할 것 | 절대 들어가면 안 되는 것 |
|---|---|---|---|
| `app/` | URL → 페이지 진입점, layout, error boundary | `page.tsx`, `layout.tsx`, `not-found.tsx`, `route.ts`(아래 허용 범위만) | 비즈니스 로직, 도메인 컴포넌트 본체 |
| `app/api/` | 외부가 호출하는 엔드포인트 | OAuth 시작·콜백, 헬스체크, 크론, (향후) 결제 webhook | 일반 CRUD (→ Server Actions) |
| `app/media/` | 서명 검증 + 이미지 변환 응답 | HMAC 검증·`fetchR2Object`·sharp 호출을 잇는 얇은 핸들러 | 도메인 쿼리 본체 (→ `modules/<도메인>/lib/*-media*.ts`) |
| `modules/<도메인>/components/` | 도메인 전용 UI | `<ProductCard>`, `<CartView>` | shadcn 원본, 완전 일반 컴포넌트 |
| `modules/<도메인>/actions.ts` | 해당 도메인 Server Actions | `"use server"` 함수들 (`runAction`으로 감싸기) | 다른 도메인 액션 |
| `modules/<도메인>/lib/` | 도메인 전용 쿼리·헬퍼·스키마 | Prisma 쿼리, zod 스키마, 도메인 유틸 | 다른 도메인 import |
| `modules/<도메인>/types.ts` | 해당 도메인 타입 | 도메인 모델, props 타입 | DB 전역 타입 |
| `modules/ui/` | 디자인 시스템 확장 | shadcn 위에 얹는 공용 컴포넌트, Storybook stories | 도메인 컴포넌트 |
| `lib/` | 도메인 무관 인프라 | SDK 래퍼(`r2/`, `payments/`), `db.ts`, `env.ts`, 공용 유틸 | 도메인 명사 폴더 |
| `components/ui/` | shadcn 베이스 컴포넌트 | shadcn CLI가 생성한 원본 (+ `.stories.tsx`) | 직접 작성한 도메인 컴포넌트 |
| `db/` | DB 스키마 정본 | `schema.sql` 하나 | 환경별 비밀번호·`ALTER ROLE … PASSWORD` |
| `infra/`, `.github/` | 프로비저닝·CI/CD | 셸 스크립트, 워크플로 | 시크릿 값 (→ SSM) |

## 명명 규칙

- 폴더: `kebab-case` (예: `team-members/`, `site-settings/`)
- 파일: 컴포넌트는 `PascalCase.tsx`, 그 외는 `kebab-case.ts`
- Server Action 파일: `actions.ts` (단수형 — 단일 진입점 의도). 커지면 `actions/` 폴더 + `index.ts` 재내보내기(`modules/posts/actions/` 선례)
- 가드 함수 파일: `lib/<역할>.ts` (예: `lib/isAdmin.ts`, `lib/requireAdmin.ts`)
- 테스트: `tests/` 아래 src 경로 mirror + `.test.ts(x)`

## 도메인 간 의존 규칙

- `modules/<A>/`는 다른 `modules/<B>/`를 직접 import하지 않는다.
- 공유가 필요하면 `lib/` 또는 `modules/ui/`로 끌어올린다.
- 예외: `modules/admin/`은 모든 도메인을 읽어서 관리할 수 있다 (관리자의 본질). `modules/auth/dal`은 모든 도메인이 import할 수 있다(횡단 신원 경계). 상세는 [conventions.md §도메인 간 의존 규칙](./conventions.md#도메인-간-의존-규칙).
