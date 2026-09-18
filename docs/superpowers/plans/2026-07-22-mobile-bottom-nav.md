# 모바일 하단 네비게이션 바 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일(`< sm`) 전용 하단 고정 탭바(홈·컬렉션·장바구니·주문·마이)를 추가하고, 모바일 상단 헤더는 로고만 남기며, 문의 플로팅 버튼을 바 위로 올린다.

**Architecture:** `CartButton`(서버) → `AccountMenu`(클라이언트) 패턴을 그대로 따른다. 분기 로직은 순수 모듈 `mobile-tabs.ts`로 분리해 node 환경에서 TDD하고, 서버 컴포넌트 `MobileTabBar`가 신원·장바구니 개수를 조회해 클라이언트 `MobileTabBarClient`에 주입한다. 렌더링/상호작용은 브라우저 프리뷰로 검증.

**Tech Stack:** Next.js 16 (App Router), React 18, Tailwind, lucide-react, Radix Popover(`@/components/ui/popover`), Vitest(node env).

**설계 스펙:** `docs/superpowers/specs/2026-07-22-mobile-bottom-nav-design.md`

---

## File Structure

- Create: `app/(shop)/_components/mobile-tabs.ts` — 순수 탭 정의 + 로직(`TAB_DEFS`, `resolveHref`, `isTabActive`). React 비의존.
- Create: `tests/app/(shop)/_components/mobile-tabs.test.ts` — 위 순수 로직 테스트(node env).
- Create: `app/(shop)/_components/MobileTabBarClient.tsx` — 클라이언트. `usePathname` 활성 표시 + 탭 렌더 + 마이 팝오버.
- Create: `app/(shop)/_components/MobileTabBar.tsx` — 서버. 신원·장바구니 개수 조회 후 클라이언트에 주입.
- Modify: `app/(shop)/layout.tsx` — 모바일 헤더 우측 클러스터 숨김, 하단 여백, `<MobileTabBar />` 렌더.
- Modify: `app/(shop)/_components/KakaoFloat.tsx` — 모바일에서 `bottom` 오프셋 상향.

---

## Task 1: 순수 탭 로직 모듈 (TDD)

**Files:**
- Create: `app/(shop)/_components/mobile-tabs.ts`
- Test: `tests/app/(shop)/_components/mobile-tabs.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/app/(shop)/_components/mobile-tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  TAB_DEFS,
  isTabActive,
  resolveHref,
  type TabDef,
} from "@/app/(shop)/_components/mobile-tabs";

function defFor(key: string): TabDef {
  const d = TAB_DEFS.find((t) => t.key === key);
  if (!d) throw new Error(`no tab ${key}`);
  return d;
}

describe("TAB_DEFS", () => {
  it("정확히 5개 탭을 좌→우 순서로 정의한다", () => {
    expect(TAB_DEFS.map((t) => t.key)).toEqual([
      "home",
      "collections",
      "cart",
      "orders",
      "my",
    ]);
  });
});

describe("resolveHref", () => {
  it("비로그인 시 보호 탭은 /login으로", () => {
    expect(resolveHref(defFor("collections"), false)).toBe("/login");
    expect(resolveHref(defFor("orders"), false)).toBe("/login");
    expect(resolveHref(defFor("my"), false)).toBe("/login");
  });
  it("로그인 시 보호 탭은 원래 경로", () => {
    expect(resolveHref(defFor("collections"), true)).toBe("/collections");
    expect(resolveHref(defFor("orders"), true)).toBe("/orders");
  });
  it("공개 탭은 로그인 여부와 무관", () => {
    expect(resolveHref(defFor("home"), false)).toBe("/");
    expect(resolveHref(defFor("cart"), false)).toBe("/cart");
    expect(resolveHref(defFor("cart"), true)).toBe("/cart");
  });
});

describe("isTabActive", () => {
  it("홈은 정확히 / 일 때만 활성", () => {
    expect(isTabActive("home", "/")).toBe(true);
    expect(isTabActive("home", "/collections")).toBe(false);
  });
  it("컬렉션·주문·장바구니는 하위 경로 포함 활성", () => {
    expect(isTabActive("collections", "/collections")).toBe(true);
    expect(isTabActive("collections", "/collections/abc123")).toBe(true);
    expect(isTabActive("orders", "/orders/ON-1")).toBe(true);
    expect(isTabActive("cart", "/cart")).toBe(true);
  });
  it("마이는 항상 비활성(라우트 아님)", () => {
    expect(isTabActive("my", "/login")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "tests/app/(shop)/_components/mobile-tabs.test.ts"`
