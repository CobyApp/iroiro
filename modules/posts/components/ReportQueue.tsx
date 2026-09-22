"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { dismissReport, hideComment, hidePost, signReportEvidencePhoto } from "../actions";
import {
  HIDE_REASON_MAX,
  RESOLUTION_NOTE_MAX,
  commentReportSnapshotV1,
  postReportSnapshot,
} from "../lib/schema";
import { REPORT_REASON_LABELS, type ReportQueueItem, type TargetStatus } from "../types";

type Props = {
  items: ReportQueueItem[];
  total: number;
  page: number;
  pageSize: number;
};

const STATUS_BADGE: Record<
  TargetStatus,
  { label: string; variant: "outline" | "destructive" | "secondary"; className?: string }
> = {
  visible: { label: "노출", variant: "outline" },
  hidden: {
    label: "숨김",
    variant: "outline",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
  deleted: { label: "삭제됨", variant: "destructive" },
  missing: { label: "대상 없음", variant: "secondary" },
};

function excerpt(text: string, max = 60): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function SnapshotSummary({ item }: { item: ReportQueueItem }) {
  if (item.target === "post") {
    const parsed = postReportSnapshot.safeParse(item.snapshot);
    if (!parsed.success) {
      return (
        <span className="text-xs italic text-muted-foreground">(스냅샷 파싱 실패)</span>
      );
    }
    return (
      <div className="max-w-xs space-y-0.5">
        <p className="truncate font-medium">{parsed.data.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {excerpt(parsed.data.body)}
        </p>
      </div>
    );
  }
  const parsed = commentReportSnapshotV1.safeParse(item.snapshot);
  if (!parsed.success) {
    return <span className="text-xs italic text-muted-foreground">(스냅샷 파싱 실패)</span>;
  }
  return <p className="max-w-xs truncate text-sm">{excerpt(parsed.data.body)}</p>;
}

// 신고 스냅샷 증거 사진 — 버튼 클릭 시 admin signer 액션으로 서명 URL 발급(숨김·삭제 후에도 열람).
function EvidencePhotos({ reportId, count }: { reportId: number; count: number }) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [pending, startTransition] = useTransition();

  function load(photoIndex: number) {
    startTransition(async () => {
      const result = await signReportEvidencePhoto({ reportId, photoIndex });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setUrls((prev) => ({ ...prev, [photoIndex]: result.data.url }));
    });
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: count }, (_, i) => (
          <Button
            key={i}
            type="button"
            variant="outline"
            size="sm"
            // 서명 URL은 15분이면 만료된다 — 이미 본 사진도 다시 눌러 재발급받을 수 있어야 한다(P2-3).
            disabled={pending}
            onClick={() => load(i)}
          >
            {urls[i] !== undefined ? `사진 ${i + 1} 새로 보기` : `사진 ${i + 1} 보기`}
          </Button>
        ))}
      </div>
      {Object.entries(urls).map(([index, url]) => (
        /* eslint-disable-next-line @next/next/no-img-element -- admin 증거 서명 GET 직접 서빙 */
        <img
          key={index}
          src={url}
          alt={`증거 사진 ${Number(index) + 1}`}
          className="max-h-64 rounded border border-border"
        />
      ))}
    </div>
  );
}

// 전문 보기 Dialog 본문 — SnapshotSummary와 동일한 스키마로 다시 safeParse해 전체 필드를 보여준다.
// 글 신고만 제목을 갖는다(commentReportSnapshotV1에는 title 필드가 없음).
function SnapshotDetail({ item }: { item: ReportQueueItem }) {
  if (item.target === "post") {
    const parsed = postReportSnapshot.safeParse(item.snapshot);
    if (!parsed.success) {
      return <p className="text-sm text-muted-foreground">스냅샷을 표시할 수 없습니다</p>;
    }
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">제목</p>
          <p className="text-sm font-medium">{parsed.data.title}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">본문</p>
          <p className="whitespace-pre-wrap break-words text-sm">{parsed.data.body}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">작성자</p>
          <p className="text-sm">
            {parsed.data.authorName} #{parsed.data.authorCode}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">수정 시각</p>
          <p className="text-sm">{formatKstDateTime(parsed.data.updatedAt)}</p>
        </div>
        {parsed.data.version === 2 && parsed.data.photos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              증거 사진 {parsed.data.photos.length}장
            </p>
            <EvidencePhotos reportId={item.id} count={parsed.data.photos.length} />
          </div>
        )}
      </div>
    );
  }

  const parsed = commentReportSnapshotV1.safeParse(item.snapshot);
  if (!parsed.success) {
    return <p className="text-sm text-muted-foreground">스냅샷을 표시할 수 없습니다</p>;
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">본문</p>
        <p className="whitespace-pre-wrap break-words text-sm">{parsed.data.body}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">작성자</p>
        <p className="text-sm">
          {parsed.data.authorName} #{parsed.data.authorCode}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">수정 시각</p>
        <p className="text-sm">{formatKstDateTime(parsed.data.updatedAt)}</p>
      </div>
    </div>
  );
}

