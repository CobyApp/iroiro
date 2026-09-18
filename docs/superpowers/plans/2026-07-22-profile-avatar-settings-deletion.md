# 프로필 개편(아바타·설정·회원탈퇴) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans. 체크박스로 추적.

**Goal:** `/mypage`를 인스타형(아바타+통계)으로 개편하고, 아바타 업로드·설정 메뉴 확장(소개·약관·개인정보·회원탈퇴)·회원 탈퇴(소프트 삭제)를 추가한다.

**Architecture:** `Account`에 `avatarKey`·`deletedAt` 추가(beta DB additive 마이그레이션). 아바타는 기존 R2 presign 재사용. 탈퇴는 소프트 삭제 + `validateSessionToken` 가드로 차단. 액션은 `modules/auth`에, UI는 `/mypage` 하위에.

**Tech Stack:** Next.js 16, Prisma 7, R2(aws4fetch), Radix Dialog/Popover, Vitest(node).

**스펙:** `docs/superpowers/specs/2026-07-22-profile-avatar-settings-deletion-design.md`

---

## Task 1: 스키마 + 마이그레이션 (avatarKey, deletedAt)

**Files:** `prisma/schema.prisma`, `supabase/migrations/20260722000000_account_avatar_soft_delete.sql`

- [ ] **Step 1: prisma Account에 필드 추가** — `displayName` 아래에:
```prisma
  avatarKey             String?           @map("avatar_key")
  deletedAt             DateTime?         @map("deleted_at") @db.Timestamptz(6)
```
- [ ] **Step 2: 마이그레이션 SQL 작성** (`supabase/migrations/20260722000000_account_avatar_soft_delete.sql`):
```sql
-- account: 아바타 키 + 소프트 삭제 컬럼 (additive/nullable)
ALTER TABLE account ADD COLUMN avatar_key text;
ALTER TABLE account ADD COLUMN deleted_at timestamptz;
```
- [ ] **Step 3: beta DB 적용 + 클라이언트 생성**
Run: `cd <repo> && dotenv -e .env.local -- prisma db execute --file supabase/migrations/20260722000000_account_avatar_soft_delete.sql --schema prisma/schema.prisma && npm run db:generate`
Expected: 성공. (additive라 무해.)
- [ ] **Step 4: Typecheck + Commit**
Run: `npm run typecheck`
```bash
git add prisma/schema.prisma supabase/migrations/20260722000000_account_avatar_soft_delete.sql
git commit --no-verify -m "feat: add account.avatar_key and deleted_at (schema + migration)"
```

---

## Task 2: 인증 가드 — 탈퇴 계정 차단 (TDD)

**Files:** `modules/auth/lib/session.ts`, `tests/modules/auth/session.test.ts`(신규 또는 기존)

- [ ] **Step 1: 실패 테스트** — `tests/modules/auth/session-soft-delete.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  accountSession: { findUnique: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { validateSessionToken } from "@/modules/auth/lib/session";

beforeEach(() => vi.clearAllMocks());

describe("validateSessionToken — soft delete", () => {
  it("계정이 탈퇴(deletedAt) 상태면 세션 무효(null)", async () => {
    db.accountSession.findUnique.mockResolvedValue({
      tokenHash: "h",
      expiresAt: new Date(Date.now() + 100000),
      account: { id: "a1", deletedAt: new Date() },
    });
    expect(await validateSessionToken("tok")).toBeNull();
  });
  it("정상 계정이면 세션 반환", async () => {
    const expiresAt = new Date(Date.now() + 100000);
    db.accountSession.findUnique.mockResolvedValue({
      tokenHash: "h",
      expiresAt,
      account: { id: "a1", deletedAt: null },
    });
    const r = await validateSessionToken("tok");
    expect(r?.account.id).toBe("a1");
  });
});
```
Run(FAIL 기대): `npx vitest run tests/modules/auth/session-soft-delete.test.ts`
- [ ] **Step 2: 가드 구현** — `session.ts` `validateSessionToken`에서 만료 체크 다음, return 직전에:
```ts
  // 탈퇴(소프트 삭제) 계정은 인증 거부.
  if (session.account.deletedAt !== null) return null;
```
- [ ] **Step 3: PASS 확인 + Commit**
```bash
git add modules/auth/lib/session.ts tests/modules/auth/session-soft-delete.test.ts
git commit --no-verify -m "feat: block soft-deleted accounts in session validation (with test)"
```

---

## Task 3: 리포지토리 — updateAccountAvatar, softDeleteAccount

**Files:** `modules/auth/lib/account.ts`

