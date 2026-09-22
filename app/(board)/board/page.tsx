import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, EyeOff, Megaphone, MessageSquare } from "lucide-react";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  listAdminPosts,
  listHiddenComments,
  listReportQueue,
} from "@/modules/posts/lib/queries";
import { listNotices } from "@/modules/notices/lib/queries";

export const metadata: Metadata = { title: "홈" };

// 게시판 관리 홈 — 오늘 처리할 일(미해결 신고)과 숨김 현황·공지 수를 한 화면에.
export default async function BoardHomePage() {
  const [queue, hiddenPosts, hiddenComments, notices] = await Promise.all([
    listReportQueue(1),
    listAdminPosts({ status: "hidden", page: 1 }),
    listHiddenComments(1),
    listNotices(),
  ]);

  const stats = [
    {
      label: "미해결 신고",
      value: queue.total,
      href: "/board/posts?tab=queue",
      icon: AlertTriangle,
      warn: queue.total > 0,
    },
    {
      label: "숨긴 글",
      value: hiddenPosts.total,
      href: "/board/posts?tab=all&status=hidden",
      icon: EyeOff,
    },
    {
      label: "숨긴 댓글",
      value: hiddenComments.total,
      href: "/board/posts?tab=hidden-comments",
      icon: EyeOff,
    },
    {
      label: "공지",
      value: notices.length,
      href: "/board/notices",
      icon: Megaphone,
    },
  ];

  return (
    <AdminPage className="space-y-6">
      <AdminPageHeader title="게시판 관리" description="신고 처리와 커뮤니티 운영을 한곳에서." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="group">
              <Card className={cn("h-full transition-colors group-hover:border-primary/50", s.warn && "border-primary/40 bg-primary/5")}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs">{s.label}</span>
                    <Icon className={cn("h-4 w-4", s.warn && "text-primary")} aria-hidden />
                  </div>
                  <p className={cn("mt-2 font-display text-2xl tabular-nums", s.warn && "text-primary")}>
                    {s.value.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">
            신고가 들어오면 「게시판 · 신고」의 신고 큐에서 숨김·삭제·반려로 처리해요.
          </span>
          <Link
            href="/board/posts?tab=queue"
            className="ml-auto text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            신고 큐 열기 →
          </Link>
        </CardContent>
      </Card>
    </AdminPage>
  );
}
