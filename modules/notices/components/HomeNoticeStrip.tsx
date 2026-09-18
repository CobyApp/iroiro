import Link from "next/link";
import { Megaphone } from "lucide-react";
import { listHomeNotices } from "../lib/queries";
import { NOTICE_CATEGORY_LABELS } from "../types";

// 홈 상단 공지 스트립 — 위버스의 공지 발견성 교훈(조사 ①): 목록 페이지만으론 아무도 안 본다.
export async function HomeNoticeStrip() {
  const notices = await listHomeNotices(2);
  if (notices.length === 0) return null;

  return (
    <div className="space-y-1 rounded-md border border-border bg-card px-4 py-3">
      {notices.map((notice) => (
        <Link
          key={notice.id}
          href={`/notices/${notice.publicCode}`}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Megaphone aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
            {NOTICE_CATEGORY_LABELS[notice.category]}
          </span>
          <span className="truncate">{notice.title}</span>
        </Link>
      ))}
    </div>
  );
}
