"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteSeries, updateSeries } from "../actions";
import { SeriesQuickAddDialog } from "./SeriesQuickAddDialog";
import { SeriesFormFields, type KindOption, type SeriesFormState } from "./SeriesFormFields";

export type { KindOption, SeriesFormState } from "./SeriesFormFields";

export type SeriesRowInput = {
  id: number;
  sku: string;
  label: string;
  labelKo: string | null;
  kind: string;
  teamId: number | null;
  productUrl: string | null;
};

// 시리즈 추가·수정·삭제 다이얼로그. 종류 선택지는 DB(series_kind)에서 내려온 목록을 쓴다 —
// 코드 상수는 라벨 폴백일 뿐이라 여기서 직접 참조하지 않는다.
// 추가 다이얼로그(SeriesQuickAddDialog)는 카드 등록 폼과 공유한다.

// 시리즈 추가 — 그룹 섹션 헤더의 버튼. 추가 후 서버 데이터를 다시 받아 표에 바로 나타난다.
export function SeriesCreateButton({
  teamId,
  kinds,
  size = "sm",
}: {
  teamId: number;
  kinds: KindOption[];
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size={size} className="gap-1" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        시리즈 추가
      </Button>
      <SeriesQuickAddDialog
        open={open}
        onOpenChange={setOpen}
        teamId={teamId}
        kinds={kinds}
        onCreated={() => router.refresh()}
      />
    </>
  );
}

// 시리즈 행 작업 — 수정 다이얼로그 + 삭제(연결 카드·상품이 없을 때만 서버가 허용).
export function SeriesRowActions({
  series,
  linkedCount,
  kinds,
}: {
  series: SeriesRowInput;
  /** 연결된 카드+상품 수 — 0이 아니면 삭제 버튼을 잠근다. */
  linkedCount: number;
  kinds: KindOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SeriesFormState>({
    label: series.label,
    labelKo: series.labelKo,
    kind: series.kind,
    sku: series.sku,
    productUrl: series.productUrl,
  });

  function save() {
    startTransition(async () => {
      const result = await updateSeries(series.id, {
        ...form,
        teamId: series.teamId,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("시리즈를 수정했어요");
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`「${series.label}」 시리즈를 삭제할까요?`)) return;
    startTransition(async () => {
      const result = await deleteSeries(series.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("시리즈를 삭제했어요");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={`${series.label} 수정`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>시리즈 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            <SeriesFormFields value={form} onChange={setForm} kinds={kinds} />
            <Button
              className="w-full"
              disabled={pending || !form.label.trim() || !form.sku.trim()}
              onClick={save}
            >
              {pending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        aria-label={`${series.label} 삭제`}
        disabled={pending || linkedCount > 0}
        title={
          linkedCount > 0
            ? `연결된 카드·상품 ${linkedCount}건 — 삭제하려면 먼저 연결을 바꿔주세요`
            : undefined
        }
        onClick={remove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