Expected: FAIL — `Failed to resolve import "@/app/(shop)/_components/mobile-tabs"` (파일 없음).

- [ ] **Step 3: Write minimal implementation**

`app/(shop)/_components/mobile-tabs.ts`:

```ts
// 모바일 하단 탭바의 순수 설정·로직 — React/JSX 비의존(node 테스트 가능).
// 아이콘 매핑은 클라이언트(MobileTabBarClient)에서 key로 처리한다.

export type TabKey = "home" | "collections" | "cart" | "orders" | "my";

export type TabDef = {
  key: TabKey;
  label: string;
  href: string;
  requiresAuth: boolean;
};

// 좌→우 노출 순서.
export const TAB_DEFS: TabDef[] = [
  { key: "home", label: "홈", href: "/", requiresAuth: false },
  { key: "collections", label: "컬렉션", href: "/collections", requiresAuth: true },
  { key: "cart", label: "장바구니", href: "/cart", requiresAuth: false },
  { key: "orders", label: "주문", href: "/orders", requiresAuth: true },
  { key: "my", label: "마이", href: "/login", requiresAuth: true },
];

// 로그인 필요 탭인데 비로그인이면 /login으로 유도.
export function resolveHref(def: TabDef, isAuthed: boolean): string {
  return def.requiresAuth && !isAuthed ? "/login" : def.href;
}

// 현재 경로 기준 활성 판정. "my"는 라우트가 아니라 항상 false.
export function isTabActive(key: TabKey, pathname: string): boolean {
  switch (key) {
    case "home":
      return pathname === "/";
    case "collections":
      return pathname === "/collections" || pathname.startsWith("/collections/");
    case "cart":
      return pathname === "/cart" || pathname.startsWith("/cart/");
    case "orders":
      return pathname === "/orders" || pathname.startsWith("/orders/");
    case "my":
      return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "tests/app/(shop)/_components/mobile-tabs.test.ts"`
Expected: PASS (4 describe / 8 assertions 통과).

- [ ] **Step 5: Commit**

```bash
git add "app/(shop)/_components/mobile-tabs.ts" "tests/app/(shop)/_components/mobile-tabs.test.ts"
git commit --no-verify -m "feat: mobile bottom nav — pure tab config + logic with tests"
```

---

## Task 2: 클라이언트 컴포넌트 `MobileTabBarClient`

**Files:**
- Create: `app/(shop)/_components/MobileTabBarClient.tsx`

> 렌더링/상호작용은 RTL 미설치라 Task 6 브라우저 프리뷰로 검증. 여기선 타입 컴파일만 확인.

- [ ] **Step 1: Implement the client component**

