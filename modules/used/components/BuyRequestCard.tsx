import Link from "next/link";
import { MessageSquare, ShoppingBag } from "lucide-react";
import { formatKstRelative } from "@/lib/datetime";
import {
  BUY_REQUEST_STATUS_LABEL,
  type UsedBuyRequestWithMeta,
} from "../buy-types";
import { USED_ITEM_TYPE_LABEL, type UsedItemType } from "../types";

// 삽니다(매입 요청) 카드 — 텍스트 위주(사진 없음). 그룹/멤버·예산·오퍼 수를 노출.
export function BuyRequestCard({ request }: { request: UsedBuyRequestWithMeta }) {
  const itemLabel =
    USED_ITEM_TYPE_LABEL[request.itemType as UsedItemType] ?? request.itemType;
  const tags = [request.teamName, request.memberName].filter(Boolean) as string[];
  const isFulfilled = request.status === "fulfilled";

  return (
    <Link
      href={`/used/wanted/${request.id}`}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <ShoppingBag className="h-3 w-3" aria-hidden />
          삽니다
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {itemLabel}
        </span>
        {isFulfilled && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {BUY_REQUEST_STATUS_LABEL.fulfilled}
          </span>
        )}
      </div>

      <p className="line-clamp-2 font-medium text-foreground">{request.title}</p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-1 text-sm">
        <span className="font-display text-foreground">
          {request.budget != null ? `₩${request.budget.toLocaleString()}` : "가격 협의"}
          {request.quantity > 1 && (
            <span className="ml-1 text-xs text-muted-foreground">×{request.quantity}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="h-3 w-3" aria-hidden />
          오퍼 {request.offerCount}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {request.requesterName} · {formatKstRelative(request.createdAt)}
      </p>
    </Link>
  );
}
