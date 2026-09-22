"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ShieldCheck, ShieldPlus, ShieldMinus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setBoardRole, setPostingBan, setSiteAdmin } from "../actions/users";
import type { AdminUserRow } from "../lib/users";

// 회원 목록 — md+ 는 표, 폰은 카드. 등급 배지·작성 상태·액션 버튼은 두 뷰가 같은 헬퍼를 쓴다.
export function UsersTable({
  users,
  canManageRoles,
  currentAccountId,
}: {
  users: AdminUserRow[];
  /** 등급 변경 노출 — site admin만. moderator는 제재만 가능. */
  canManageRoles: boolean;
  /** 현재 로그인한 관리자 id — 본인 행에는 등급/관리자 버튼을 숨긴다. */
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

  function toggleRole(u: AdminUserRow) {
    const next = u.boardRole === "moderator" ? "member" : "moderator";
    run(
      () => setBoardRole({ accountId: u.id, boardRole: next }),
      next === "moderator" ? "모더레이터로 지정했어요" : "일반 회원으로 내렸어요",
    );
  }

  // 사이트 관리자 지정/해제 — 최고 권한이라 확인 후 실행.
  function toggleAdmin(u: AdminUserRow) {
    if (u.isAdmin) {
      if (
        !window.confirm(
          `${u.displayName}님의 관리자 권한을 해제할까요? 관리자 페이지 접근이 막힙니다.`,
        )
      ) {
        return;
      }
      run(
        () => setSiteAdmin({ accountId: u.id, isAdmin: false }),
        "관리자 권한을 해제했어요",
      );
      return;
    }
    if (
      !window.confirm(
        `${u.displayName}님을 사이트 관리자로 지정할까요? 상품·주문·회원 등 모든 관리 기능에 접근할 수 있게 됩니다.`,
      )
    ) {
      return;
    }
    run(
      () => setSiteAdmin({ accountId: u.id, isAdmin: true }),
      "사이트 관리자로 지정했어요",
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

  function roleBadge(u: AdminUserRow) {
    if (u.isAdmin) {
      return (
        <Badge className="whitespace-nowrap bg-foreground text-background hover:bg-foreground">
          관리자
        </Badge>
      );
    }
    if (u.boardRole === "moderator") {
      return <Badge className="whitespace-nowrap">모더레이터</Badge>;
    }
    return (
      <Badge variant="outline" className="whitespace-nowrap font-normal">
        일반
      </Badge>
    );
  }

  function banStatus(u: AdminUserRow) {
    return u.postingBanned ? (
      <span className="text-sm text-destructive">
        제재됨{u.postingBanReason ? ` · ${u.postingBanReason}` : ""}
      </span>
    ) : (
      <span className="text-sm text-muted-foreground">정상</span>
    );
  }

  // 액션 버튼 묶음 — 폰에서 줄바꿈되도록 flex-wrap.
  function actions(u: AdminUserRow) {
    const isSelf = u.id === currentAccountId;
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {isSelf ? <span className="text-xs text-muted-foreground">본인</span> : null}
        {canManageRoles && !isSelf && (
          <Button
            variant={u.isAdmin ? "outline" : "default"}
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={pending}
            onClick={() => toggleAdmin(u)}
          >
            {u.isAdmin ? (
              <>
                <ShieldMinus className="h-3.5 w-3.5" />
                관리자 해제
              </>
            ) : (
              <>
                <ShieldPlus className="h-3.5 w-3.5" />
                관리자 지정
              </>
            )}
          </Button>
        )}
        {canManageRoles && !u.isAdmin && !isSelf && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={pending}
            onClick={() => toggleRole(u)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {u.boardRole === "moderator" ? "모더 해제" : "모더 지정"}
          </Button>
        )}
        {!u.isAdmin && u.boardRole !== "moderator" && !isSelf && (
          <Button
            variant={u.postingBanned ? "outline" : "destructive"}
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={pending}
            onClick={() => toggleBan(u)}
          >
            {u.postingBanned ? (
              <>
                <Undo2 className="h-3.5 w-3.5" />
                제재 해제
              </>
            ) : (
              <>
                <Ban className="h-3.5 w-3.5" />
                작성 제재
              </>
            )}
          </Button>
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
              <TableHead>등급</TableHead>
              <TableHead>작성 상태</TableHead>
              <TableHead className="w-56 text-right">
                <span className="sr-only">작업</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium text-foreground">{u.displayName}</p>
                  <p className="font-mono text-xs text-muted-foreground">#{u.publicCode}</p>
                </TableCell>
                <TableCell>{roleBadge(u)}</TableCell>
                <TableCell>{banStatus(u)}</TableCell>
                <TableCell>{actions(u)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 모바일 — 카드 리스트 */}
      <ul className="space-y-2 md:hidden">
        {users.map((u) => (
          <li
            key={u.id}
            className="space-y-2 rounded-md border border-border bg-card p-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{u.displayName}</p>
                <p className="font-mono text-xs text-muted-foreground">#{u.publicCode}</p>
              </div>
              {roleBadge(u)}
            </div>
            <div className="break-words">{banStatus(u)}</div>
            {actions(u)}
          </li>
        ))}
      </ul>
    </>
  );
}
