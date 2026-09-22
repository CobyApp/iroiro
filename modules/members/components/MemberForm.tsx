"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
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
import { todayKstYmd } from "@/lib/datetime";
import {
  LOCALE_KEYS,
  LOCALE_LABELS,
  LOCALE_PLACEHOLDERS,
  type LocaleKey,
  type NameI18n,
} from "@/lib/i18n";
import { TeamCombobox } from "@/modules/teams/components/TeamCombobox";
import type { Team } from "@/modules/teams/types";
import type { TeamMember } from "@/modules/team-members/types";
import { createMember, deleteMember, updateMember } from "../actions";
import type { Member } from "../types";

type MembershipForm = {
  teamId: number | null;
  activeStartDate: string;
  activeEndDate: string;
  role: string;
  displayOrder: string;
};

type Props =
  | { mode: "new"; teams: Team[]; member?: never; memberships?: never }
  | {
      mode: "edit";
      teams: Team[];
      member: Member;
      memberships: TeamMember[];
    };


function emptyMembership(): MembershipForm {
  return {
    teamId: null,
    activeStartDate: todayKstYmd(),
    activeEndDate: "",
    role: "",
    displayOrder: "",
  };
}

function fromTeamMember(tm: TeamMember): MembershipForm {
  return {
    teamId: tm.teamId,
    activeStartDate: tm.activeStartDate,
    activeEndDate: tm.activeEndDate ?? "",
    role: tm.role ?? "",
    displayOrder:
      tm.displayOrder !== null && tm.displayOrder !== undefined
        ? String(tm.displayOrder)
        : "",
  };
}

export function MemberForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mode } = props;

  const initialMember = mode === "edit" ? props.member : undefined;
  const teams: Team[] = props.teams;
  const [name, setName] = useState(initialMember?.name ?? "");
  const [i18nValues, setI18nValues] = useState<Record<LocaleKey, string>>({
    "ja-jpan": initialMember?.nameI18n?.["ja-jpan"] ?? "",
    "ja-hira": initialMember?.nameI18n?.["ja-hira"] ?? "",
    en: initialMember?.nameI18n?.en ?? "",
  });
  const [debutDate, setDebutDate] = useState(initialMember?.debutDate ?? "");
  const [retireDate, setRetireDate] = useState(initialMember?.retireDate ?? "");
  const [memberships, setMemberships] = useState<MembershipForm[]>(() => {
    if (mode === "edit") {
      return props.memberships.length > 0
        ? props.memberships.map(fromTeamMember)
        : [emptyMembership()];
    }
    return [emptyMembership()];
  });

  function buildI18n(): NameI18n | null {
    const entries = LOCALE_KEYS.flatMap((key) => {
      const v = i18nValues[key].trim();
      return v ? [[key, v] as const] : [];
    });
    return entries.length > 0
      ? (Object.fromEntries(entries) as NameI18n)
      : null;
  }

  function updateMembership(index: number, patch: Partial<MembershipForm>) {
    setMemberships((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addMembership() {
    setMemberships((prev) => [...prev, emptyMembership()]);
  }

  function removeMembership(index: number) {
    setMemberships((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("한글 멤버명은 필수입니다");
      return;
    }

    if (memberships.length === 0) {
      toast.error("활동 이력은 최소 1건 필요합니다");
      return;
    }
    for (let i = 0; i < memberships.length; i += 1) {
      const m = memberships[i];
      if (!m.teamId) {
        toast.error(`${i + 1}번째 활동의 소속 그룹을 선택하세요`);
        return;
      }
      if (!m.activeStartDate) {
        toast.error(`${i + 1}번째 활동의 시작일은 필수입니다`);
        return;
      }
      if (m.displayOrder.trim() !== "") {
        const order = Number(m.displayOrder);
        if (!Number.isInteger(order) || order < 0) {
          toast.error(
            `${i + 1}번째 활동의 정렬 순서는 0 이상 정수만 가능합니다`,
          );
          return;
        }
      }
    }

    const membershipsPayload = memberships.map((m) => ({
      teamId: m.teamId!,
      activeStartDate: m.activeStartDate,
      activeEndDate: m.activeEndDate || null,
      role: m.role.trim() || null,
      displayOrder:
        m.displayOrder.trim() === "" ? null : Number(m.displayOrder),
    }));

    startTransition(async () => {
      const result =
        mode === "edit"
          ? await updateMember({
              id: initialMember!.id,
              name: name.trim(),
              nameI18n: buildI18n(),
              debutDate: debutDate || null,
              retireDate: retireDate || null,
              memberships: membershipsPayload,
            })
          : await createMember({
              name: name.trim(),
              nameI18n: buildI18n(),
              debutDate: debutDate || null,
              retireDate: retireDate || null,
              memberships: membershipsPayload,
            });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.push("/admin/catalog/members");
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
    if (mode !== "edit") return;
    const target = props.member;
    startDeleteTransition(async () => {
      const result = await deleteMember(target.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`멤버 "${target.name}" 삭제 완료`);
      setConfirmOpen(false);
      router.push("/admin/catalog/members");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>멤버 정보</CardTitle>
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
                placeholder="예: 민지"
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
                <Label htmlFor="retireDate">은퇴일</Label>
                <DatePicker
                  id="retireDate"
                  value={retireDate || null}
                  onChange={(next) => setRetireDate(next ?? "")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>팀 활동 이력</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addMembership}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                활동 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {memberships.map((m, index) => (
              <div
                key={index}
                className="space-y-3 rounded-md border border-border p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    활동 #{index + 1}
                  </span>
                  {memberships.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMembership(index)}
                      className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    소속 그룹 <span className="text-destructive">*</span>
                  </Label>
                  <TeamCombobox
                    teams={teams}
                    value={m.teamId}
                    onChange={(id) => updateMembership(index, { teamId: id })}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`activeStart-${index}`}>
                      활동 시작일 <span className="text-destructive">*</span>
                    </Label>
                    <DatePicker
                      id={`activeStart-${index}`}
                      value={m.activeStartDate || null}
                      onChange={(next) =>
                        updateMembership(index, {
                          activeStartDate: next ?? "",
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`activeEnd-${index}`}>활동 종료일</Label>
                    <DatePicker
                      id={`activeEnd-${index}`}
                      value={m.activeEndDate || null}
                      onChange={(next) =>
                        updateMembership(index, { activeEndDate: next ?? "" })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`role-${index}`}>팀 내 역할</Label>
                    <Input
                      id={`role-${index}`}
                      value={m.role}
                      onChange={(event) =>
                        updateMembership(index, { role: event.target.value })
                      }
                      placeholder="예: 리더, 메인보컬"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`displayOrder-${index}`}>
                      팀 내 정렬 순서
                    </Label>
                    <Input
                      id={`displayOrder-${index}`}
                      type="number"
                      min={1}
                      step={1}
                      value={m.displayOrder}
                      onChange={(event) =>
                        updateMembership(index, {
                          displayOrder: event.target.value,
                        })
                      }
                      placeholder="1부터 · 비워두면 미지정"
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-2">
          {mode === "edit" ? (
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
              onClick={() => router.push("/admin/catalog/members")}
              disabled={pending || deleting}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={
                pending || deleting || !name.trim() || memberships.length === 0
              }
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>

      {mode === "edit" ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>멤버 삭제</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    멤버 &quot;{props.member.name}&quot; 데이터를 정말
                    삭제하시겠습니까?
                  </p>
                  <p>
                    멤버의 활동 이력도 함께 제거되며 이 작업은 되돌릴 수
                    없습니다.
                  </p>
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
