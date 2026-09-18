# 컨벤션 상세

룰의 근거와 예시·반례를 모은 문서. 1페이지 요약은 [overview.md](./overview.md).

## 룰 1 — 도메인 vs 횡단

### 판단 기준
**"이 코드를 다른 커머스 프로젝트로 옮길 때 따라가는가?"**
- 따라간다 → `lib/`
- 이 프로젝트에만 있다 → `modules/<도메인>/`

### ✅ 예시
```
modules/products/lib/queries.ts          상품 쿼리
modules/orders/lib/calculate-shipping.ts 주문 도메인 로직
lib/supabase/server.ts                   외부 SDK 래퍼
lib/r2/presign.ts                        외부 SDK 래퍼
lib/utils.ts                             cn() 등 도메인 무관 유틸
```

### ❌ 반례
```
lib/products/queries.ts          ← 도메인이 lib에 침범 (반패턴)
modules/zod/schemas.ts           ← 횡단 라이브러리가 modules에 침범
lib/cart-helpers.ts              ← 도메인 헬퍼가 lib 평면에 노출
```

### 왜 이렇게 하는가
formbricks 코드를 직접 확인한 결과, `modules/<도메인>/`에 components/lib/actions/types를 응집시키면 도메인이 늘어도 충돌이 없다. 반대로 formbricks 자체에 잔존하는 `apps/web/lib/<도메인>/` 흔적은 충돌 원인 — 우리는 이를 반패턴으로 규정한다.

---

## 룰 2 — Server Actions 위치

### 기본형
```
modules/products/actions.ts        단일 파일로 시작
```

### 커지면 폴더로 승격
```
modules/products/actions/
├── create.ts
├── update.ts
└── delete.ts
modules/products/actions/index.ts  ← 재내보내기
```
**승격 기준**: 한 파일이 ~300줄을 넘거나 액션 7개 이상.

### ✅ 예시
```ts
// modules/products/actions.ts
"use server";
import { createServerClient } from "@/lib/supabase/server";
import { productSchema } from "./lib/schema";

export async function createProduct(input: unknown) {
  const data = productSchema.parse(input);
  const supabase = await createServerClient();
  // ...
}
```

### ❌ 반례
```
utils/actions/products.ts          ← 도메인 응집을 깸 (inbox-zero 패턴 거부)
app/actions.ts                     ← 전역 액션 폴더 금지
app/api/products/route.ts          ← 일반 CRUD를 Route Handler로 (Server Actions 우선)
```

### `app/api/`는 언제 쓰는가
- ✅ 외부 webhook (결제, OAuth callback)
- ✅ 외부에서 호출하는 공개 API
- ❌ 내부 폼/UI에서 호출하는 mutation (→ Server Actions)

---

## 룰 3 — 권한 가드 위치

### ✅ 정공법
```tsx
// app/(admin)/layout.tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/modules/admin/lib/isAdmin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isAdmin(user))) redirect("/");
  return <>{children}</>;
}
```

### ❌ 반례
```tsx
// app/(admin)/admin/products/page.tsx — 페이지마다 가드 (중복)
const { user } = await supabase.auth.getUser();
if (!user || !isAdmin(user)) return notFound();
```

### `isAdmin` 단일 진실
```ts
// modules/admin/lib/isAdmin.ts
export async function isAdmin(user: User): Promise<boolean> {
  // RLS 정책 또는 별도 admin 테이블 조회
}
```
다른 곳에서 admin 여부를 판단하지 말 것. 모두 이 함수를 통한다.

---

## 룰 4 — 인증 스택

### ✅ 채택
- `@supabase/ssr` 표준
- `middleware.ts`에서 세션 갱신만 (`updateSession`)
- 권한·리다이렉트는 layout에서

### ❌ 거부
- NextAuth — Supabase와 중복
- Better-auth — Supabase와 중복
- middleware에서 권한 분기 — 캐시·엣지 환경에서 예측 불가

### 파일 분리
| 파일 | 사용처 |
|---|---|
| `lib/supabase/server.ts` | RSC, Server Actions, Route Handler |
| `lib/supabase/client.ts` | Client Component (`"use client"`) |
| `lib/supabase/middleware.ts` | `middleware.ts`에서만 |

3파일 분리는 [Supabase 공식 SSR 가이드](https://supabase.com/docs/guides/auth/server-side/nextjs)의 표준이다. 합치지 말 것.

---

## 도메인 간 의존 규칙

### ✅ 허용
```
modules/cart/components/CartSummary.tsx
  └── imports modules/ui/Button (디자인 시스템)
  └── imports lib/utils (cn)
```

### ❌ 금지
```
modules/cart/lib/queries.ts
  └── imports modules/products/lib/...   ← 도메인 간 직접 의존
```

### 공유가 필요하면
1. 진짜 횡단인가? → `lib/`로 끌어올림
2. UI인가? → `modules/ui/`로 끌어올림
3. 도메인 합성인가? → 호출 측(보통 page.tsx)에서 두 도메인을 모두 호출하고 결과만 조합

### 예외
- `modules/admin/`은 모든 도메인을 읽을 수 있다. 관리자의 본질이 "도메인 횡단 조회"이기 때문.
- `modules/auth/dal`(`getCurrentAccount`·`getSession`)은 **모든 도메인이 import 가능**하다. "현재 로그인한 사용자가 누구인가"는 도메인이 아니라 횡단 신원 경계이고, admin의 횡단 조회와 같은 성격이다. 도메인 액션이 소유권을 확인하려면 이 프리미티브가 필요하다(예: `modules/cart`·`modules/orders`의 `getCurrentAccount()` 가드).
- 트랜잭션 원자성이 필요한 교차 도메인 쓰기(예: 주문 생성이 재고 차감·장바구니 비우기를 한 트랜잭션에서)는 페이지 합성으로 풀 수 없다. 이때 `actions.ts`가 `lib/db`(공유 인프라)로 다른 도메인의 **테이블**을 직접 다루는 것은 허용된다 — 다른 도메인의 `lib/`를 import하는 것과 구분된다(전자는 공유 인프라, 후자는 도메인 결합). mock 경로에서 다른 도메인의 `lib/mock` store를 `actions.ts`가 참조하는 것도 같은 이유로 허용(`modules/teams/actions.ts`의 삭제 가드 선례).
