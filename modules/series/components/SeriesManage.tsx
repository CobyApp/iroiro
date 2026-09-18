"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSeries,
  deleteSeries,
  updateSeries,
  type SeriesInput,
} from "../actions";

import { SERIES_KIND_OPTIONS } from "../kinds";

type SeriesRow = {
  id: number;
  sku: string;
  label: string;
  kind: string;
  teamId: number | null;
};

function SeriesFormFields({
  value,
  onChange,
}: {
  value: Omit<SeriesInput, "teamId">;
  onChange: (next: Omit<SeriesInput, "teamId">) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">시리즈 이름</label>
        <Input
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          placeholder="예: クリスマス 2024"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">종류</label>
          <Select
            value={value.kind}
            onValueChange={(v) => onChange({ ...value, kind: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="종류" />
            </SelectTrigger>
            <SelectContent>
              {SERIES_KIND_OPTIONS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">SKU</label>
          <Input
            value={value.sku}
            onChange={(e) => onChange({ ...value, sku: e.target.value })}
            placeholder="예: EV-xmas-2024"
            className="font-mono"
          />
        </div>
      </div>
    </>
  );
}

// 시리즈 추가 — 팀 섹션 헤더의 버튼. 동기화 전에 수동으로 미리 만들 때 사용.
export function SeriesCreateButton({ teamId }: { teamId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ label: "", kind: "random", sku: "" });

  function submit() {
    startTransition(async () => {
      const result = await createSeries({ ...form, teamId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("시리즈를 추가했어요");
      setForm({ label: "", kind: "random", sku: "" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          시리즈 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>시리즈 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <SeriesFormFields value={form} onChange={setForm} />
          <Button
            className="w-full"
            disabled={pending || !form.label.trim() || !form.sku.trim()}
            onClick={submit}
          >
            {pending ? "추가 중…" : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 시리즈 행 작업 — 수정 다이얼로그 + 삭제(연결 상품 없을 때만 서버가 허용).
export function SeriesRowActions({
  series,
  productCount,
}: {
  series: SeriesRow;
  productCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    label: series.label,
    kind: series.kind,
    sku: series.sku,
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
            <SeriesFormFields value={form} onChange={setForm} />
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
        disabled={pending || productCount > 0}
        title={
          productCount > 0
            ? `연결된 상품 ${productCount}개 — 삭제하려면 먼저 상품의 시리즈를 바꿔주세요`
            : undefined
        }
        onClick={remove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
