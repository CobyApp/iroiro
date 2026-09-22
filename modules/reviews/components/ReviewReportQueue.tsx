"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { formatKstDateTime } from "@/lib/datetime";
import {
  dismissProductReviewReport,
  hideProductReview,
} from "../actions";
import { REVIEW_HIDE_REASON_MAX, REVIEW_RESOLUTION_NOTE_MAX } from "../lib/schema";
import { ReviewStars } from "./ReviewStars";
import {
  REVIEW_REPORT_REASON_LABELS,
  type ProductReviewReportQueueItem,
  type ReviewReportTargetStatus,
} from "../types";

type Props = {
  items: ProductReviewReportQueueItem[];
  total: number;
  page: number;
  pageSize: number;
};

const STATUS_BADGE: Record<
  ReviewReportTargetStatus,
  { label: string; variant: "outline" | "secondary"; className?: string }
> = {
  visible: { label: "노출", variant: "outline" },
  hidden: {
    label: "숨김",
    variant: "outline",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
  missing: { label: "대상 없음", variant: "secondary" },
};

export function ReviewReportQueue({ items, total, page, pageSize }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <div className="space-y-4">
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead>신고된 리뷰</TableHead>
            <TableHead className="w-40">사유</TableHead>
            <TableHead className="w-20">신고자</TableHead>
            <TableHead className="w-36">시각</TableHead>
            <TableHead className="w-20">상태</TableHead>
            <TableHead className="w-44 text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                처리할 신고가 없습니다
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => (
              <ReportRow key={item.id} item={item} index={startIndex + index + 1} />
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {page > 1 && (
              <PaginationItem>
                <PaginationPrevious href={`/admin/store/reviews?page=${page - 1}`} />
              </PaginationItem>
            )}
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {page < totalPages && (
              <PaginationItem>
                <PaginationNext href={`/admin/store/reviews?page=${page + 1}`} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function ReportRow({
  item,
  index,
}: {
  item: ProductReviewReportQueueItem;
  index: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hideOpen, setHideOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const snap = item.snapshot;

  function handleHide() {
    startTransition(async () => {
      const result = await hideProductReview({ reviewId: item.reviewId, reason });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("리뷰를 숨겼습니다");
      setHideOpen(false);
      setReason("");
      router.refresh();
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissProductReviewReport({
        reportId: item.id,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("신고를 기각했습니다");
      setDismissOpen(false);
      setNote("");
      router.refresh();
    });
  }

  const badge = STATUS_BADGE[item.targetStatus];

  let hideSlot: React.ReactNode;
  if (item.targetStatus === "visible") {
    hideSlot = (
      <Button type="button" variant="outline" size="sm" onClick={() => setHideOpen(true)}>
        숨김
      </Button>
    );
  } else if (item.targetStatus === "hidden") {
    hideSlot = <span className="text-xs text-muted-foreground">이미 숨김</span>;
  } else {
    hideSlot = (
      <Button type="button" variant="outline" size="sm" disabled title="숨길 수 없는 상태입니다">
        숨김
      </Button>
    );
  }

  return (
    <TableRow>
      <TableCell className="text-right text-sm text-muted-foreground">{index}</TableCell>
      <TableCell>
        <div className="min-w-0 space-y-0.5">
          <span className="flex items-center gap-1.5">
            <ReviewStars rating={snap.rating} />
            <Link
              href={`/products/${snap.productId}`}
              target="_blank"
              className="truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {snap.productName}
            </Link>
          </span>
          <p className="max-w-[20rem] truncate text-sm">
            {snap.body || <span className="text-muted-foreground">(내용 없음)</span>}
          </p>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={() => setDetailOpen(true)}
          >
            전문 보기
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-sm">
        <p>{REVIEW_REPORT_REASON_LABELS[item.reason]}</p>
        {item.detail && (
          <p className="max-w-[12rem] truncate text-xs text-muted-foreground" title={item.detail}>
            {item.detail}
          </p>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{item.reporterMasked}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatKstDateTime(item.createdAt)}</TableCell>
      <TableCell>
        <Badge variant={badge.variant} className={badge.className}>
          {badge.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {hideSlot}
          <Button type="button" variant="ghost" size="sm" onClick={() => setDismissOpen(true)}>
            기각
          </Button>
        </div>
      </TableCell>

      {item.targetStatus === "visible" && (
        <Dialog open={hideOpen} onOpenChange={setHideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>리뷰 숨김</DialogTitle>
              <DialogDescription>
                숨김 사유를 입력해주세요(관리 메모). 리뷰는 고객 화면에서 사라집니다. 숨김은 나중에 해제할 수 있어요.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor={`hide-reason-${item.id}`}>숨김 사유</Label>
              <Textarea
                id={`hide-reason-${item.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={REVIEW_HIDE_REASON_MAX}
                rows={3}
                placeholder="예: 욕설·비방 / 허위 내용"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHideOpen(false)} disabled={pending}>
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

      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신고 기각</DialogTitle>
            <DialogDescription>신고를 기각 처리합니다. 리뷰는 변경되지 않습니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor={`dismiss-note-${item.id}`}>메모 (선택)</Label>
            <Textarea
              id={`dismiss-note-${item.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={REVIEW_RESOLUTION_NOTE_MAX}
              rows={3}
              placeholder="기각 사유를 남길 수 있습니다"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDismissOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="button" onClick={handleDismiss} disabled={pending}>
              {pending ? "처리 중..." : "기각"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신고된 리뷰 전문</DialogTitle>
            <DialogDescription>신고 시점에 저장된 스냅샷입니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-3 overflow-y-auto pr-1">
            <div>
              <p className="text-xs font-medium text-muted-foreground">상품</p>
              <p className="text-sm font-medium">{snap.productName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">작성자 · 별점</p>
              <p className="flex items-center gap-1.5 text-sm">
                {snap.reviewerName} <ReviewStars rating={snap.rating} />
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">내용</p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {snap.body || "(내용 없음)"}
              </p>
            </div>
            <div className="border-t border-border pt-2">
              <Link
                href={`/products/${snap.productId}`}
                target="_blank"
                className="text-sm text-primary underline-offset-2 hover:underline"
              >
                상품 페이지 열기 →
              </Link>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TableRow>
  );
}
