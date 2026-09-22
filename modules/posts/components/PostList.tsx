"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { POST_PAGE_SIZE } from "../lib/schema";
import {
  POST_TOPICS,
  POST_TOPIC_EMOJI,
  POST_TOPIC_LABELS,
  type Post,
  type PostTopic,
} from "../types";
import { PostCard } from "./PostCard";

type Filter = { topic?: PostTopic; q?: string; page: number; fave?: boolean };

type Props = {
  items: Post[];
  total: number;
  filter: Filter;
  /** 최애 필터 칩 노출 — 로그인 + 최애 설정된 사용자에게만. */
  canFave?: boolean;
};

const TOPIC_TABS: { value: PostTopic | undefined; label: string }[] = [
  { value: undefined, label: "전체" },
  ...POST_TOPICS.map((value) => ({
    value,
    label: `${POST_TOPIC_EMOJI[value]} ${POST_TOPIC_LABELS[value]}`,
  })),
];

function buildQuery(filter: Partial<Filter>): string {
  const params = new URLSearchParams();
  if (filter.topic) params.set("topic", filter.topic);
  if (filter.q) params.set("q", filter.q);
  if (filter.fave) params.set("fave", "1");
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  const query = params.toString();
  return query ? `/posts?${query}` : "/posts";
}

function pagesAround(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const result: (number | "...")[] = [1];
  if (current > 3) result.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  for (let page = start; page <= end; page += 1) result.push(page);
  if (current < totalPages - 2) result.push("...");
  result.push(totalPages);
  return result;
}

export function PostList({ items, total, filter, canFave = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filter.q ?? "");
  const totalPages = Math.max(1, Math.ceil(total / POST_PAGE_SIZE));

  function onSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = q.trim() || undefined;
    startTransition(() =>
      router.push(buildQuery({ topic: filter.topic, q: next, fave: filter.fave, page: 1 })),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="scroll-x scroll-x-fade flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
          {TOPIC_TABS.map(({ value, label }) => (
            <Link
              key={label}
              href={buildQuery({ topic: value, q: filter.q, fave: filter.fave, page: 1 })}
              aria-current={filter.topic === value ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
                filter.topic === value
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50",
              )}
            >
              {label}
            </Link>
          ))}
          {canFave && (
            <Link
              href={buildQuery({
                topic: filter.topic,
                q: filter.q,
                fave: !filter.fave,
                page: 1,
              })}
              aria-pressed={filter.fave ? true : false}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
                filter.fave
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
              )}
            >
              🩷 내 최애
            </Link>
          )}
        </div>

        <form
          onSubmit={onSearchSubmit}
          role="search"
          className="relative w-full sm:max-w-sm"
        >
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="제목 검색"
            className="pl-9"
            disabled={pending}
            aria-label="게시글 제목 검색"
          />
        </form>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-border bg-card py-16 text-center text-muted-foreground shadow-card">
          {filter.fave
            ? "최애로 태그된 글이 아직 없어요"
            : filter.q
              ? "검색 결과가 없습니다"
              : "등록된 글이 없습니다"}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {filter.page > 1 && (
              <PaginationItem>
                <PaginationPrevious
                  href={buildQuery({ ...filter, page: filter.page - 1 })}
                />
              </PaginationItem>
            )}
            {pagesAround(filter.page, totalPages).map((page, index) =>
              page === "..." ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationLink
                    href={buildQuery({ ...filter, page })}
                    isActive={page === filter.page}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            {filter.page < totalPages && (
              <PaginationItem>
                <PaginationNext
                  href={buildQuery({ ...filter, page: filter.page + 1 })}
                />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
