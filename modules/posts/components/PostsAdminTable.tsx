"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatKstDate } from "@/lib/datetime";
import { hidePost, unhidePost } from "../actions";
import { HIDE_REASON_MAX } from "../lib/schema";
import { POST_TOPIC_LABELS, type AdminPostItem } from "../types";

type Status = "visible" | "hidden" | "deleted";

type Props = {
  items: AdminPostItem[];
  total: number;
  page: number;
  pageSize: number;
  q?: string;
  status?: Status;
};

const STATUS_BADGE: Record<
  Status,
  { label: string; variant: "outline" | "destructive"; className?: string }
> = {
  visible: { label: "노출", variant: "outline" },
  hidden: {
    label: "숨김",
    variant: "outline",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
  deleted: { label: "삭제", variant: "destructive" },
};

function buildQuery(filter: { q?: string; status?: Status; page: number }): string {
  const params = new URLSearchParams();
  params.set("tab", "all");
  if (filter.q) params.set("q", filter.q);
  if (filter.status) params.set("status", filter.status);
  if (filter.page > 1) params.set("page", String(filter.page));
  return `/admin/posts?${params.toString()}`;
}

export function PostsAdminTable({ items, total, page, pageSize, q, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qInput, setQInput] = useState(q ?? "");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  function onSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = qInput.trim() || undefined;
    startTransition(() => router.push(buildQuery({ q: next, status, page: 1 })));
  }

  function onStatusChange(value: string) {
    const next = value === "__all__" ? undefined : (value as Status);
    startTransition(() => router.push(buildQuery({ q, status: next, page: 1 })));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={onSearchSubmit} role="search" className="relative w-full max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            placeholder="제목 검색"
            className="pl-9"
            disabled={pending}
            aria-label="게시글 제목 검색"
          />
        </form>

        <Select value={status ?? "__all__"} onValueChange={onStatusChange} disabled={pending}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            <SelectItem value="visible">노출</SelectItem>
            <SelectItem value="hidden">숨김</SelectItem>
            <SelectItem value="deleted">삭제</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead className="w-16">주제</TableHead>
            <TableHead>제목</TableHead>
            <TableHead className="w-40">작성자</TableHead>
            <TableHead className="w-28">작성일</TableHead>
            <TableHead className="w-28">상태</TableHead>
            <TableHead className="w-24 text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                {q || status ? "검색 결과가 없습니다" : "등록된 글이 없습니다"}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => (
              <PostAdminRow key={item.id} item={item} index={startIndex + index + 1} />
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {page > 1 && (
              <PaginationItem>
                <PaginationPrevious href={buildQuery({ q, status, page: page - 1 })} />
              </PaginationItem>
            )}
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {page < totalPages && (
              <PaginationItem>
                <PaginationNext href={buildQuery({ q, status, page: page + 1 })} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function PostAdminRow({ item, index }: { item: AdminPostItem; index: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hideOpen, setHideOpen] = useState(false);
  const [unhideOpen, setUnhideOpen] = useState(false);
  const [reason, setReason] = useState("");

  function handleHide() {
    startTransition(async () => {
      const result = await hidePost({ targetId: item.id, reason });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("숨김 처리되었습니다");
      setHideOpen(false);
      setReason("");
      router.refresh();
    });
  }

  function handleUnhide() {
    startTransition(async () => {
      const result = await unhidePost({ targetId: item.id });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("숨김을 해제했습니다");
      setUnhideOpen(false);
      router.refresh();
    });
  }

  const badge = STATUS_BADGE[item.status];

  return (
    <TableRow>
      <TableCell className="text-right text-sm text-muted-foreground">{index}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {POST_TOPIC_LABELS[item.topic]}
      </TableCell>
      <TableCell className="font-medium">
        {item.status === "visible" ? (
          <Link href={`/posts/${item.publicCode}`} className="hover:text-primary hover:underline">
            {item.title}
          </Link>
        ) : (
          item.title
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.authorName} #{item.authorCode}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatKstDate(item.createdAt)}
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <Badge variant={badge.variant} className={badge.className}>
            {badge.label}
          </Badge>
          {item.status === "hidden" && item.hiddenReason && (
            <p
              className="max-w-[10rem] truncate text-xs text-muted-foreground"
              title={item.hiddenReason}
            >
              {item.hiddenReason}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {item.status === "visible" && (
            <Button type="button" variant="outline" size="sm" onClick={() => setHideOpen(true)}>
              숨김
            </Button>
          )}
          {item.status === "hidden" && (
            <Button type="button" variant="outline" size="sm" onClick={() => setUnhideOpen(true)}>
              해제
            </Button>
          )}
        </div>
      </TableCell>

      {/* 해당 상태에서 트리거 버튼이 없는 Dialog는 렌더하지 않는다 — 도달 불가능한 마크업 방지. */}
      {item.status === "visible" && (
        <Dialog open={hideOpen} onOpenChange={setHideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>글 숨김</DialogTitle>
              <DialogDescription>
                숨김 사유를 입력해주세요. 작성자에게 노출됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor={`admin-hide-reason-${item.id}`}>숨김 사유</Label>
              <Textarea
                id={`admin-hide-reason-${item.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={HIDE_REASON_MAX}
                rows={3}
                placeholder="예: 운영 정책 위반(스팸/광고)"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setHideOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleHide}
                disabled={pending || reason.trim().length === 0}
              >
                {pending ? "처리 중..." : "숨김"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {item.status === "hidden" && (
        <Dialog open={unhideOpen} onOpenChange={setUnhideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>숨김 해제</DialogTitle>
              <DialogDescription>이 글의 숨김을 해제하고 다시 노출합니다.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUnhideOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button type="button" onClick={handleUnhide} disabled={pending}>
                {pending ? "처리 중..." : "해제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </TableRow>
  );
}
