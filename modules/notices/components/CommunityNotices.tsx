import Link from "next/link";
import { Megaphone, Pin } from "lucide-react";
import { formatKstDate } from "@/lib/datetime";
import { listHomeNotices } from "../lib/queries";
import { NOTICE_CATEGORY_LABELS } from "../types";

// 커뮤니티 상단 공식 공지 — 별도 공지 목록 페이지를 없애고 커뮤니티로 통합한 진입점.
// 고정 우선 → 최신순 상위 N만. 상세는 /notices/[code](운영 콘텐츠 페이지)로.
export async function CommunityNotices({ limit = 3 }: { limit?: number }) {
  const notices = await listHomeNotices(limit);
  if (notices.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3"
      aria-label="공식 공지"
    >
      <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-primary">
        <Megaphone aria-hidden className="h-3.5 w-3.5" />
        공식 공지
      </p>
      <ul className="divide-y divide-border/60">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link
              href={`/notices/${notice.publicCode}`}
              className="flex items-center gap-2 rounded-md px-1.5 py-2 text-sm transition-colors hover:bg-card"
            >
              {notice.isPinned && (
                <Pin aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {NOTICE_CATEGORY_LABELS[notice.category]}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {notice.title}
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {formatKstDate(notice.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
