"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ShieldMinus, ShieldPlus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setAdminRole, setPostingBan, setSiteAdmin } from "../actions/users";
import { ADMIN_SPACES, ADMIN_SPACE_LABEL } from "../lib/adminRoles";
import type { AdminUserRow } from "../lib/users";

// 회원 목록·권한 부여 — md+ 는 표, 폰은 카드. 부분 관리 권한(배송·중고·커뮤니티·토레카)을
// 토글 칩으로 켜고 끄고, 사이트 관리자 지정·작성 제재도 여기서 한다. 전부 site admin 전용 화면.
export function UsersTable({
  users,
  currentAccountId,
}: {
  users: AdminUserRow[];
  /** 현재 로그인한 관리자 id — 본인 행에는 권한/관리자 버튼을 숨긴다. */
  currentAccountId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "실패했어요");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  function toggleSpace(u: AdminUserRow, space: (typeof ADMIN_SPACES)[number]) {
    const granted = !u.adminRoles.includes(space);
    run(
      () => setAdminRole({ accountId: u.id, space, granted }),
      granted ? `${ADMIN_SPACE_LABEL[space]} 권한을 부여했어요` : `${ADMIN_SPACE_LABEL[space]} 권한을 회수했어요`,
    );
  }

  function toggleAdmin(u: AdminUserRow) {
    const msg = u.isAdmin
      ? `${u.displayName}님의 사이트 관리자 권한을 해제할까요?`
      : `${u.displayName}님을 사이트 관리자로 지정할까요? 모든 관리 공간에 접근할 수 있게 됩니다.`;
    if (!window.confirm(msg)) return;
    run(
      () => setSiteAdmin({ accountId: u.id, isAdmin: !u.isAdmin }),
      u.isAdmin ? "관리자 권한을 해제했어요" : "사이트 관리자로 지정했어요",
    );
  }

  function toggleBan(u: AdminUserRow) {
    if (u.postingBanned) {
      run(() => setPostingBan({ accountId: u.id, banned: false }), "작성 제재를 해제했어요");
      return;
    }
    const reason = window.prompt("작성 제재 사유 (선택)") ?? undefined;
    run(
      () => setPostingBan({ accountId: u.id, banned: true, reason: reason || undefined }),
      "작성을 제재했어요",
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-12 text-center text-muted-foreground">
        회원이 없어요.
      </div>
    );
  }

  // 부분 권한 토글 칩 묶음 — site admin 이면 전부 켜진 것으로 보이고 개별 토글은 잠근다.
  function roleChips(u: AdminUserRow) {
    const isSelf = u.id === currentAccountId;
    return (
      <div className="flex flex-wrap gap-1">
        {ADMIN_SPACES.map((space) => {
          const on = u.isAdmin || u.adminRoles.includes(space);
          return (
            <button
              key={space}
              type="button"
              disabled={pending || isSelf || u.isAdmin}
              onClick={() => toggleSpace(u, space)}
              aria-pressed={on}
              title={u.isAdmin ? "사이트 관리자는 모든 권한 보유" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
                on
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {ADMIN_SPACE_LABEL[space]}
            </button>
          );
        })}
      </div>
    );
  }

  function banStatus(u: AdminUserRow) {
    return u.postingBanned ? (
      <span className="text-xs text-destructive">
        제재됨{u.postingBanReason ? ` · ${u.postingBanReason}` : ""}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">정상</span>
    );
  }

  function accountActions(u: AdminUserRow) {
    const isSelf = u.id === currentAccountId;
    if (isSelf) return <span className="text-xs text-muted-foreground">본인</span>;
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          variant={u.isAdmin ? "outline" : "default"}
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          disabled={pending}
          onClick={() => toggleAdmin(u)}
        >
          {u.isAdmin ? <ShieldMinus className="h-3.5 w-3.5" /> : <ShieldPlus className="h-3.5 w-3.5" />}
          {u.isAdmin ? "관리자 해제" : "관리자 지정"}
        </Button>
        {!u.isAdmin && u.adminRoles.length === 0 && (
          <Button
            variant={u.postingBanned ? "outline" : "destructive"}
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={pending}
            onClick={() => toggleBan(u)}
          >
            {u.postingBanned ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            {u.postingBanned ? "제재 해제" : "작성 제재"}
          </Button>
        )}
      </div>
    );
  }

  function nameCell(u: AdminUserRow) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <Link
            href={`/admin/users/${u.id}`}
            className="block truncate font-medium text-foreground hover:text-primary hover:underline"
          >
            {u.displayName}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">#{u.publicCode}</p>
        </div>
        {u.isAdmin && (
          <Badge className="shrink-0 whitespace-nowrap bg-foreground text-background hover:bg-foreground">
            관리자
          </Badge>
        )}
      </div>
    );
  }

  return (
    <>
      {/* 데스크톱 — 표 */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회원</TableHead>
              <TableHead>관리 권한</TableHead>
              <TableHead>작성</TableHead>
              <TableHead className="w-44 text-right">
                <span className="sr-only">계정</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{nameCell(u)}</TableCell>
                <TableCell>{roleChips(u)}</TableCell>
                <TableCell>{banStatus(u)}</TableCell>
                <TableCell>{accountActions(u)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 모바일 — 카드 리스트 */}
      <ul className="space-y-2 md:hidden">
        {users.map((u) => (
          <li key={u.id} className="space-y-2.5 rounded-md border border-border bg-card p-3 shadow-card">
            <div className="flex items-start justify-between gap-2">
              {nameCell(u)}
              {banStatus(u)}
            </div>
            {roleChips(u)}
            {accountActions(u)}
          </li>
        ))}
      </ul>
    </>
  );
}