export function ReportQueue({ items, total, page, pageSize }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead className="w-16">대상</TableHead>
            <TableHead>신고 내용</TableHead>
            <TableHead className="w-32">사유</TableHead>
            <TableHead className="w-20">신고자</TableHead>
            <TableHead className="w-36">시각</TableHead>
            <TableHead className="w-20">상태</TableHead>
            <TableHead className="w-48 text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                처리할 신고가 없습니다
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => (
              <ReportQueueRow
                key={`${item.target}-${item.id}`}
                item={item}
                index={startIndex + index + 1}
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
                <PaginationPrevious href={`/admin/posts?tab=queue&page=${page - 1}`} />
              </PaginationItem>
            )}
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {page < totalPages && (
              <PaginationItem>
                <PaginationNext href={`/admin/posts?tab=queue&page=${page + 1}`} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function ReportQueueRow({ item, index }: { item: ReportQueueItem; index: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hideOpen, setHideOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  function handleHide() {
    startTransition(async () => {
      const submit = item.target === "post" ? hidePost : hideComment;
      const result = await submit({ targetId: item.targetId, reason });
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

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissReport({
        target: item.target,
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title="이미 삭제되어 숨길 수 없습니다"
      >
        숨김
      </Button>
    );
  }

  return (
    <TableRow>
      <TableCell className="text-right text-sm text-muted-foreground">{index}</TableCell>
      <TableCell className="text-sm">
        <p>{item.target === "post" ? "글" : "댓글"}</p>
        {item.targetPublicCode && (
          <p className="text-xs text-muted-foreground">#{item.targetPublicCode}</p>
        )}
      </TableCell>
      <TableCell>
        <SnapshotSummary item={item} />
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => setSnapshotOpen(true)}
        >
          전문 보기
        </Button>
      </TableCell>
      <TableCell className="text-sm">
        <p>{REPORT_REASON_LABELS[item.reason]}</p>
        {item.detail && (
          <p className="max-w-[10rem] truncate text-xs text-muted-foreground" title={item.detail}>
            {item.detail}
          </p>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{item.reporterMasked}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatKstDateTime(item.createdAt)}
      </TableCell>
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

      {/* 트리거는 targetStatus === "visible"일 때만 존재 — 그 외 상태는 도달 불가능하므로 미렌더. */}
      {item.targetStatus === "visible" && (
        <Dialog open={hideOpen} onOpenChange={setHideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{item.target === "post" ? "글 숨김" : "댓글 숨김"}</DialogTitle>
              <DialogDescription>
                숨김 사유를 입력해주세요. 작성자에게 노출됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor={`hide-reason-${item.target}-${item.id}`}>숨김 사유</Label>
              <Textarea
                id={`hide-reason-${item.target}-${item.id}`}
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

      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신고 기각</DialogTitle>
            <DialogDescription>
              신고를 기각 처리합니다. 대상 글/댓글은 변경되지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor={`dismiss-note-${item.target}-${item.id}`}>메모 (선택)</Label>
            <Textarea
              id={`dismiss-note-${item.target}-${item.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={RESOLUTION_NOTE_MAX}
              rows={3}
              placeholder="기각 사유를 남길 수 있습니다"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDismissOpen(false)}
              disabled={pending}
            >
              취소
            </Button>
            <Button type="button" onClick={handleDismiss} disabled={pending}>
              {pending ? "처리 중..." : "기각"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 전문 보기 — 트리거가 항상 존재하므로(targetStatus 무관) 무조건 렌더. */}
      <Dialog open={snapshotOpen} onOpenChange={setSnapshotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{item.target === "post" ? "신고된 글 전문" : "신고된 댓글 전문"}</DialogTitle>
            <DialogDescription>신고 시점에 저장된 스냅샷입니다.</DialogDescription>
          </DialogHeader>
          {/* 최대 5,000자 본문 — 헤더·푸터·닫기는 고정하고 본문만 스크롤(모바일 overflow 방지). */}
          <div className="max-h-[60dvh] overflow-y-auto pr-1">
            <SnapshotDetail item={item} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSnapshotOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TableRow>
  );
}
