"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKstDateTime } from "@/lib/datetime";
import { unhideComment } from "../actions";
import type { HiddenCommentItem } from "../types";

type Props = {
  items: HiddenCommentItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function HiddenComments({ items, total, page, pageSize }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead>소속 글</TableHead>
            <TableHead>댓글 본문</TableHead>
            <TableHead className="w-40">숨김 사유</TableHead>
            <TableHead className="w-36">숨김 시각</TableHead>
            <TableHead className="w-20 text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                숨겨진 댓글이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => (
              <HiddenCommentRow key={item.id} item={item} index={startIndex + index + 1} />
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {page > 1 && (
              <PaginationItem>
                <PaginationPrevious href={`/admin/posts?tab=hidden-comments&page=${page - 1}`} />
              </PaginationItem>
            )}
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {page < totalPages && (
              <PaginationItem>
                <PaginationNext href={`/admin/posts?tab=hidden-comments&page=${page + 1}`} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function HiddenCommentRow({ item, index }: { item: HiddenCommentItem; index: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [unhideOpen, setUnhideOpen] = useState(false);

  function handleUnhide() {
    startTransition(async () => {
      const result = await unhideComment({ targetId: item.id });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("숨김을 해제했습니다");
      setUnhideOpen(false);
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="text-right text-sm text-muted-foreground">{index}</TableCell>
      <TableCell className="max-w-xs text-sm">
        {item.postStatus === "active" && item.postPublicCode ? (
          <Link
            href={`/posts/${item.postPublicCode}`}
            className="hover:text-primary hover:underline"
          >
            {item.postTitle ?? "(제목 없음)"}
          </Link>
        ) : item.postStatus === "deleted" ? (
          <span className="text-muted-foreground">
            {item.postTitle ?? "(제목 없음)"}{" "}
            <span className="text-xs">(삭제된 글)</span>
          </span>
        ) : (
          <span className="text-muted-foreground">(글 없음)</span>
        )}
      </TableCell>
      <TableCell className="max-w-[16rem] whitespace-pre-wrap break-words text-sm">
        {item.body}
      </TableCell>
      <TableCell className="max-w-[10rem] truncate text-sm text-muted-foreground" title={item.hiddenReason ?? undefined}>
        {item.hiddenReason ?? "-"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatKstDateTime(item.hiddenAt)}
      </TableCell>
      <TableCell className="text-right">
        {item.postStatus === "active" ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setUnhideOpen(true)}>
            해제
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="상위 글이 없거나 삭제되어 해제할 수 없습니다"
          >
            해제
          </Button>
        )}
      </TableCell>

      <Dialog open={unhideOpen} onOpenChange={setUnhideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>댓글 숨김 해제</DialogTitle>
            <DialogDescription>이 댓글의 숨김을 해제하고 다시 노출합니다.</DialogDescription>
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
    </TableRow>
  );
}
