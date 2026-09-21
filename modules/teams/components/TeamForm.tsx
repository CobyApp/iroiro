"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LOCALE_KEYS,
  LOCALE_LABELS,
  LOCALE_PLACEHOLDERS,
  type LocaleKey,
  type NameI18n,
} from "@/lib/i18n";
import { createTeam, deleteTeam, updateTeam } from "../actions";
import type { Team } from "../types";

type Props = {
  mode: "new" | "edit";
  team?: Team;
};

export function TeamForm({ mode, team }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState(team?.name ?? "");
  const [i18nValues, setI18nValues] = useState<Record<LocaleKey, string>>({
    "ja-jpan": team?.nameI18n?.["ja-jpan"] ?? "",
    "ja-hira": team?.nameI18n?.["ja-hira"] ?? "",
    en: team?.nameI18n?.en ?? "",
  });
  const [debutDate, setDebutDate] = useState(team?.debutDate ?? "");
  const [disbandDate, setDisbandDate] = useState(team?.disbandDate ?? "");
  // 그룹 고유색(#rrggbb) — 카탈로그 칩·헤더 색. 비우면 기본 색.
  const [themeColor, setThemeColor] = useState(team?.themeColor ?? "");

  function buildNameI18n(): NameI18n | null {
    const entries = LOCALE_KEYS.flatMap((key) => {
      const value = i18nValues[key].trim();
      return value ? [[key, value] as const] : [];
    });
    return entries.length > 0
      ? (Object.fromEntries(entries) as NameI18n)
      : null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("한글 그룹명은 필수입니다");
      return;
    }

    startTransition(async () => {
      const result =
        mode === "edit" && team
          ? await updateTeam({
              id: team.id,
              name: name.trim(),
              nameI18n: buildNameI18n(),
              debutDate: debutDate || null,
              disbandDate: disbandDate || null,
              themeColor: themeColor || null,
            })
          : await createTeam({
              name: name.trim(),
              nameI18n: buildNameI18n(),
              debutDate: debutDate || null,
              disbandDate: disbandDate || null,
              themeColor: themeColor || null,
            });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.push("/catalog/teams");
    });
  }

  const submitLabel = pending
    ? mode === "edit"
      ? "저장 중..."
      : "등록 중..."
    : mode === "edit"
      ? "저장"
      : "등록";

  function handleDelete() {
    if (!team) return;
    startDeleteTransition(async () => {
      const result = await deleteTeam(team.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`그룹 "${team.name}" 삭제 완료`);
      setConfirmOpen(false);
      router.push("/catalog/teams");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>그룹 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              한글명 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 뉴진스"
              autoFocus
              required
            />
          </div>

          {LOCALE_KEYS.map((key) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`i18n-${key}`}>{LOCALE_LABELS[key]}</Label>
              <Input
                id={`i18n-${key}`}
                value={i18nValues[key]}
                onChange={(event) =>
                  setI18nValues((prev) => ({
                    ...prev,
                    [key]: event.target.value,
                  }))
                }
                placeholder={LOCALE_PLACEHOLDERS[key]}
              />
            </div>
          ))}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="debutDate">데뷔일</Label>
              <DatePicker
                id="debutDate"
                value={debutDate || null}
                onChange={(next) => setDebutDate(next ?? "")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disbandDate">해체일</Label>
              <DatePicker
                id="disbandDate"
                value={disbandDate || null}
                onChange={(next) => setDisbandDate(next ?? "")}
              />
            </div>
          </div>

          {/* 그룹 고유색 — 카탈로그의 그룹 칩·섹션 색. 색상 피커 + 코드 직접 입력. */}
          <div className="space-y-2">
            <Label htmlFor="themeColor">그룹 색</Label>
            <div className="flex items-center gap-2">
              <input
                id="themeColor"
                type="color"
                value={themeColor || "#5b5bd6"}
                onChange={(event) => setThemeColor(event.target.value)}
                className="h-10 w-12 cursor-pointer rounded-md border border-border bg-card p-1"
                aria-label="그룹 색 선택"
              />
              <Input
                value={themeColor}
                onChange={(event) => setThemeColor(event.target.value.trim())}
                placeholder="#FF6B9D"
                className="max-w-[10rem] font-mono"
                pattern="^#[0-9a-fA-F]{6}$"
              />
              {themeColor && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setThemeColor("")}>
                  비우기
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {mode === "edit" && team ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={pending || deleting}
              >
                삭제
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/catalog/teams")}
                disabled={pending || deleting}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={pending || deleting || !name.trim()}
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "edit" && team ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>그룹 삭제</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    그룹 &quot;{team.name}&quot; 데이터를 정말 삭제하시겠습니까?
                  </p>
                  <p>이 작업은 되돌릴 수 없습니다.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </form>
  );
}
