import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { listThreads } from "@/modules/messages/lib/queries";
import { formatKstRelative } from "@/lib/datetime";

export const metadata: Metadata = { title: "쪽지함" };

// 쪽지 수신함 — 참여중인 1:1 대화 목록. 미읽음 뱃지·최근 메시지 미리보기.
export default async function MessagesInboxPage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("messages"));

  const threads = await listThreads(account.id);

  return (
    <div className="shop-page-frame space-y-4">
      <ShopPageHeader title="쪽지함" />

      {threads.length === 0 ? (
        <div className="shop-content-surface flex flex-col items-center gap-3 py-16 text-center">
          <Mail className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            아직 주고받은 쪽지가 없어요.
            <br />
            커뮤니티 게시글에서 회원에게 쪽지를 보내보세요.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/messages/${t.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                  aria-hidden="true"
                >
                  {t.otherName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">
                      {t.otherName}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatKstRelative(t.lastMessageAt)}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {t.lastBody ?? "새 대화"}
                  </p>
                </div>
                {t.unread > 0 && (
                  <Badge className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] leading-none">
                    {t.unread > 99 ? "99+" : t.unread}
                  </Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
