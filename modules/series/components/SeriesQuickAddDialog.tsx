"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSeries, type CreatedSeries } from "../actions";
import {
  SeriesFormFields,
  emptySeriesForm,
  type KindOption,
  type SeriesFormState,
} from "./SeriesFormFields";

// 시리즈 빠른 추가 다이얼로그 — 시리즈 화면의 「시리즈 추가」와 카드 등록 폼의 「새 시리즈」가 공유한다.
// 이름(원문)·한국어 병기·종류(DB)·SKU(비우면 자동)·상품 URL 을 받고, 만든 행을 onCreated 로 넘겨
// 호출한 화면이 바로 선택하거나 새로고침할 수 있게 한다.
export function SeriesQuickAddDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  kinds,
  defaultKind,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  /** 제목에 그룹명을 붙여 어느 그룹에 추가되는지 보이게. */
  teamName?: string;
  kinds: KindOption[];
  /** 열릴 때 미리 선택할 종류 — 등록 폼에서 고른 종류를 이어받는다. */
  defaultKind?: string | null;
  onCreated?: (series: CreatedSeries) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            시리즈 추가{teamName ? ` — ${teamName}` : ""}
          </DialogTitle>
          <DialogDescription>
            원문 이름과 종류만 있으면 돼요. SKU 는 비우면 자동으로 붙어요.
          </DialogDescription>
        </DialogHeader>
        {/* 폼 상태는 안쪽 컴포넌트에 — 다이얼로그가 닫히면 내용이 언마운트되어 다음에 열 때 비어 있다. */}
        <SeriesQuickAddForm
          teamId={teamId}
          kinds={kinds}
          defaultKind={defaultKind}
          onDone={(created) => {
            onOpenChange(false);
            onCreated?.(created);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SeriesQuickAddForm({
  teamId,
  kinds,
  defaultKind,
  onDone,
}: {
  teamId: number;
  kinds: KindOption[];
  defaultKind?: string | null;
  onDone: (created: CreatedSeries) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SeriesFormState>(() => {
    const base = emptySeriesForm(kinds);
    return defaultKind && kinds.some((k) => k.key === defaultKind)
      ? { ...base, kind: defaultKind }
      : base;
  });

  function submit() {
    startTransition(async () => {
      const result = await createSeries({ ...form, teamId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`시리즈 「${result.data.label}」 추가`);
      onDone(result.data);
    });
  }

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && form.label.trim()) submit();
      }}
    >
      <SeriesFormFields
        value={form}
        onChange={setForm}
        kinds={kinds}
        skuOptional
      />
      <Button
        type="submit"
        className="h-11 w-full sm:h-10"
        disabled={pending || !form.label.trim()}
      >
        {pending ? "추가 중…" : "추가"}
      </Button>
    </form>
  );
}
