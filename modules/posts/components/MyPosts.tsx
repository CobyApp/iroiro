import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { formatKstRelative } from "@/lib/datetime";
import { POST_TOPIC_LABELS, type MyPost } from "../types";

type Props = {
  items: MyPost[];
  total: number;
  page: number;
  pageSize: number;
};

export function MyPosts({ items, total, page, pageSize }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">작성한 글이 없습니다</p>
        <Link
          href="/posts/new"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          글쓰기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {items.map((post) => {
          const hidden = post.status === "hidden";
          return (
            <li key={post.id} className="space-y-1 px-4 py-3">
              {/* 숨김 글은 상세(404) 대신 수정 화면으로 — 소유자에게도 상세는 열리지 않는다. */}
              <Link
                href={hidden ? `/posts/${post.publicCode}/edit` : `/posts/${post.publicCode}`}
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {POST_TOPIC_LABELS[post.topic]}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{post.title}</span>
                {hidden && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-300 bg-amber-50 font-normal text-amber-700"
                  >
                    숨김
                  </Badge>
                )}
                <span className="shrink-0 text-sm text-muted-foreground">
                  {formatKstRelative(post.createdAt)}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                  <MessageSquare aria-hidden className="h-3.5 w-3.5" />
                  {post.commentCount}
                </span>
              </Link>
              {hidden && (
                <p className="pl-1 text-xs text-amber-700 break-words">
                  운영 정책 위반으로 숨김 처리됨
                  {post.hiddenReason ? ` — ${post.hiddenReason}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {page > 1 && (
              <PaginationItem>
                <PaginationPrevious href={`/posts/my?page=${page - 1}`} />
              </PaginationItem>
            )}
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {page < totalPages && (
              <PaginationItem>
                <PaginationNext href={`/posts/my?page=${page + 1}`} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
