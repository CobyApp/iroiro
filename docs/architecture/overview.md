# 개요와 핵심 룰 4가지

> **이 문서는 모든 코드 작업 전에 반드시 통과해야 하는 1페이지 요약이다.**
> 더 자세한 설명이 필요하면 표의 링크를 따라가라.

## 한 눈에 보는 구조

```
app/         라우트 셸 (얇게 유지)
modules/     도메인 (products, cart, orders, members, admin, auth, ui)
lib/         횡단 인프라 (supabase, r2, env, utils)
components/  shadcn 원본만
```

## 핵심 룰 4가지

### 룰 1 — 도메인 명사면 `modules/`, 횡단 인프라면 `lib/`
> 상세: [conventions §룰1](./conventions.md#룰-1--도메인-vs-횡단)

| ✅ | ❌ |
|---|---|
| `modules/products/` | `lib/products/` |
| `modules/orders/` | `modules/zod/` |
| `lib/supabase/` | `modules/supabase/` |
| `lib/r2/` | `lib/cart/` |

중간지대 금지. 판단 기준: **"다른 프로젝트로 옮길 때 따라가는가"**. 따라가면 `lib/`, 이 도메인에만 있는 거면 `modules/`.

### 룰 2 — Server Actions는 `modules/<도메인>/actions.ts`
> 상세: [conventions §룰2](./conventions.md#룰-2--server-actions-위치)

| ✅ | ❌ |
|---|---|
| `modules/products/actions.ts` | `utils/actions/products.ts` |
| 커지면 `modules/products/actions/` 폴더로 승격 | `app/actions.ts` 같은 전역 |
| webhook/콜백만 `app/api/` | `app/api/products/route.ts` (CRUD용) |

### 룰 3 — 권한 가드는 layout, 함수는 `modules/admin/lib/isAdmin.ts`
> 상세: [routing.md](./routing.md)

| ✅ | ❌ |
|---|---|
| `(admin)/layout.tsx`에서 `getUser() + isAdmin()` 1회 | 페이지마다 가드 호출 |
| 미인증 시 `redirect("/login")` | 빈 페이지 반환 |
| `isAdmin`은 `modules/admin/lib/isAdmin.ts` 단일 진실 | 여러 곳에 중복 정의 |

### 룰 4 — 인증은 Supabase 공식 가이드만
> 상세: [auth-and-data.md](./auth-and-data.md)

| ✅ | ❌ |
|---|---|
| `middleware.ts`는 `updateSession`만 | middleware에서 권한 분기 |
| `lib/supabase/{server,client,middleware}.ts` 3분리 | 한 파일에 합치기 |
| 권한·리다이렉트는 layout | NextAuth, Better-auth 도입 |

## 결정 트리 — "어디에 둘지" 30초 판단

```
이 코드가 도메인 명사(상품/주문/회원/관리)와 묶여 있는가?
├── YES → modules/<도메인>/
│         ├── UI?       → modules/<도메인>/components/
│         ├── 액션?     → modules/<도메인>/actions.ts
│         ├── 쿼리·헬퍼? → modules/<도메인>/lib/
│         └── 타입?     → modules/<도메인>/types.ts
└── NO  → lib/
          ├── 외부 SDK 래퍼?  → lib/<sdk>/  (예: supabase, r2)
          ├── 환경변수?       → lib/env.ts
          └── 그 외 유틸?     → lib/utils.ts
```

## 작업 시작 전 자가 점검

- [ ] 새 폴더가 룰 1을 어기지 않는가?
- [ ] Server Action을 `app/api/`에 두려 하지 않는가? (webhook이 아니라면)
- [ ] 권한 체크를 페이지가 아니라 layout에 두는가?
- [ ] Supabase 외 인증 라이브러리를 추가하려 하지 않는가?