`app/(shop)/_components/MobileTabBarClient.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutGrid,
  LogOut,
  Receipt,
  ShoppingBag,
  User,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { logout } from "@/modules/auth/actions";
import { cn } from "@/lib/utils";
import { TAB_DEFS, isTabActive, resolveHref, type TabKey } from "./mobile-tabs";

const ICONS: Record<TabKey, LucideIcon> = {
  home: Home,
  collections: LayoutGrid,
  cart: ShoppingBag,
  orders: Receipt,
  my: User,
};

// 모바일 전용 하단 고정 탭바. sm 이상에선 숨김(sm:hidden).
// 서버 컴포넌트(MobileTabBar)가 신원·장바구니 개수를 주입한다.
export function MobileTabBarClient({
  isAuthed,
  displayName,
  cartCount,
}: {
  isAuthed: boolean;
  displayName: string | null;
  cartCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="하단 내비게이션"
      className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-border bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TAB_DEFS.map((def) => {
          const Icon = ICONS[def.key];
          const active = isTabActive(def.key, pathname);

          // 마이(로그인 상태) — 링크 대신 계정 팝오버.
          if (def.key === "my" && isAuthed) {
            return (
              <li key={def.key} className="flex-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="내 계정"
                      className="flex w-full flex-col items-center gap-0.5 py-2 text-muted-foreground"
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-display text-[11px] leading-none">
                        {def.label}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="w-56 p-2">
                    <p className="truncate px-3 pb-2 pt-1 font-display text-sm text-foreground">
                      {displayName ?? "회원"}님 ✿
                    </p>
                    <div className="border-t-2 border-border/30 pt-1">
                      <form action={logout}>
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
                        >
                          <LogOut className="h-4 w-4" />
                          로그아웃
                        </button>
                      </form>
                    </div>
                  </PopoverContent>
                </Popover>
              </li>
            );
          }

          const href = resolveHref(def, isAuthed);
          return (
            <li key={def.key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={def.label}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-muted-foreground transition-colors",
                  active && "text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {def.key === "cart" && cartCount > 0 && (
                    <Badge className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none">
                      {cartCount}
                    </Badge>
                  )}
                </span>
                <span className="font-display text-[11px] leading-none">
                  {def.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Verify `PopoverContent` supports `side="top"`**

Run: `grep -n "side" components/ui/popover.tsx`
Expected: Radix `PopoverPrimitive.Content`가 props를 spread하므로 `side` 지원. 만약 `side`를 명시적으로 제거/고정하는 래퍼면 `side="top"` 인자를 빼고 기본값 사용.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (에러 0).

- [ ] **Step 4: Commit**

```bash
git add "app/(shop)/_components/MobileTabBarClient.tsx"
git commit --no-verify -m "feat: mobile bottom nav client component"
```

---

## Task 3: 서버 컴포넌트 `MobileTabBar`

**Files:**
- Create: `app/(shop)/_components/MobileTabBar.tsx`

- [ ] **Step 1: Implement the server component**

`app/(shop)/_components/MobileTabBar.tsx`:

```tsx
import { getCurrentAccount } from "@/modules/auth/dal";
import { getCartCount } from "@/modules/cart/lib/queries";
import { MobileTabBarClient } from "./MobileTabBarClient";

