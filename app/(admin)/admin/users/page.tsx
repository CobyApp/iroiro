import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { isBoardManager } from "@/modules/admin/lib/roles";
import { listAdminUsers } from "@/modules/admin/lib/users";
import { UsersTable } from "@/modules/admin/components/UsersTable";

export const metadata: Metadata = { title: "회원 · 등급" };

// 회원 등급·작성 제재 관리. 등급(모더레이터) 변경은 site admin만, 작성 제재는
// board manager(admin·moderator)도 가능 — canManageRoles로 UI를 가른다.
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const account = await getCurrentAccount();
  if (!isBoardManager(account)) redirect("/");
  const { q } = await searchParams;
  const users = await listAdminUsers(q);

  return (
    <AdminPage>
      <AdminPageHeader
        title="회원 · 등급"
        count={users.length}
        description="사이트 관리자·게시판 모더레이터를 지정하거나, 신고 누적 회원의 작성을 제재해요."
      >
        <form action="/admin/users" className="w-full sm:w-72">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="닉네임 또는 #공개코드"
            aria-label="회원 검색"
            className="h-9 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary/50"
          />
        </form>
      </AdminPageHeader>

      <UsersTable
        users={users}
        canManageRoles={isAdmin(account)}
        currentAccountId={account!.id}
      />
    </AdminPage>
  );
}
