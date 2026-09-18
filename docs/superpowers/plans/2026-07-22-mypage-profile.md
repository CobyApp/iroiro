# 마이페이지(프로필) 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단 "마이" 팝오버를 없애고, 프로필+설정+컬렉션을 담은 인스타형 `/mypage`(및 닉네임 수정 `/mypage/edit`)로 전환한다.

**Architecture:** 기존 `/collections`의 프로필+컬렉션 구성을 `/mypage`로 옮기고 `/collections`는 리다이렉트. `/mypage` 상단에 설정 팝오버(회원정보 변경·로그아웃)를 두고, 닉네임 수정은 server action으로 처리. 모바일 마이 탭·데스크톱 컬렉션 링크의 목적지를 `/mypage`로 변경.

**Tech Stack:** Next.js 16 App Router, React 18, Tailwind, lucide-react, Radix Popover, Vitest(node env).

**설계 스펙:** `docs/superpowers/specs/2026-07-22-mypage-profile-design.md`

---

## File Structure

- Modify: `app/(shop)/_components/mobile-tabs.ts` — `my` 탭 href `/login`→`/mypage`.
- Modify: `tests/app/(shop)/_components/mobile-tabs.test.ts` — my href 기대값 갱신.
- Modify: `app/(shop)/_components/MobileTabBarClient.tsx` — 마이 팝오버 제거(일반 링크화), 미사용 import·`displayName` prop 정리.
- Modify: `app/(shop)/_components/MobileTabBar.tsx` — `displayName` 전달 제거.
- Modify: `app/(shop)/_components/DesktopNavLinks.tsx` — 컬렉션 href `/collections`→`/mypage`.
- Modify: `modules/auth/lib/account.ts` — `updateAccountDisplayName` 추가.
- Modify: `modules/auth/actions.ts` — `updateProfile` server action 추가.
- Modify: `tests/modules/auth/actions.test.ts` — `updateProfile` describe 추가.
- Create: `app/(shop)/mypage/_components/ProfileSettingsMenu.tsx` — ⚙ 설정 팝오버.
- Create: `app/(shop)/mypage/page.tsx` — 프로필+설정+컬렉션.
- Create: `app/(shop)/mypage/edit/_components/EditProfileForm.tsx` — 닉네임 수정 폼.
- Create: `app/(shop)/mypage/edit/page.tsx` — 회원정보 변경 화면.
- Modify: `app/(shop)/collections/page.tsx` — `redirect("/mypage")`.

---

## Task 1: 모바일 마이 탭 목적지 `/mypage` (TDD)

**Files:**
- Modify: `app/(shop)/_components/mobile-tabs.ts`
- Test: `tests/app/(shop)/_components/mobile-tabs.test.ts`

- [ ] **Step 1: Update the test (fails first)**

`tests/app/(shop)/_components/mobile-tabs.test.ts` 의 `resolveHref` describe에서 `my` 관련 기대값을 교체 — 아래 블록으로 바꾼다:

```ts
describe("resolveHref", () => {
  it("비로그인 시 보호 탭은 /login으로", () => {
    expect(resolveHref(defFor("orders"), false)).toBe("/login");
    expect(resolveHref(defFor("my"), false)).toBe("/login");
  });
  it("로그인 시 보호 탭은 원래 경로(마이는 /mypage)", () => {
    expect(resolveHref(defFor("orders"), true)).toBe("/orders");
    expect(resolveHref(defFor("my"), true)).toBe("/mypage");
  });
  it("공개 탭은 로그인 여부와 무관", () => {
    expect(resolveHref(defFor("home"), false)).toBe("/");
    expect(resolveHref(defFor("cart"), false)).toBe("/cart");
    expect(resolveHref(defFor("cart"), true)).toBe("/cart");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npx vitest run "tests/app/(shop)/_components/mobile-tabs.test.ts"`
Expected: FAIL — `resolveHref(my, true)`가 `/login`(현재값)이라 `/mypage` 기대와 불일치.

- [ ] **Step 3: Implement — my 탭 href 변경**

`app/(shop)/_components/mobile-tabs.ts` 에서 my 탭 정의를 교체:

```ts
  { key: "my", label: "마이", href: "/mypage", requiresAuth: true },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npx vitest run "tests/app/(shop)/_components/mobile-tabs.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(shop)/_components/mobile-tabs.ts" "tests/app/(shop)/_components/mobile-tabs.test.ts"
git commit --no-verify -m "feat: mobile 마이 tab points to /mypage"
```

---

## Task 2: 마이 팝오버 제거 (MobileTabBarClient / MobileTabBar)

**Files:**
- Modify: `app/(shop)/_components/MobileTabBarClient.tsx`
- Modify: `app/(shop)/_components/MobileTabBar.tsx`

