"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, ShieldMinus, ShieldPlus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setAdminRole, setPostingBan, setSiteAdmin } from "../actions/users";
import { ADMIN_SPACES, ADMIN_SPACE_LABEL } from "../lib/adminRoles";
import type { AdminUserRow } from "../lib/users";

// 회원 상세용 단일 회원 권한·제재 컨트롤 — 목록(UsersTable)과 같은 액션을 쓴다.
export function UserAdminControls({
  user,
  isSelf,
}: {
  user: AdminUserRow;
  isSelf: boolean;
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

  if (isSelf) {
    return (
      <p className="text-sm text-muted-foreground">
        본인 계정에는 권한·제재를 변경할 수 없어요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">부분 관리 권한</p>
        <div className="flex flex-wrap gap-1.5">
          {ADMIN_SPACES.map((space) => {
            const on = user.adminRoles.includes(space);
            return (
              <button
                key={space}
                type="button"
                disabled={pending || user.isAdmin}
                onClick={() =>
                  run(
                    () => setAdminRole({ accountId: user.id, space, granted: !on }),
                    on
                      ? `${ADMIN_SPACE_LABEL[space]} 권한을 회수했어요`
                      : `${ADMIN_SPACE_LABEL[space]} 권한을 부여했어요`,
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {ADMIN_SPACE_LABEL[space]}
              </button>
            );
          })}
        </div>
        {user.isAdmin && (
          <p className="text-[11px] text-muted-foreground">
            사이트 관리자는 모든 공간 권한을 자동 보유합니다.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={pending}
          onClick={() => {
            const msg = user.isAdmin
              ? `${user.displayName}님의 사이트 관리자 권한을 해제할까요?`
              : `${user.displayName}님을 사이트 관리자로 지정할까요? 모든 관리 공간에 접근할 수 있게 됩니다.`;
            if (!window.confirm(msg)) return;
            run(
              () => setSiteAdmin({ accountId: user.id, isAdmin: !user.isAdmin }),
              user.isAdmin ? "관리자 권한을 해제했어요" : "사이트 관리자로 지정했어요",
            );
          }}
        >
          {user.isAdmin ? (
            <>
              <ShieldMinus className="h-4 w-4" /> 관리자 해제
            </>
          ) : (
            <>
              <ShieldPlus className="h-4 w-4" /> 사이트 관리자 지정
            </>
          )}
        </Button>

        <Button
          type="button"
          variant={user.postingBanned ? "outline" : "destructive"}
          size="sm"
          className="gap-1.5"
          disabled={pending}
          onClick={() => {
            if (user.postingBanned) {
              run(
                () => setPostingBan({ accountId: user.id, banned: false }),
                "작성 제재를 해제했어요",
              );
              return;
            }
            const reason = window.prompt("작성 제재 사유 (선택)") ?? undefined;
            run(
              () =>
                setPostingBan({
                  accountId: user.id,
                  banned: true,
                  reason: reason || undefined,
                }),
              "작성을 제재했어요",
            );
          }}
        >
          {user.postingBanned ? (
            <>
              <Undo2 className="h-4 w-4" /> 제재 해제
            </>
          ) : (
            <>
              <Ban className="h-4 w-4" /> 작성 제재
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
