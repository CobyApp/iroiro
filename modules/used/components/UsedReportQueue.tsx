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
import { cn } from "@/lib/utils";
import { blockUsedListing, dismissUsedReport } from "../admin-actions";
import { USED_BLOCK_REASON_MAX, USED_RESOLUTION_NOTE_MAX } from "../lib/schema";
import {
  USED_REPORT_REASON_LABELS,
  type UsedReportQueueItem,
  type UsedReportTargetStatus,
} from "../types";

type Props = {
  items: UsedReportQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  publicBaseUrl: string;
};

const STATUS_BADGE: Record<
  UsedReportTargetStatus,
  { label: string; variant: "outline" | "destructive" | "secondary"; className?: string }
> = {
  visible: { label: "노출", variant: "outline" },
  blocked: {
    label: "차단됨",
    variant: "outline",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
  sold: { label: "판매완료", variant: "secondary" },
  missing: { label: "대상 없음", variant: "secondary" },
};

export function UsedReportQueue({ items, total, page, pageSize, publicBaseUrl }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead>신고된 매물</TableHead>
            <TableHead className="w-40">사유</TableHead>
            <TableHead className="w-20">신고자</TableHead>
            <TableHead className="w-36">시각</TableHead>
            <TableHead className="w-20">상태</TableHead>
            <TableHead className="w-48 text-right">액션</TableHead>
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
              <ReportRow
                key={item.id}
                item={item}
                index={startIndex + index + 1}
                publicBaseUrl={publicBaseUrl}
              />
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {page > 1 && (
              <PaginationItem>
                <PaginationPrevious href={`/market/reports?page=${page - 1}`} />
              </PaginationItem>
            )}
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {page < totalPages && (
              <PaginationItem>
                <PaginationNext href={`/market/reports?page=${page + 1}`} />
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
  publicBaseUrl,
}: {
  item: UsedReportQueueItem;
  index: number;
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blockOpen, setBlockOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const snap = item.snapshot;

  function handleBlock() {
    startTransition(async () => {
      const result = await blockUsedListing({ listingId: item.listingId, reason });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("매물을 차단했습니다");
      setBlockOpen(false);
      setReason("");
      router.refresh();
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissUsedReport({ reportId: item.id, note: note.trim() || undefined });
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

  let blockSlot: React.ReactNode;
  if (item.targetStatus === "visible") {
    blockSlot = (
      <Button type="button" variant="outline" size="sm" onClick={() => setBlockOpen(true)}>
        차단
      </Button>
    );
  } else if (item.targetStatus === "blocked") {
    blockSlot = <span className="text-xs text-muted-foreground">이미 차단</span>;
  } else {
    blockSlot = (
      <Button type="button" variant="outline" size="sm" disabled title="차단할 수 없는 상태입니다">
        차단
      </Button>
    );
  }

  return (
    <TableRow>
      <TableCell className="text-right text-sm text-muted-foreground">{index}</TableCell>
      <TableCell>
        <div className="flex items-start gap-2">
          {snap.primaryPhotoKey ? (
            /* eslint-disable-next-line @next/next/no-img-element -- 관리 목록 소형 썸네일 */
            <img
              src={`${publicBaseUrl}/${snap.primaryPhotoKey}`}
              alt=""
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded bg-muted" aria-hidden />
          )}
          <div className="min-w-0 space-y-0.5">
            <p className="truncate font-medium">{snap.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {snap.sellerName} · {snap.price != null ? `₩${snap.price.toLocaleString()}` : "경매"}
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
        </div>
      </TableCell>
      <TableCell className="text-sm">
        <p>{USED_REPORT_REASON_LABELS[item.reason]}</p>
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
          {blockSlot}
          <Button type="button" variant="ghost" size="sm" onClick={() => setDismissOpen(true)}>
            기각
          </Button>
        </div>
      </TableCell>

      {item.targetStatus === "visible" && (
        <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>매물 차단</DialogTitle>
              <DialogDescription>
                차단 사유를 입력해주세요. 판매자에게 노출되며, 매물은 고객 화면에서 사라집니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor={`block-reason-${item.id}`}>차단 사유</Label>
              <Textarea
                id={`block-reason-${item.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={USED_BLOCK_REASON_MAX}
                rows={3}
                placeholder="예: 판매 금지 물품 / 가품 의심"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBlockOpen(false)} disabled={pending}>
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleBlock}
                disabled={pending || reason.trim().length === 0}
              >
                {pending ? "처리 중..." : "차단"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신고 기각</DialogTitle>
            <DialogDescription>신고를 기각 처리합니다. 매물은 변경되지 않습니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor={`dismiss-note-${item.id}`}>메모 (선택)</Label>
            <Textarea
              id={`dismiss-note-${item.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={USED_RESOLUTION_NOTE_MAX}
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
            <DialogTitle>신고된 매물 전문</DialogTitle>
            <DialogDescription>신고 시점에 저장된 스냅샷입니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-3 overflow-y-auto pr-1">
            {snap.primaryPhotoKey && (
              /* eslint-disable-next-line @next/next/no-img-element -- 스냅샷 대표 사진 */
              <img
                src={`${publicBaseUrl}/${snap.primaryPhotoKey}`}
                alt=""
                className="max-h-64 rounded border border-border object-contain"
              />
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">제목</p>
              <p className="text-sm font-medium">{snap.title}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">판매자</p>
              <p className="text-sm">
                {snap.sellerName} #{snap.sellerCode}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">가격</p>
              <p className="text-sm">
                {snap.price != null ? `₩${snap.price.toLocaleString()}` : "경매"}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({snap.saleMode === "auction" ? "경매" : "고정가"})
                </span>
              </p>
            </div>
            {snap.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">설명</p>
                <p className="whitespace-pre-wrap break-words text-sm">{snap.description}</p>
              </div>
            )}
            <div className={cn("border-t border-border pt-2")}>
              <Link
                href={`/used/${item.listingId}`}
                target="_blank"
                className="text-sm text-primary underline-offset-2 hover:underline"
              >
                현재 매물 페이지 열기 →
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
