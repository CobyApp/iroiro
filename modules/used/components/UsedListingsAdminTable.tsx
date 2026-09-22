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
import { blockUsedListing, unblockUsedListing } from "../admin-actions";
import { USED_BLOCK_REASON_MAX } from "../lib/schema";
import { USED_STATUS_LABEL, type AdminUsedListingRow, type UsedStatus } from "../types";

type Props = {
  items: AdminUsedListingRow[];
  total: number;
  page: number;
  pageSize: number;
  publicBaseUrl: string;
  /** 페이지네이션·빈 상태 링크 베이스(쿼리 없는 경로). */
  basePath: string;
  /** basePath 뒤에 붙일 추가 쿼리(예: status=active). */
  query?: Record<string, string>;
  emptyLabel?: string;
};

const STATUS_BADGE: Record<UsedStatus, { className?: string }> = {
  active: {},
  reserved: { className: "border-cyan-300 bg-cyan-50 text-cyan-700" },
  sold: { className: "bg-muted text-muted-foreground" },
  canceled: { className: "bg-muted text-muted-foreground" },
  blocked: { className: "border-amber-300 bg-amber-50 text-amber-700" },
};

function hrefWith(basePath: string, query: Record<string, string>, page: number): string {
  const params = new URLSearchParams({ ...query, page: String(page) });
  return `${basePath}?${params.toString()}`;
}

export function UsedListingsAdminTable({
  items,
  total,
  page,
  pageSize,
  publicBaseUrl,
  basePath,
  query = {},
  emptyLabel = "매물이 없습니다",
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead>매물</TableHead>
            <TableHead className="w-24">가격</TableHead>
            <TableHead className="w-20">상태</TableHead>
            <TableHead className="w-20 text-right">신고</TableHead>
            <TableHead className="w-36">등록</TableHead>
            <TableHead className="w-40 text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => (
              <Row
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
                <PaginationPrevious href={hrefWith(basePath, query, page - 1)} />
              </PaginationItem>
            )}
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {page < totalPages && (
              <PaginationItem>
                <PaginationNext href={hrefWith(basePath, query, page + 1)} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function Row({
  item,
  index,
  publicBaseUrl,
}: {
  item: AdminUsedListingRow;
  index: number;
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState("");

  function handleBlock() {
    startTransition(async () => {
      const result = await blockUsedListing({ listingId: item.id, reason });
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

  function handleUnblock() {
    startTransition(async () => {
      const result = await unblockUsedListing({ listingId: item.id });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("차단을 해제했습니다");
      router.refresh();
    });
  }

  const canBlock = item.status === "active" || item.status === "reserved";

  return (
    <TableRow>
      <TableCell className="text-right text-sm text-muted-foreground">{index}</TableCell>
      <TableCell>
        <div className="flex items-start gap-2">
          {item.primaryPhotoKey ? (
            /* eslint-disable-next-line @next/next/no-img-element -- 관리 목록 소형 썸네일 */
            <img
              src={`${publicBaseUrl}/${item.primaryPhotoKey}`}
              alt=""
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded bg-muted" aria-hidden />
          )}
          <div className="min-w-0 space-y-0.5">
            <Link
              href={`/used/${item.id}`}
              target="_blank"
              className="block truncate font-medium underline-offset-2 hover:underline"
            >
              {item.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{item.sellerName}</p>
            {item.status === "blocked" && item.blockedReason && (
              <p className="truncate text-xs text-amber-700" title={item.blockedReason}>
                차단: {item.blockedReason}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {item.price != null ? `₩${item.price.toLocaleString()}` : "경매"}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={STATUS_BADGE[item.status].className}>
          {USED_STATUS_LABEL[item.status]}
        </Badge>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {item.openReports > 0 ? (
          <span className="font-medium text-primary">{item.openReports}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatKstDateTime(item.createdAt)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {item.status === "blocked" ? (
            <Button type="button" variant="outline" size="sm" onClick={handleUnblock} disabled={pending}>
              차단 해제
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBlockOpen(true)}
              disabled={!canBlock}
              title={canBlock ? undefined : "판매중·거래중 매물만 차단할 수 있습니다"}
            >
              차단
            </Button>
          )}
        </div>
      </TableCell>

      {canBlock && (
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
    </TableRow>
  );
}
