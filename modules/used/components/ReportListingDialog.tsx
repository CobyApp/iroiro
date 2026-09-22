"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { reportUsedListing } from "../report-actions";
import { USED_REPORT_DETAIL_MAX } from "../lib/schema";
import { USED_REPORT_REASONS, USED_REPORT_REASON_LABELS, type UsedReportReason } from "../types";

type Props = {
  listingId: number;
  /** 커스텀 트리거 — 미지정 시 텍스트형 소형 버튼. */
  trigger?: React.ReactNode;
};

// 중고 매물 신고 다이얼로그 — 로그인 사용자·비판매자에게만 노출한다(서버도 백스톱).
export function ReportListingDialog({ listingId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<UsedReportReason>(USED_REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await reportUsedListing({
        listingId,
        reason,
        detail: detail.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("신고가 접수되었습니다");
      setOpen(false);
      setReason(USED_REPORT_REASONS[0]);
      setDetail("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto gap-1 px-1.5 py-1 text-xs text-muted-foreground"
          >
            <Flag aria-hidden className="h-3 w-3" />
            신고
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>매물 신고</DialogTitle>
            <DialogDescription>
              신고 내용은 운영팀 검토 후 처리됩니다. 허위 신고는 제재 대상이 될 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="used-report-reason">사유</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as UsedReportReason)}>
                <SelectTrigger id="used-report-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USED_REPORT_REASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {USED_REPORT_REASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="used-report-detail">상세 내용 (선택)</Label>
              <Textarea
                id="used-report-detail"
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="신고 사유를 자세히 알려주세요"
                rows={4}
                maxLength={USED_REPORT_DETAIL_MAX}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "신고 중..." : "신고"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
