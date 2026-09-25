import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { countUnreadMessages } from "../lib/queries";

// 헤더 쪽지함 아이콘 — 알림 벨 왼쪽. 로그인 시에만 렌더, 미읽음 수 배지 표시. 클릭 시 쪽지함으로 이동.
export async function MessagesBell() {
  const account = await getCurrentAccount();
  if (!account) return null;
  const unread = await countUnreadMessages(account.id);
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="relative gap-1.5 px-2.5"
    >
      <Link href="/messages" aria-label={`쪽지함${unread > 0 ? ` ${unread}개 안 읽음` : ""}`}>
        <Mail className="h-5 w-5" />
        <span className="hidden lg:inline">쪽지</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
