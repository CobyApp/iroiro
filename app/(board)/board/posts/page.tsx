import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { HiddenComments } from "@/modules/posts/components/HiddenComments";
import { PostsAdminTable } from "@/modules/posts/components/PostsAdminTable";
import { ReportQueue } from "@/modules/posts/components/ReportQueue";
import { listAdminPosts, listHiddenComments, listReportQueue } from "@/modules/posts/lib/queries";
import { POST_TITLE_MAX } from "@/modules/posts/lib/schema";

export const metadata: Metadata = { title: "게시판 관리" };

type SearchParams = Record<string, string | string[] | undefined>;
type Status = "visible" | "hidden" | "deleted";
type Tab = "queue" | "all" | "hidden-comments";

const TABS: { value: Tab; label: string }[] = [
  { value: "queue", label: "신고 큐" },
  { value: "all", label: "전체 글" },
  { value: "hidden-comments", label: "숨김 댓글" },
];

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

// 관용 파싱 — 오값은 기본값(postListParamsSchema의 lenient 패턴과 동일 취지).
function parseTab(params: SearchParams): Tab {
  const raw = one(params, "tab");
  if (raw === "all") return "all";
  if (raw === "hidden-comments") return "hidden-comments";
  return "queue";
}

function parseStatus(params: SearchParams): Status | undefined {
  const value = one(params, "status");
  return value === "visible" || value === "hidden" || value === "deleted" ? value : undefined;
}

function parsePage(params: SearchParams): number {
  const raw = Number(one(params, "page"));
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

function parseQ(params: SearchParams): string | undefined {
  // 공개 검색(postListParamsSchema)과 동일하게 길이 상한 적용.
  const trimmed = one(params, "q")?.trim().slice(0, POST_TITLE_MAX);
  return trimmed ? trimmed : undefined;
}

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab = parseTab(params);
  const page = parsePage(params);
  const q = parseQ(params);
  const status = parseStatus(params);

  // 탭당 하나만 조회 — 비활성 탭 데이터는 필요 없다.
  const queue = tab === "queue" ? await listReportQueue(page) : null;
  const posts = tab === "all" ? await listAdminPosts({ q, status, page }) : null;
  const hiddenComments = tab === "hidden-comments" ? await listHiddenComments(page) : null;

  // 범위 밖 페이지는 마지막 유효 페이지로(활성 탭 기준) — 빈 목록·페이저 소실 방지.
  const active = queue ?? posts ?? hiddenComments;
  if (active) {
    const totalPages = Math.max(1, Math.ceil(active.total / active.pageSize));
    if (page > totalPages) {
      const sp = new URLSearchParams({ tab });
      if (q) sp.set("q", q);
      if (status) sp.set("status", status);
      if (totalPages > 1) sp.set("page", String(totalPages));
      redirect(`/board/posts?${sp.toString()}`);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader title="게시판 · 신고" />

      {/* 탭 — 폰에서 줄바꿈 대신 가로 스크롤 */}
      <nav
        className="scroll-x flex gap-2 overflow-x-auto border-b border-border"
        aria-label="게시판 관리 탭"
      >
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/board/posts?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {queue && (
        <ReportQueue items={queue.items} total={queue.total} page={page} pageSize={queue.pageSize} />
      )}
      {posts && (
        <PostsAdminTable
          items={posts.items}
          total={posts.total}
          page={page}
          pageSize={posts.pageSize}
          q={q}
          status={status}
        />
      )}
      {hiddenComments && (
        <HiddenComments
          items={hiddenComments.items}
          total={hiddenComments.total}
          page={page}
          pageSize={hiddenComments.pageSize}
        />
      )}
    </AdminPage>
  );
}
