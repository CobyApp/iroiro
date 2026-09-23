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
modules/orders/lib/amounts.ts            주문 도메인 계산
lib/db.ts                                Prisma 클라이언트 (인프라)
lib/r2/presign.ts                        S3 호환 스토리지 SDK 래퍼
lib/payments/                            결제 게이트웨이 포트 + mock 어댑터
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
modules/posts/actions/
├── post.ts
├── comment.ts
├── moderation.ts
└── index.ts                       ← 재내보내기
```
**승격 기준**: 한 파일이 ~300줄을 넘거나 액션 7개 이상. (`modules/posts/actions/` 선례)

### ✅ 예시
```ts
// modules/products/actions.ts
"use server";
import { db } from "@/lib/db";
import { parseActionInput, runAction, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { productSchema } from "./lib/schema";

export async function createProduct(input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const admin = await requireAdmin();                 // 권한 재검증 (layout과 별개)
    const data = parseActionInput(productSchema, input); // zod 검증
    const product = await db.product.create({ data: { ...data, createdBy: admin.id } });
    return { id: Number(product.id) };
  });
}
```
- 예상 오류(중복·재고·상태 충돌)는 `DomainError`로 throw → `runAction`이 `{ ok: false, message }`로 변환한다. 프로덕션에서 Server Action이 throw한 Error의 message는 클라이언트에 전달되지 않는다([references](./references.md) "서버 액션 오류 계약").

### ❌ 반례
```
utils/actions/products.ts          ← 도메인 응집을 깸 (inbox-zero 패턴 거부)
app/actions.ts                     ← 전역 액션 폴더 금지
app/api/products/route.ts          ← 일반 CRUD를 Route Handler로 (Server Actions 우선)
```

### `app/api/`·`route.ts`는 언제 쓰는가
- ✅ 외부가 호출하는 것: OAuth 시작·콜백(`app/api/auth/`), 헬스체크(`/api/health`), 스케줄러 크론(`/api/cron/*`), (향후) 결제 webhook
- ✅ 바이너리 응답: `app/media/*` 서명 이미지 라우트
- ❌ 내부 폼/UI에서 호출하는 mutation (→ Server Actions)

---

## 룰 3 — 권한 가드 위치

### ✅ 정공법
```tsx
// app/(admin)/layout.tsx (발췌)
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { isBoardManager } from "@/modules/admin/lib/roles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (!isBoardManager(account)) redirect("/");
  return (
  <AdminShell scope="admin" isSiteAdmin={isAdmin(account)} isBoardManager>
    {children}
  </AdminShell>
);
}
```

### ❌ 반례
```tsx
// app/(admin)/admin/products/page.tsx — 페이지마다 가드 (중복)
const account = await getCurrentAccount();
if (!account || !isAdmin(account)) return notFound();
```

### `isAdmin` 단일 진실
```ts
// modules/admin/lib/isAdmin.ts
export function isAdmin(account: Account | null): boolean {
  return account?.isAdmin === true;   // account.is_admin 컬럼만이 근거
}
```
다른 곳에서 admin 여부를 판단하지 말 것. 모두 이 함수를 통한다. 게시판 moderator까지 포함하는 상위 판정은 `modules/admin/lib/roles.ts`의 `isBoardManager`(내부에서 `isAdmin`을 호출).

Server Action은 layout을 신뢰하지 않고 진입부에서 `requireAdmin()`(`modules/admin/lib/requireAdmin.ts`) 또는 `requireBoardManager()`로 다시 검증한다.

---

## 룰 4 — 인증 스택

### ✅ 채택
- **자체 구현** 카카오 OAuth (`app/api/auth/[provider]/…`, `modules/auth/lib/oauth/`)
- **DB 세션** `account_session` — 쿠키에는 무작위 토큰, DB에는 해시 (`modules/auth/lib/session.ts`)
- 세션 검증은 DAL `getCurrentAccount()` 한 곳 (`modules/auth/dal.ts`)
- `middleware.ts`는 `x-pathname` 헤더 전달만
- 권한·리다이렉트는 layout에서

### ❌ 거부
- NextAuth / Better-auth — 자체 세션과 중복, 세션 모델을 두 겹으로 만든다
- 외부 인증 SaaS 클라이언트 SDK — 이력: 초기 Supabase Auth는 제거됐다
- middleware에서 세션 조회·권한 분기 — Edge 런타임에서 Prisma 불가, 캐시 예측 불가
- JWT를 쿠키에 담아 무상태 인증 — 즉시 폐기 불가(레슨 13)

### 파일 역할
| 파일 | 사용처 |
|---|---|
| `modules/auth/dal.ts` | RSC, Server Actions, Route Handler에서 현재 계정 조회 |
| `modules/auth/lib/session.ts` · `cookies.ts` | 세션 생성·검증·폐기, 쿠키 옵션 |
| `modules/auth/lib/pending-account.ts` | OAuth 후 닉네임 입력 전 가입 대기 |
| `app/api/auth/[provider]/route.ts` · `callback/route.ts` | OAuth 왕복 (Route Handler, Node 런타임) |

상세 흐름은 [auth-and-data.md](./auth-and-data.md).

---

## 도메인 간 의존 규칙

### ✅ 허용
```
modules/cart/components/CartView.tsx
  └── imports components/ui/button (shadcn) · modules/ui (디자인 시스템)
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
- 트랜잭션 원자성이 필요한 교차 도메인 쓰기(예: 주문 생성이 재고 차감·장바구니 비우기를 한 트랜잭션에서)는 페이지 합성으로 풀 수 없다. 이때 `actions.ts`가 `lib/db`(공유 인프라)로 다른 도메인의 **테이블**을 직접 다루는 것은 허용된다 — 다른 도메인의 `lib/`를 import하는 것과 구분된다(전자는 공유 인프라, 후자는 도메인 결합).