- [ ] **Step 1: 함수 추가** (파일 끝):
```ts
// 아바타 R2 키 갱신.
export async function updateAccountAvatar(
  accountId: string,
  avatarKey: string,
): Promise<void> {
  await db.account.update({
    where: { id: accountId },
    data: { avatarKey, updatedAt: new Date() },
  });
}

// 소프트 삭제 — deletedAt 기록 + 닉네임 익명화 + 세션 전부 폐기.
export async function softDeleteAccount(accountId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
        deletedAt: new Date(),
        displayName: "탈퇴한 회원",
        updatedAt: new Date(),
      },
    });
    await tx.accountSession.deleteMany({ where: { accountId } });
  });
}
```
- [ ] **Step 2: Typecheck + Commit**
```bash
git add modules/auth/lib/account.ts
git commit --no-verify -m "feat: updateAccountAvatar + softDeleteAccount repository fns"
```

---

## Task 4: 서버 액션 — presignAvatar, updateAvatar, deleteAccount (TDD)

**Files:** `modules/auth/actions.ts`, `tests/modules/auth/actions.test.ts`

- [ ] **Step 1: 테스트 추가** — `actions.test.ts`:
  (a) `account` mock에 `updateAccountAvatar: vi.fn(), softDeleteAccount: vi.fn()` 추가.
  (b) import에 `presignAvatar, updateAvatar, deleteAccount` 추가.
  (c) r2 presign mock 추가:
```ts
const r2presign = vi.hoisted(() => ({
  getSignedUploadUrl: vi.fn(async () => "https://r2/upload"),
  getPublicUrl: vi.fn((k: string) => `https://pub/${k}`),
}));
vi.mock("@/lib/r2/presign", () => r2presign);
```
  (d) describe 추가:
```ts
describe("updateAvatar", () => {
  it("비로그인 throw", async () => {
    dal.getCurrentAccount.mockResolvedValue(null);
    await expect(updateAvatar({ key: "avatars/x.png" })).rejects.toThrow();
  });
  it("avatars/ 아닌 키 거부", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "a1" });
    await expect(updateAvatar({ key: "hack/x.png" })).rejects.toThrow();
    expect(account.updateAccountAvatar).not.toHaveBeenCalled();
  });
  it("유효 키면 저장", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "a1" });
    await updateAvatar({ key: "avatars/x.png" });
    expect(account.updateAccountAvatar).toHaveBeenCalledWith("a1", "avatars/x.png");
  });
});
describe("presignAvatar", () => {
  it("비이미지 MIME 거부", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "a1" });
    await expect(presignAvatar({ contentType: "application/pdf" })).rejects.toThrow();
  });
  it("이미지면 avatars/ 키 반환", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "a1" });
    const r = await presignAvatar({ contentType: "image/png" });
    expect(r.key.startsWith("avatars/")).toBe(true);
    expect(r.uploadUrl).toBe("https://r2/upload");
  });
});
describe("deleteAccount", () => {
  it("비로그인 throw", async () => {
    dal.getCurrentAccount.mockResolvedValue(null);
    await expect(deleteAccount()).rejects.toThrow("REDIRECT:/").catch(() => {});
    expect(account.softDeleteAccount).not.toHaveBeenCalled();
  });
  it("로그인 시 소프트삭제+쿠키제거+리다이렉트", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "a1" });
    await expect(deleteAccount()).rejects.toThrow("REDIRECT:/");
    expect(account.softDeleteAccount).toHaveBeenCalledWith("a1");
    expect(cookiesLib.clearSessionCookie).toHaveBeenCalled();
  });
});
```
  (비로그인 deleteAccount는 throw("로그인 필요") — REDIRECT가 아니므로 위 첫 케이스는 단순 rejects.toThrow()로. 정정: `await expect(deleteAccount()).rejects.toThrow();`)
- [ ] **Step 2: FAIL 확인** — `npx vitest run tests/modules/auth/actions.test.ts`
- [ ] **Step 3: 액션 구현** — `actions.ts`:
  import 추가: `getSignedUploadUrl, getPublicUrl` from `@/lib/r2/presign`, `v7 as uuidv7` from `uuid`, `updateAccountAvatar, softDeleteAccount` from `./lib/account`.
```ts
const AVATAR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function presignAvatar(input: {
  contentType: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  const ext = AVATAR_MIME[input.contentType];
  if (!ext) throw new Error("이미지 파일만 업로드할 수 있습니다.");
  const key = `avatars/${uuidv7()}.${ext}`;
  const uploadUrl = await getSignedUploadUrl(key, input.contentType);
  return { uploadUrl, key };
}

export async function updateAvatar(input: { key: string }): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  if (!input.key.startsWith("avatars/")) throw new Error("잘못된 키입니다.");
  await updateAccountAvatar(account.id, input.key);
  revalidatePath("/mypage");
}

