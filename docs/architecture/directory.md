# 디렉터리 구조

## 전체 트리

```
oshikore-web/                      (단일 앱 — 모노레포 X)
├── app/                           라우트 셸만 (얇게)
│   ├── (shop)/                    공개 쇼핑 영역
│   │   ├── layout.tsx
│   │   ├── page.tsx               홈
│   │   ├── products/[slug]/page.tsx
│   │   ├── cart/page.tsx
│   │   └── orders/[orderId]/page.tsx
│   ├── (admin)/                   관리자 영역
│   │   ├── layout.tsx             getUser + isAdmin 가드
│   │   └── admin/
│   │       ├── page.tsx           대시보드
│   │       ├── products/page.tsx
│   │       ├── orders/page.tsx
│   │       └── members/page.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── api/                       webhook/콜백만
│   │   └── webhooks/payments/route.ts
│   ├── layout.tsx
│   ├── error.tsx
│   ├── not-found.tsx
│   └── global-error.tsx
│
├── middleware.ts                  Supabase updateSession만
│
├── modules/                       도메인 응집
│   ├── products/
│   │   ├── components/
│   │   ├── actions.ts
│   │   ├── lib/
│   │   └── types.ts
│   ├── cart/
│   ├── orders/
│   ├── members/
│   ├── admin/
│   │   ├── components/            AdminUserControls 등 평면 배치
│   │   ├── actions.ts
│   │   └── lib/isAdmin.ts
│   ├── auth/
│   │   ├── components/
│   │   ├── actions.ts
│   │   └── lib/
│   └── ui/                        도메인 무관 디자인 시스템 확장
│
├── lib/                           횡단 관심사만
│   ├── supabase/
│   │   ├── server.ts              createServerClient
│   │   ├── client.ts              createBrowserClient
│   │   └── middleware.ts          updateSession 헬퍼
│   ├── r2/
│   │   ├── client.ts              S3 호환 SDK
│   │   └── presign.ts
│   ├── env.ts                     t3-env 또는 zod 검증
│   ├── utils.ts                   cn 등
│   └── validation.ts              zod 공용
│
├── components/ui/                 shadcn 원본만 (Button, Dialog 등)
├── hooks/                         공용 훅
├── types/                         DB·전역 타입
├── public/
└── docs/                          (문서)
```

## 폴더 책임 표

| 폴더 | 책임 | 들어가야 할 것 | 절대 들어가면 안 되는 것 |
|---|---|---|---|
| `app/` | URL → 페이지 진입점, layout, error boundary | `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts` (webhook만) | 비즈니스 로직, 도메인 컴포넌트 본체 |
| `app/api/` | 외부 webhook·콜백 | 결제 webhook, OAuth callback | 일반 CRUD (→ Server Actions) |
| `modules/<도메인>/components/` | 도메인 전용 UI | `<ProductCard>`, `<CartSummary>` | shadcn 원본, 완전 일반 컴포넌트 |
| `modules/<도메인>/actions.ts` | 해당 도메인 Server Actions | `'use server'` 함수들 | 다른 도메인 액션 |
| `modules/<도메인>/lib/` | 도메인 전용 쿼리·헬퍼·스키마 | DB 쿼리, zod 스키마, 도메인 유틸 | 다른 도메인 import |
| `modules/<도메인>/types.ts` | 해당 도메인 타입 | 도메인 모델, props 타입 | DB 전역 타입 |
| `modules/ui/` | 디자인 시스템 확장 | shadcn 위에 얹는 공용 컴포넌트 | 도메인 컴포넌트 |
| `lib/` | 도메인 무관 인프라 | SDK 래퍼, env, 공용 유틸 | 도메인 명사 폴더 |
| `components/ui/` | shadcn 베이스 컴포넌트 | shadcn CLI가 생성한 원본 | 직접 작성한 도메인 컴포넌트 |

## 명명 규칙

- 폴더: `kebab-case` (예: `email-account/`)
- 파일: 컴포넌트는 `PascalCase.tsx`, 그 외는 `kebab-case.ts`
- Server Action 파일: `actions.ts` (단수형 — 단일 진입점 의도)
- 가드 함수 파일: `lib/<역할>.ts` (예: `lib/isAdmin.ts`)

## 도메인 간 의존 규칙

- `modules/<A>/`는 다른 `modules/<B>/`를 직접 import하지 않는다.
- 공유가 필요하면 `lib/` 또는 `modules/ui/`로 끌어올린다.
- 예외: `modules/admin/`은 모든 도메인을 읽어서 관리할 수 있다 (관리자의 본질).
