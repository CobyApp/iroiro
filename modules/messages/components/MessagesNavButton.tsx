import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentAccount } from "@/modules/auth/dal";
import { countUnreadMessages } from "../lib/queries";

// 헤더 쪽지 진입점. 로그인 시 미읽음 쪽지 수를 뱃지로 표시.
export async function MessagesNavButton() {
  const account = await getCurrentAccount();
  if (!account) return null;
  const unread = await countUnreadMessages(account.id);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 px-2.5"
      asChild
      aria-label="쪽지"
    >
      <Link href="/messages" className="relative">
        <Mail className="h-5 w-5" />
        <span className="hidden lg:inline">쪽지</span>
        {unread > 0 && (
          <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none">
            {unread > 99 ? "99+" : unread}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
