"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatKstDateTime } from "@/lib/datetime";
import { blockBuyRequest, unblockBuyRequest } from "../admin-actions";
import {
  BUY_REQUEST_STATUS_LABEL,
  type UsedBuyRequestWithMeta,
} from "../buy-types";

export function BuyRequestsAdminTable({
  items,
  total,
  page,
  pageSize,
  basePath,
  query,
}: {
  items: UsedBuyRequestWithMeta[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  query: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "처리에 실패했어요");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  const pageHref = (p: number) => {
    const params = new URLSearchParams(query);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
        해당 상태의 삽니다가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/used/wanted/${r.id}`}
                    target="_blank"
                    className="font-medium text-foreground hover:underline"
                  >
                    {r.title}
                  </Link>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {BUY_REQUEST_STATUS_LABEL[r.status]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[r.teamName, r.memberName].filter(Boolean).join(" · ") || "그룹 미지정"} ·{" "}
                  {r.budget != null ? `₩${r.budget.toLocaleString()}` : "협의"} · 오퍼 {r.offerCount} ·{" "}
                  <Link href={`/admin/users/${r.requesterAccountId}`} className="hover:underline">
                    {r.requesterName}
                  </Link>{" "}
                  · {formatKstDateTime(r.createdAt)}
                </p>
              </div>
              <div className="shrink-0">
                {r.status === "blocked" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => unblockBuyRequest(r.id), "차단을 해제했어요")}
                  >
                    차단 해제
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => run(() => blockBuyRequest(r.id), "차단했어요")}
                  >
                    차단
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className="flex justify-center gap-2" aria-label="페이지">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              이전
            </Link>
          )}
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              다음
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
