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
import { reportComment, reportPost } from "../actions";
import { REPORT_DETAIL_MAX } from "../lib/schema";
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "../types";

type Props = {
  target: "post" | "comment";
  targetId: number;
  /** 커스텀 트리거 — 미지정 시 텍스트형 소형 버튼. */
  trigger?: React.ReactNode;
};

export function ReportDialog({ target, targetId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const submit = target === "post" ? reportPost : reportComment;
      const result = await submit({ targetId, reason, detail: detail.trim() || undefined });
      if (!result.ok) {
        // 중복 신고("이미 신고한 글/댓글입니다")·rate limit 도메인 오류 — 서버가 반환값으로
        // 전달(프로덕션에서 throw 메시지는 소실되므로).
        toast.error(result.message);
        return;
      }
      toast.success("신고가 접수되었습니다");
      setOpen(false);
      setReason(REPORT_REASONS[0]);
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
            <DialogTitle>신고하기</DialogTitle>
            <DialogDescription>
              신고 내용은 운영팀 검토 후 처리됩니다. 허위 신고는 제재 대상이 될 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-reason">사유</Label>
              <Select
                value={reason}
                onValueChange={(value) => setReason(value as ReportReason)}
              >
                <SelectTrigger id="report-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {REPORT_REASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-detail">상세 내용 (선택)</Label>
              <Textarea
                id="report-detail"
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="신고 사유를 자세히 알려주세요"
                rows={4}
                maxLength={REPORT_DETAIL_MAX}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
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
