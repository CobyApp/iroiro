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

// 시리즈 추가·수정·삭제 다이얼로그. 종류 선택지는 DB(series_kind)에서 내려온 목록을 쓴다 —
// 코드 상수는 라벨 폴백일 뿐이라 여기서 직접 참조하지 않는다.

export type KindOption = { key: string; label: string };

export type SeriesRowInput = {
  id: number;
  sku: string;
  label: string;
  labelKo: string | null;
  kind: string;
  teamId: number | null;
};

type FormState = Omit<SeriesInput, "teamId">;

function SeriesFormFields({
  value,
  onChange,
  kinds,
}: {
  value: FormState;
  onChange: (next: FormState) => void;
  kinds: KindOption[];
}) {
  // 현재 값이 목록에 없는 키(데이터에만 있는 종류)면 그대로 선택지로 노출해 값을 잃지 않게 한다.
  const options =
    value.kind && !kinds.some((k) => k.key === value.kind)
      ? [...kinds, { key: value.kind, label: value.kind }]
      : kinds;
  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">시리즈 이름 (원문)</label>
        <Input
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          placeholder="예: クリスマス 2024"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">한국어 병기</label>
        <Input
          value={value.labelKo ?? ""}
          onChange={(e) =>
            onChange({ ...value, labelKo: e.target.value || null })
          }
          placeholder="예: 크리스마스 2024 — 원문이 일본어일 때 고객 화면에 함께 표기"
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
              {options.map((k) => (
                <SelectItem key={k.key} value={k.key}>
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

function emptyForm(kinds: KindOption[]): FormState {
  return { label: "", labelKo: null, kind: kinds[0]?.key ?? "random", sku: "" };
}

// 시리즈 추가 — 그룹 섹션 헤더의 버튼.
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
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => emptyForm(kinds));

  function submit() {
    startTransition(async () => {
      const result = await createSeries({ ...form, teamId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("시리즈를 추가했어요");
      setForm(emptyForm(kinds));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          시리즈 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>시리즈 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <SeriesFormFields value={form} onChange={setForm} kinds={kinds} />
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
  const [form, setForm] = useState<FormState>({
    label: series.label,
    labelKo: series.labelKo,
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