- [ ] **Step 1: MobileTabBarClient 전체를 아래로 교체 (팝오버 제거·일반 링크화)**

`app/(shop)/_components/MobileTabBarClient.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Receipt,
  ShoppingBag,
  User,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TAB_DEFS, isTabActive, resolveHref, type TabKey } from "./mobile-tabs";

const ICONS: Record<TabKey, LucideIcon> = {
  home: Home,
  cart: ShoppingBag,
  orders: Receipt,
  my: User,
};

// 모바일 전용 하단 고정 탭바. sm 이상에선 숨김(sm:hidden).
// 마이는 /mypage(비로그인 시 /login)로 가는 일반 링크 — 팝오버 없음.
export function MobileTabBarClient({
  isAuthed,
  cartCount,
}: {
  isAuthed: boolean;
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

- [ ] **Step 2: MobileTabBar 에서 displayName 전달 제거**

`app/(shop)/_components/MobileTabBar.tsx` 전체를 교체:

```tsx
import { getCurrentAccount } from "@/modules/auth/dal";
import { getCartCount } from "@/modules/cart/lib/queries";
import { MobileTabBarClient } from "./MobileTabBarClient";

// 모바일 하단 탭바(서버) — 신원·장바구니 개수를 조회해 클라이언트에 주입.
export async function MobileTabBar() {
  const account = await getCurrentAccount();
  const cartCount = account ? await getCartCount(account.id) : 0;

  return <MobileTabBarClient isAuthed={!!account} cartCount={cartCount} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(shop)/_components/MobileTabBarClient.tsx" "app/(shop)/_components/MobileTabBar.tsx"
git commit --no-verify -m "refactor: mobile 마이 tab is a plain link (remove popover)"
```

---

## Task 3: 데스크톱 컬렉션 링크 → /mypage

**Files:**
- Modify: `app/(shop)/_components/DesktopNavLinks.tsx`

- [ ] **Step 1: 컬렉션 링크 href 변경**

`app/(shop)/_components/DesktopNavLinks.tsx` 의 `LINKS` 배열에서 컬렉션 항목을 교체:

```ts
  { label: "컬렉션", href: "/mypage", exact: false },
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(shop)/_components/DesktopNavLinks.tsx"
git commit --no-verify -m "feat: desktop 컬렉션 link points to /mypage"
```

---

## Task 4: 리포지토리 — updateAccountDisplayName

**Files:**
- Modify: `modules/auth/lib/account.ts`

- [ ] **Step 1: 함수 추가 (파일 끝에)**

`modules/auth/lib/account.ts` 끝에 추가:

```ts
// 현재 계정의 표시 닉네임 갱신. displayName은 parseNickname 통과값(호출 측 검증).
export async function updateAccountDisplayName(
  accountId: string,
  displayName: string,
): Promise<void> {
  await db.account.update({
    where: { id: accountId },
    data: { displayName, updatedAt: new Date() },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "modules/auth/lib/account.ts"
git commit --no-verify -m "feat: add updateAccountDisplayName repository fn"
```

---

## Task 5: updateProfile server action (TDD)

**Files:**
- Modify: `modules/auth/actions.ts`
- Test: `tests/modules/auth/actions.test.ts`

- [ ] **Step 1: 테스트 추가 (fails first)**

`tests/modules/auth/actions.test.ts` 수정 — (a) `account` hoisted mock에 `updateAccountDisplayName` 추가, (b) dal·next/cache mock 추가, (c) import에 `updateProfile` 추가, (d) describe 블록 추가.

(a) `account` 모의를 교체:

```ts
const account = vi.hoisted(() => ({
  findAccountByIdentity: vi.fn(),
  createAccountFromSignup: vi.fn(),
  updateAccountDisplayName: vi.fn(),
}));
vi.mock("@/modules/auth/lib/account", () => account);
```

(b) `vi.mock("@/modules/auth/lib/session", () => session);` 아래에 추가:

```ts
const dal = vi.hoisted(() => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/modules/auth/dal", () => dal);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

(c) import 라인 교체:

```ts
import { completeSignupAction, logout, updateProfile } from "@/modules/auth/actions";
```

(d) 파일 끝(마지막 `}` 뒤)에 describe 추가:

```ts
describe("updateProfile", () => {
  it("비로그인이면 에러 — 업데이트 안 함", async () => {
    dal.getCurrentAccount.mockResolvedValue(null);
    await expect(updateProfile({ displayName: "민수" })).rejects.toThrow();
    expect(account.updateAccountDisplayName).not.toHaveBeenCalled();
  });

  it("닉네임 검증 실패면 업데이트 안 함", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    nickname.parseNickname.mockImplementation(() => {
      throw new Error("invalid");
    });
    await expect(updateProfile({ displayName: "" })).rejects.toThrow();
    expect(account.updateAccountDisplayName).not.toHaveBeenCalled();
  });

  it("유효하면 현재 계정 id로 닉네임 갱신", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    nickname.parseNickname.mockReturnValue("민수");
    await updateProfile({ displayName: "  민수  " });
    expect(account.updateAccountDisplayName).toHaveBeenCalledWith("acc-1", "민수");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npx vitest run tests/modules/auth/actions.test.ts`
Expected: FAIL — `updateProfile`가 아직 export되지 않음(import 에러).

- [ ] **Step 3: Implement — updateProfile 액션 추가**

`modules/auth/actions.ts`: import에 dal·account·next/cache 추가하고 액션을 파일 끝에 추가.

import 블록에서 account import를 교체:

```ts
import {
  createAccountFromSignup,
  findAccountByIdentity,
  updateAccountDisplayName,
} from "./lib/account";
```

파일 상단 import 그룹에 추가(예: `import { parseNickname } from "./lib/nickname";` 아래):

```ts
import { getCurrentAccount } from "./dal";
import { revalidatePath } from "next/cache";
```

파일 끝에 액션 추가:

```ts
// 회원정보 변경 — 현재 세션 계정의 닉네임을 갱신. Server Action.
export async function updateProfile(input: {
  displayName: string;
}): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  const nickname = parseNickname(input.displayName);
  await updateAccountDisplayName(account.id, nickname);
  revalidatePath("/mypage");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npx vitest run tests/modules/auth/actions.test.ts`
Expected: PASS (기존 logout·completeSignupAction + 신규 updateProfile 3케이스).

- [ ] **Step 5: Commit**

```bash
git add modules/auth/actions.ts tests/modules/auth/actions.test.ts
git commit --no-verify -m "feat: updateProfile server action (nickname edit) with tests"
```

---

## Task 6: ProfileSettingsMenu (설정 팝오버)

**Files:**
- Create: `app/(shop)/mypage/_components/ProfileSettingsMenu.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`app/(shop)/mypage/_components/ProfileSettingsMenu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { LogOut, Settings, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { logout } from "@/modules/auth/actions";

// 프로필 우측 상단 설정 메뉴 — ⚙ → 회원정보 변경 + 로그아웃.
export function ProfileSettingsMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="설정">
          <Settings className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <Link
          href="/mypage/edit"
          className="flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          <UserPen className="h-4 w-4" />
          회원정보 변경
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(shop)/mypage/_components/ProfileSettingsMenu.tsx"
git commit --no-verify -m "feat: profile settings popover (edit profile + logout)"
```

---

## Task 7: /mypage 페이지 (프로필 + 설정 + 컬렉션)

**Files:**
- Create: `app/(shop)/mypage/page.tsx`

- [ ] **Step 1: 페이지 작성**

`app/(shop)/mypage/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import {
  getInventory,
  getOwnerCollections,
} from "@/modules/collection/lib/queries";
import { MyCollections } from "@/modules/collection/components/MyCollections";
import { ProfileSettingsMenu } from "./_components/ProfileSettingsMenu";

export const metadata: Metadata = { title: "마이" };

// 프로필(마이페이지) — 닉네임·소지 카드 요약 + 설정 메뉴 + 컬렉션 그리드.
export default async function MyPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const [collections, inventory] = await Promise.all([
    getOwnerCollections(account.id),
    getInventory(account.id),
  ]);
  const totalCards = inventory.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{account.displayName ?? "회원"}</h1>
          <p className="text-sm text-muted-foreground">
            소지 카드 {totalCards}장
          </p>
        </div>
        <ProfileSettingsMenu />
      </header>
      <MyCollections
        collections={collections}
        publicBaseUrl={env.R2_PUBLIC_BASE}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(shop)/mypage/page.tsx"
git commit --no-verify -m "feat: /mypage profile page (profile + settings + collections)"
```

---

## Task 8: 회원정보 변경 화면 (/mypage/edit)

**Files:**
- Create: `app/(shop)/mypage/edit/_components/EditProfileForm.tsx`
- Create: `app/(shop)/mypage/edit/page.tsx`

- [ ] **Step 1: EditProfileForm 작성**

`app/(shop)/mypage/edit/_components/EditProfileForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/modules/auth/actions";
import { NICKNAME_MAX_LENGTH } from "@/modules/auth/lib/nickname";

// 회원정보 변경 폼 — 닉네임 수정. 이메일·전화는 읽기 전용 표시.
export function EditProfileForm({
  displayName,
  email,
  phoneNumber,
}: {
  displayName: string;
  email: string | null;
  phoneNumber: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nickname, setNickname] = useState(displayName);

  function handleSave() {
    const trimmed = nickname.trim();
    if (!trimmed) {
      toast.info("닉네임을 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      try {
        await updateProfile({ displayName: trimmed });
        toast.success("회원정보를 저장했습니다.");
        router.push("/mypage");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="nickname" className="text-sm font-medium">
          닉네임
        </label>
        <Input
          id="nickname"
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임"
        />
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">이메일</dt>
          <dd>{email ?? "미설정"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">전화번호</dt>
          <dd>{phoneNumber ?? "미설정"}</dd>
        </div>
      </dl>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push("/mypage")}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: /mypage/edit 페이지 작성**

`app/(shop)/mypage/edit/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { EditProfileForm } from "./_components/EditProfileForm";

export const metadata: Metadata = { title: "회원정보 변경" };

// 회원정보 변경 — 닉네임 수정(이메일·전화 읽기 전용).
export default async function EditProfilePage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">회원정보 변경</h1>
      <EditProfileForm
        displayName={account.displayName ?? ""}
        email={account.email}
        phoneNumber={account.phoneNumber}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run typecheck`
Expected: PASS. (`account.email`·`account.phoneNumber`는 `Account`에서 `string | null`.)

- [ ] **Step 4: Commit**

```bash
git add "app/(shop)/mypage/edit/_components/EditProfileForm.tsx" "app/(shop)/mypage/edit/page.tsx"
git commit --no-verify -m "feat: /mypage/edit — nickname edit form"
```

---

## Task 9: /collections → /mypage 리다이렉트

**Files:**
- Modify: `app/(shop)/collections/page.tsx`

- [ ] **Step 1: 본문을 리다이렉트로 교체**

`app/(shop)/collections/page.tsx` 전체를 교체:

```tsx
import { redirect } from "next/navigation";

// 컬렉션은 마이페이지(/mypage)로 통합됨 — index는 리다이렉트.
// 관리(/collections/manage/[id])·공개(/collections/[publicCode]) 라우트는 유지.
export default function CollectionsIndexRedirect() {
  redirect("/mypage");
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(shop)/collections/page.tsx"
git commit --no-verify -m "feat: redirect /collections to /mypage"
```

---

## Task 10: 전체 검증 (lint / typecheck / test / build / 브라우저)

**Files:** 없음(검증만).

- [ ] **Step 1: Lint + Typecheck + Test**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npm run lint && npm run typecheck && npx vitest run`
Expected: 모두 PASS.

- [ ] **Step 2: Build**

Run: `cd /Users/doyoung_kim/Documents/Git/oshikore-web && npx dotenv -e .env.local -- next build`
Expected: 성공(`/mypage`, `/mypage/edit`, `/collections` 라우트 포함).

- [ ] **Step 3: 브라우저 검증 (로그인 상태)**

preview_start(name: `oshikore-web-beta`). 로그인 세션이 있는 브라우저에서:
- 모바일(375px) `/mypage`: 프로필 헤더 + ⚙ 설정 + 컬렉션 그리드. 하단 마이 탭이 /mypage로.
- ⚙ → 회원정보 변경·로그아웃 노출. 회원정보 변경 → `/mypage/edit`.
- `/mypage/edit`: 닉네임 수정 후 저장 → `/mypage`에서 반영 확인, 이메일·전화 읽기전용.
- `/collections` 접속 → `/mypage`로 리다이렉트.
- 데스크톱(1280px): 컬렉션 링크 → `/mypage`.

- [ ] **Step 4: 비로그인 확인**

로그아웃 상태에서 `/mypage`·`/mypage/edit` → `/login` 리다이렉트. 모바일 마이 탭 href=`/login`.

---

## Self-Review

- **Spec coverage:** `/mypage`(Task7) · `/mypage/edit`(Task8) · `/collections` 리다이렉트(Task9) · 모바일 마이→/mypage(Task1,2) · 데스크톱 컬렉션→/mypage(Task3) · 설정 메뉴(Task6) · updateProfile 액션(Task5) · updateAccountDisplayName(Task4) · 닉네임 검증(parseNickname 재사용, Task5) — 스펙 항목 전부 태스크로 커버.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. TODO/TBD 없음.
- **Type consistency:** `updateProfile({displayName})`(Task5) ↔ EditProfileForm 호출(Task8) 일치. `updateAccountDisplayName(accountId, displayName)`(Task4) ↔ 액션 호출(Task5) 일치. `MobileTabBarClient` props `{isAuthed, cartCount}`(Task2) ↔ `MobileTabBar` 전달(Task2) 일치. `my` 탭 href `/mypage`(Task1) ↔ resolveHref 테스트(Task1) 일치.