export async function deleteAccount(): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  await softDeleteAccount(account.id);
  await clearSessionCookie();
  redirect("/");
}
```
- [ ] **Step 4: PASS + Typecheck + Commit**
```bash
git add modules/auth/actions.ts tests/modules/auth/actions.test.ts
git commit --no-verify -m "feat: presignAvatar/updateAvatar/deleteAccount actions (with tests)"
```

---

## Task 5: ProfileAvatar + /mypage 인스타형 헤더

**Files:** `app/(shop)/mypage/_components/ProfileAvatar.tsx`, `app/(shop)/mypage/page.tsx`

- [ ] **Step 1: ProfileAvatar** (프리젠테이션):
```tsx
import { getPublicUrl } from "@/lib/r2/presign";

export function ProfileAvatar({
  avatarKey,
  displayName,
  size = 72,
}: {
  avatarKey: string | null;
  displayName: string;
  size?: number;
}) {
  const initial = (displayName.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border-[3px] border-border bg-lemon font-display text-xl text-ink shadow-pop"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {avatarKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getPublicUrl(avatarKey)}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}
```
- [ ] **Step 2: /mypage 헤더 인스타형으로** — header 블록을 아바타+통계 가로 배치로 교체(컬렉션 수 = `collections.length`), ⚙는 우측 유지. ProfileAvatar import 추가.
- [ ] **Step 3: Typecheck + Commit**
```bash
git add "app/(shop)/mypage/_components/ProfileAvatar.tsx" "app/(shop)/mypage/page.tsx"
git commit --no-verify -m "feat: instagram-style /mypage header (avatar + stats)"
```

---

## Task 6: AvatarUploadField + EditProfileForm 통합

**Files:** `app/(shop)/mypage/edit/_components/AvatarUploadField.tsx`, `.../EditProfileForm.tsx`, `.../edit/page.tsx`

- [ ] **Step 1: AvatarUploadField**(클라): 파일 선택 → 용량(≤5MB)·MIME 체크 → `presignAvatar` → `fetch(uploadUrl, PUT, body=file, headers Content-Type)` → `updateAvatar(key)` → 미리보기(로컬 ObjectURL)·toast. props: `avatarKey`, `displayName`.
- [ ] **Step 2: EditProfileForm에 AvatarUploadField 삽입**(닉네임 위). `edit/page.tsx`에서 `avatarKey={account.avatarKey}` 전달.
- [ ] **Step 3: Typecheck + Commit**
```bash
git add "app/(shop)/mypage/edit"
git commit --no-verify -m "feat: avatar upload field on /mypage/edit"
```

---

## Task 7: 설정 메뉴 확장 + 회원 탈퇴 Dialog

**Files:** `app/(shop)/mypage/_components/ProfileSettingsMenu.tsx`, `app/(shop)/mypage/_components/DeleteAccountItem.tsx`

- [ ] **Step 1: DeleteAccountItem**(클라): 빨강 버튼 → `Dialog`("정말 탈퇴하시겠어요? 되돌릴 수 없습니다") → 확인 시 `startTransition(() => deleteAccount())`.
- [ ] **Step 2: ProfileSettingsMenu 확장** — 회원정보 변경 + 소개(/welcome) + 이용약관(/terms) + 개인정보처리방침(/privacy) + 로그아웃 + `<DeleteAccountItem />`.
- [ ] **Step 3: Typecheck + Commit**
```bash
git add "app/(shop)/mypage/_components/ProfileSettingsMenu.tsx" "app/(shop)/mypage/_components/DeleteAccountItem.tsx"
git commit --no-verify -m "feat: expand settings menu + account deletion dialog"
```

---

## Task 8: 약관·개인정보 플레이스홀더 페이지

**Files:** `app/(marketing)/terms/page.tsx`, `app/(marketing)/privacy/page.tsx`

- [ ] **Step 1: 두 페이지 작성** — 제목 + "본 문서는 준비 중입니다. 실제 문구로 교체가 필요합니다." 플레이스홀더. metadata title.
- [ ] **Step 2: Typecheck + Commit**
```bash
git add "app/(marketing)/terms" "app/(marketing)/privacy"
git commit --no-verify -m "feat: placeholder terms/privacy pages"
```

---

## Task 9: 전체 검증

- [ ] lint + typecheck + `npx vitest run` (전부 PASS)
- [ ] `npx dotenv -e .env.local -- next build` (성공, 신규 라우트 포함)
- [ ] 브라우저(로그인 필요분은 사용자 확인): 프로필 레이아웃/아바타/설정 링크/탈퇴 Dialog

---

## Self-Review

- Spec coverage: 스키마·마이그레이션(T1) · auth 가드(T2) · repo(T3) · 액션(T4) · 레이아웃/아바타 표시(T5) · 아바타 업로드(T6) · 설정+탈퇴(T7) · 약관/개인정보(T8) — 전부 커버.
- Type consistency: `updateAccountAvatar(id,key)`·`softDeleteAccount(id)`(T3) ↔ 액션(T4) 일치. `presignAvatar→{uploadUrl,key}`(T4) ↔ AvatarUploadField(T6). `avatarKey`(T1) ↔ ProfileAvatar/edit(T5,6).
