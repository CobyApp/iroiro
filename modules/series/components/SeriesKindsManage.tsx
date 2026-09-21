"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createSeriesKind,
  deleteSeriesKind,
  updateSeriesKind,
} from "../kinds-actions";
import type { SeriesKind } from "../lib/kinds-queries";

// 시리즈 종류 편집 표 — 행 안에서 라벨·순서를 바로 고치고, 아래 줄에서 새 종류를 추가한다.
// key 는 series.kind 값이라 만든 뒤 바꿀 수 없다(표에서 읽기 전용).
export function SeriesKindsManage({
  kinds,
  usage,
}: {
  kinds: SeriesKind[];
  /** key → 그 종류를 쓰는 시리즈 수. 0이 아니면 삭제 잠금. */
  usage: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ label: "", displayOrder: 1 });
  const [create, setCreate] = useState({
    key: "",
    label: "",
    displayOrder: kinds.length + 1,
  });

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "실패했어요");
        return;
      }
      toast.success(done);
      setEditingId(null);
      router.refresh();
    });
  }

  function beginEdit(k: SeriesKind) {
    setEditingId(k.id);
    setDraft({ label: k.label, displayOrder: k.displayOrder });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">순서</TableHead>
              <TableHead className="w-44">키</TableHead>
              <TableHead>라벨</TableHead>
              <TableHead className="w-24 text-right">시리즈</TableHead>
              <TableHead className="w-28 text-right">
                <span className="sr-only">작업</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kinds.map((k) => {
              const used = usage[k.key] ?? 0;
              const editing = editingId === k.id;
              return (
                <TableRow key={k.id}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {editing ? (
                      <Input
                        type="number"
                        min={1}
                        value={draft.displayOrder}
                        onChange={(e) =>
                          setDraft({ ...draft, displayOrder: Number(e.target.value) })
                        }
                        className="h-8 w-16 text-right"
                        aria-label="순서"
                      />
                    ) : (
                      k.displayOrder
                    )}
                  </TableCell>
                  <TableCell className="catalog-mono text-muted-foreground">{k.key}</TableCell>
                  <TableCell className="font-medium">
                    {editing ? (
                      <Input
                        value={draft.label}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        className="h-8"
                        aria-label="라벨"
                        autoFocus
                      />
                    ) : (
                      k.label
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {used > 0 ? used.toLocaleString() : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      {editing ? (
                        <>
                          <Button
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label="저장"
                            disabled={pending || !draft.label.trim()}
                            onClick={() =>
                              run(
                                () =>
                                  updateSeriesKind({
                                    id: k.id,
                                    label: draft.label,
                                    displayOrder: draft.displayOrder,
                                  }),
                                "종류를 수정했어요",
                              )
                            }
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            aria-label="취소"
                            disabled={pending}
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            aria-label={`${k.label} 수정`}
                            disabled={pending}
                            onClick={() => beginEdit(k)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`${k.label} 삭제`}
                            disabled={pending || used > 0}
                            title={
                              used > 0
                                ? `이 종류를 쓰는 시리즈 ${used}개 — 먼저 시리즈의 종류를 바꿔주세요`
                                : undefined
                            }
                            onClick={() => {
                              if (!window.confirm(`「${k.label}」 종류를 삭제할까요?`)) return;
                              run(() => deleteSeriesKind(k.id), "종류를 삭제했어요");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 새 종류 — 키는 영문 소문자·숫자·공백·_·- (series.kind 값이 된다) */}
      <form
        className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border bg-card/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => createSeriesKind(create),
            "종류를 추가했어요",
          );
          setCreate({ key: "", label: "", displayOrder: create.displayOrder + 1 });
        }}
      >
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">키</label>
          <Input
            value={create.key}
            onChange={(e) => setCreate({ ...create, key: e.target.value })}
            placeholder="예: live venue"
            className="h-9 w-40 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">라벨</label>
          <Input
            value={create.label}
            onChange={(e) => setCreate({ ...create, label: e.target.value })}
            placeholder="예: 공연장 한정"
            className="h-9 w-44"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">순서</label>
          <Input
            type="number"
            min={1}
            value={create.displayOrder}
            onChange={(e) => setCreate({ ...create, displayOrder: Number(e.target.value) })}
            className="h-9 w-20 text-right"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-9 gap-1"
          disabled={pending || !create.key.trim() || !create.label.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
          종류 추가
        </Button>
      </form>
    </div>
  );
}
