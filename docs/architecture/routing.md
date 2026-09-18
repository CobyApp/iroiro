# 라우팅과 권한 가드

## 라우트 그룹

| 그룹 | URL 영향 | 책임 | 인증 |
|---|---|---|---|
| `(shop)` | 없음 | 소비자 영역 (홈, 상품, 중고, 컬렉션, 커뮤니티, 장바구니, 주문, 마이페이지) | optional — 회원 전용 페이지만 페이지 단위 가드 |
| `(admin)` | 없음 (`/admin/...` 유지) | 관리자 화면 | required + `isBoardManager`(site admin ⊃ 게시판 moderator) |
| `(auth)` | 없음 (`/login`, `/signup`) | 로그인·가입 완료(닉네임) | 레이아웃만 — 상태 분기는 페이지가 담당 |
| `(marketing)` | 없음 | 가이드·약관·개인정보·웰컴 | 없음 |

`(name)` 괄호 그룹은 **URL에 영향을 주지 않으면서 layout만 분리**할 때 쓴다. 각 그룹은 자체 `layout.tsx`로 인증 정책과 셸(헤더/푸터/사이드바)을 분리한다.

그룹 밖의 최상위 라우트:

| 경로 | 역할 |
|---|---|
| `app/api/auth/[provider]/…` | OAuth 시작·콜백 (Node 런타임 — `node:crypto`·Prisma) |
| `app/api/health` | ALB 헬스체크. 공개·DB 미접근·고정 응답 |
| `app/api/cron/close-auctions` | EventBridge 스케줄 호출. `Authorization: Bearer $CRON_SECRET` 필수 |
| `app/media/…/[signature]` | HMAC 서명 검증 후 이미지 변환 응답 ([auth-and-data §서빙](./auth-and-data.md#서빙)) |
| `app/invite/[code]` | 초대 링크 → 리퍼럴 쿠키 심고 리다이렉트 |

## URL 매핑 (예)

| 그룹 | 파일 | URL |
|---|---|---|
| `(shop)` | `app/(shop)/page.tsx` | `/` |
| `(shop)` | `app/(shop)/products/[id]/page.tsx` | `/products/:id` |
| `(shop)` | `app/(shop)/collections/[publicCode]/page.tsx` | `/collections/:publicCode` |
| `(shop)` | `app/(shop)/orders/[orderNo]/page.tsx` | `/orders/:orderNo` |
| `(admin)` | `app/(admin)/admin/page.tsx` | `/admin` |
| `(admin)` | `app/(admin)/admin/products/page.tsx` | `/admin/products` |
| `(auth)` | `app/(auth)/login/page.tsx` | `/login` |
| `(marketing)` | `app/(marketing)/terms/page.tsx` | `/terms` |

외부 노출 식별자는 IDENTITY PK 대신 `publicCode`·`orderNo` 같은 비즈니스 키를 쓴다([data-modeling §기본 키](./data-modeling.md#기본-키--식별자)).

## Layout 가드 흐름

### `(shop)/layout.tsx` — 인증 무관
세션 유무로 redirect하지 않는다. 헤더의 `AccountNav`·`CartButton`·`NotificationBell` 같은 위젯이 각자 `getCurrentAccount()`로 로그인 상태를 판단해 렌더한다(`Suspense` 경계 안).

### `(admin)/layout.tsx` — strict guard (룰 3)
```tsx
// app/(admin)/layout.tsx (발췌)
const account = await getCurrentAccount();
if (!account) redirect("/login");
if (!isBoardManager(account)) redirect("/");
return <AdminShell isSiteAdmin={isAdmin(account)}>{children}</AdminShell>;
```
- 세션 없으면 `/login`으로, 권한 없으면 `/`로 (404 노출 금지 — 정보 누설)
- `isBoardManager`는 `isAdmin`(site admin)을 포함한다. moderator는 커뮤니티 관리 섹션만 보이도록 사이드바에서 필터.
- **Server Action은 layout과 별개로 `requireAdmin()` / `requireBoardManager()`로 재검증**한다 — Server Action은 공개 엔드포인트와 같은 보안 기준.

### `(auth)/layout.tsx` — 레이아웃만
중앙 정렬 셸이다. `/signup`은 페이지가 `pending_account` 쿠키를 검증해 없거나 만료면 `/login?error=signup_expired`로 보낸다.

## Middleware 책임

```ts
// middleware.ts
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
```

### ✅ middleware가 하는 일
- 현재 경로를 `x-pathname` 요청 헤더로 전달 (서버 layout이 경로별 조건부 렌더에 사용)

### ❌ middleware가 하지 않는 일
- 세션 조회·갱신 (→ DAL `getCurrentAccount`)
- 권한 분기·리다이렉트 (→ layout)
- 비즈니스 룰 체크

이유: middleware는 Edge 런타임이라 Prisma·`node:crypto`를 쓸 수 없고, 캐시 동작이 까다롭다. 권위 있는 세션 검증은 Node 계층(RSC layout·Server Action·Route Handler)의 DAL 한 곳에서 한다.

## 페이지에서 세션이 필요할 때

### ✅
```tsx
// app/(shop)/orders/[orderNo]/page.tsx (발췌)
export default async function OrderPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("orders"));
  // ... account.id로 소유권 필터한 조회
}
```
`(shop)`은 optional auth이므로 회원 전용 페이지만 직접 가드한다. 비로그인 안내는 `/login-required?feature=…`(`modules/auth/lib/login-required.ts`)로 통일한다.

### ❌
```tsx
// 페이지마다 관리자 판정
if (!isAdmin(account)) redirect("/");  // ← (admin)/layout.tsx 책임
```

## Next.js 16 주의

- `params`와 `searchParams`는 **`Promise`** 다. `await params`로 풀어 써야 한다.
- Prisma·`node:crypto`를 쓰는 Route Handler는 `export const runtime = "nodejs"`를 명시한다(Edge 불가).
- 요청마다 달라야 하는 layout(세션 읽기)은 `await connection()`으로 프리렌더에서 제외한다 — `(admin)/layout.tsx` 선례.
- App Router 코드 작성 전 `node_modules/next/dist/docs/`의 해당 가이드를 확인할 것 (AGENTS.md 지침).
