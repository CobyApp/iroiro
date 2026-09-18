# 라우팅과 권한 가드

## 라우트 그룹 3분할

| 그룹 | URL 영향 | 책임 | 인증 |
|---|---|---|---|
| `(shop)` | 없음 | 공개 쇼핑 (홈, 상품, 장바구니, 주문) | optional |
| `(admin)` | 없음 (`/admin/...` 유지) | 관리자 화면 | required + isAdmin |
| `(auth)` | 없음 (`/login` 등) | 로그인·회원가입 | unauthenticated only |

`(name)` 괄호 그룹은 **URL에 영향을 주지 않으면서 layout만 분리**할 때 쓴다. 각 그룹은 자체 `layout.tsx`로 인증 정책과 헤더/푸터 레이아웃을 분리한다.

## URL 매핑

| 그룹 | 파일 | URL |
|---|---|---|
| `(shop)` | `app/(shop)/page.tsx` | `/` |
| `(shop)` | `app/(shop)/products/[slug]/page.tsx` | `/products/:slug` |
| `(shop)` | `app/(shop)/cart/page.tsx` | `/cart` |
| `(admin)` | `app/(admin)/admin/page.tsx` | `/admin` |
| `(admin)` | `app/(admin)/admin/products/page.tsx` | `/admin/products` |
| `(auth)` | `app/(auth)/login/page.tsx` | `/login` |

## Layout 가드 흐름

### `(shop)/layout.tsx` — optional auth
세션이 있으면 헤더에 사용자 메뉴 표시. 없어도 통과. **redirect 없음**.

### `(admin)/layout.tsx` — strict guard
```tsx
const supabase = await createServerClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
if (!(await isAdmin(user))) redirect("/");
```
- 세션 없으면 `/login`으로
- admin 아니면 `/`로 (404 노출 금지 — 정보 누설)

### `(auth)/layout.tsx` — reverse guard
이미 로그인한 사용자는 `/`로 리다이렉트.

## Middleware 책임

```ts
// middleware.ts
import { updateSession } from "@/lib/supabase/middleware";
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}
```

### ✅ middleware가 하는 일
- Supabase 세션 쿠키 갱신만

### ❌ middleware가 하지 않는 일
- 권한 분기 (→ layout)
- 리다이렉트 로직 (→ layout)
- 비즈니스 룰 체크

이유: middleware는 Edge에서 실행되며 캐시 동작이 까다롭다. 권한 분기는 RSC layout에서 단일 진실로 처리한다.

## 페이지에서 세션이 필요할 때

### ✅
```tsx
// app/(shop)/orders/[orderId]/page.tsx
export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // ...
}
```
페이지에서 직접 `getUser()` — `(shop)`은 optional auth이므로 멤버 영역만 페이지가 가드.

### ❌
```tsx
// 페이지마다 isAdmin 호출
if (!isAdmin(user)) redirect("/");  // ← (admin)/layout.tsx 책임
```

## Next.js 16 주의

- `params`와 `searchParams`는 **`Promise`** 다 (15에서 변경 → 16 유지). `await params`로 풀어 써야 한다.
- App Router 코드 작성 전 `node_modules/next/dist/docs/`의 해당 가이드를 확인할 것 (AGENTS.md 지침).