// 모바일 하단 탭바(서버) — 신원·장바구니 개수를 조회해 클라이언트에 주입.
// CartButton과 동일하게 레이아웃에서 <Suspense>로 감싼다.
export async function MobileTabBar() {
  const account = await getCurrentAccount();
  const cartCount = account ? await getCartCount(account.id) : 0;

  return (
    <MobileTabBarClient
      isAuthed={!!account}
      displayName={account?.displayName ?? null}
      cartCount={cartCount}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`getCartCount` 시그니처가 `(accountId: string)`이고 `account.id`가 string임을 확인 — CartButton과 동일 사용.)

- [ ] **Step 3: Commit**

```bash
git add "app/(shop)/_components/MobileTabBar.tsx"
git commit --no-verify -m "feat: mobile bottom nav server wrapper"
```

---

## Task 4: 레이아웃 연결 (`app/(shop)/layout.tsx`)

**Files:**
- Modify: `app/(shop)/layout.tsx`

- [ ] **Step 1: import 추가**

`import { KakaoFloat } from "./_components/KakaoFloat";` 아래 줄에 추가:

```tsx
import { MobileTabBar } from "./_components/MobileTabBar";
```

- [ ] **Step 2: 모바일에서 헤더 우측 클러스터 숨김**

찾기:

```tsx
            <div className="flex items-center gap-1">
```

바꾸기(모바일 숨김, sm부터 노출):

```tsx
            <div className="hidden items-center gap-1 sm:flex">
```

- [ ] **Step 3: 루트 컨테이너에 모바일 하단 여백**

찾기:

```tsx
      <div className="relative flex min-h-screen flex-col">
```

바꾸기(고정 바가 콘텐츠·푸터를 가리지 않게, 데스크톱은 0):

```tsx
      <div className="relative flex min-h-screen flex-col pb-16 sm:pb-0">
```

- [ ] **Step 4: 하단 탭바 렌더**

찾기:

```tsx
        <SiteFooter />
        <KakaoFloat />
        <Toaster />
```

바꾸기:

```tsx
        <SiteFooter />
        <KakaoFloat />
        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
        <Toaster />
```

(`Suspense`는 파일 상단에서 이미 import 중 — 추가 import 불필요.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(shop)/layout.tsx"
git commit --no-verify -m "feat: wire mobile bottom nav into shop layout; hide header actions on mobile"
```

---

## Task 5: KakaoFloat 위치 상향 (`app/(shop)/_components/KakaoFloat.tsx`)

**Files:**
- Modify: `app/(shop)/_components/KakaoFloat.tsx`

- [ ] **Step 1: 모바일에서 bottom 오프셋 상향**

찾기(className 내부):

```
fixed bottom-6 right-6 z-40
```

바꾸기(모바일은 바 위로, 데스크톱은 기존 유지):

```
fixed bottom-24 right-6 z-40 sm:bottom-6
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(shop)/_components/KakaoFloat.tsx"
git commit --no-verify -m "feat: lift kakao float above mobile bottom nav"
```

---

## Task 6: 전체 검증 (lint / build / test / 브라우저 프리뷰)

**Files:** 없음(검증만).

- [ ] **Step 1: Lint + Typecheck + Test**

Run:
```bash
npm run lint && npm run typecheck && npx vitest run
```
Expected: 모두 PASS. (기존 테스트 + Task 1 신규 테스트.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: 성공(`prisma generate && next build` 통과).

- [ ] **Step 3: 브라우저 프리뷰 — 모바일 뷰포트 검증**

preview_start(name: `iroiro-beta`) → 375px(mobile)로 resize_window →
`/`, `/cart`, `/collections` 이동하며 확인:
- 하단 5탭 노출, 현재 경로 탭 활성 강조.
- 상단 헤더가 로고만(장바구니·계정 숨김).
- 장바구니 배지(로그인+담은 상태) 노출.
- KakaoFloat가 바 위에 떠 콘텐츠/바와 겹치지 않음.
- desktop(1280px)로 resize → 하단 바 사라지고 기존 상단 헤더(장바구니·계정) 복귀.

- [ ] **Step 4: 비로그인 동작 확인**

로그아웃 상태에서 `/`(모바일)에서 컬렉션/주문/마이 탭 → `/login`으로 이동하는지 확인.

- [ ] **Step 5: 최종 스크린샷**

모바일 뷰포트에서 하단 바가 보이는 홈 화면 screenshot으로 결과 공유.

---

## Self-Review

- **Spec coverage:** 5탭(Task1 `TAB_DEFS`) · 활성판정(Task1 `isTabActive`) · 비로그인 href(Task1 `resolveHref`) · 배지(Task2) · 마이 팝오버(Task2) · 모바일 헤더 로고만(Task4 Step2) · 하단 여백(Task4 Step3) · 바 렌더(Task4 Step4) · KakaoFloat 상향(Task5) · breakpoint `sm:hidden`(Task2) — 스펙 항목 모두 태스크로 커버됨. safe-area는 Task2 nav className.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TODO/TBD 없음.
- **Type consistency:** `TabKey`/`TabDef`/`TAB_DEFS`/`resolveHref`/`isTabActive` 이름이 Task1 정의와 Task2 사용에서 일치. `MobileTabBarClient` props(`isAuthed`,`displayName`,`cartCount`)가 Task2 정의·Task3 호출에서 일치.
