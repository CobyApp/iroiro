"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createBuyRequest } from "../buy-actions";
import {
  BUY_REQUEST_DESC_MAX,
  BUY_REQUEST_TITLE_MAX,
} from "../lib/buy-schema";
import {
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_LABEL,
  type ProductCondition,
} from "@/modules/products/types";
import { USED_ITEM_TYPE_LABEL, type UsedItemType } from "../types";
import {
  BuyRequestPhotoUpload,
  type UploadedBuyPhoto,
} from "./BuyRequestPhotoUpload";

type TeamOpt = { id: number; name: string };
type MemberOpt = { id: number; name: string; teamIds: number[] };
type SeriesOpt = { id: number; label: string; teamId: number | null };

const selectClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/50";

export function BuyRequestForm({
  teams,
  members,
  seriesOptions,
}: {
  teams: TeamOpt[];
  members: MemberOpt[];
  seriesOptions: SeriesOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [itemType, setItemType] = useState<UsedItemType>("photocard");
  const [teamId, setTeamId] = useState<number | "">("");
  const [memberId, setMemberId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [seriesId, setSeriesId] = useState<number | "">("");
  const [minCondition, setMinCondition] = useState<string>("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<UploadedBuyPhoto[]>([]);

  const teamMembers = useMemo(
    () => (teamId === "" ? [] : members.filter((m) => m.teamIds.includes(Number(teamId)))),
    [teamId, members],
  );
  // 시리즈는 토레카(photocard)만. 그룹을 고르면 그 그룹 시리즈로 좁힌다(그룹 미선택 시 전체).
  const isPhotocard = itemType === "photocard";
  const seriesChoices = useMemo(
    () =>
      isPhotocard
        ? seriesOptions.filter((s) => teamId === "" || s.teamId === Number(teamId))
        : [],
    [isPhotocard, seriesOptions, teamId],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력해주세요");
      return;
    }
    const budgetNum = budget.trim() ? Number(budget) : null;
    if (budgetNum !== null && (!Number.isFinite(budgetNum) || budgetNum <= 0)) {
      toast.error("예산을 정확히 입력해주세요");
      return;
    }
    const qtyNum = Math.max(1, Number(quantity) || 1);
    startTransition(async () => {
      const result = await createBuyRequest({
        itemType,
        teamId: teamId === "" ? null : Number(teamId),
        memberId: memberId === "" ? null : Number(memberId),
        seriesId: isPhotocard && seriesId !== "" ? Number(seriesId) : null,
        title: title.trim(),
        description: description.trim() || null,
        minCondition: (minCondition || null) as ProductCondition | null,
        budget: budgetNum,
        quantity: qtyNum,
        photos: photos.map((p, i) => ({ r2Key: p.r2Key, displayOrder: i })),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("삽니다 요청을 올렸어요");
      router.push(`/used/wanted/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="buy-title">
          제목 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="buy-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 르세라핌 카즈하 미공포 삽니다"
          maxLength={BUY_REQUEST_TITLE_MAX}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="buy-item">종류</Label>
          <select
            id="buy-item"
            className={selectClass}
            value={itemType}
            onChange={(e) => {
              setItemType(e.target.value as UsedItemType);
              setSeriesId("");
            }}
          >
            {(Object.keys(USED_ITEM_TYPE_LABEL) as UsedItemType[]).map((t) => (
              <option key={t} value={t}>
                {USED_ITEM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="buy-condition">최소 상태</Label>
          <select
            id="buy-condition"
            className={selectClass}
            value={minCondition}
            onChange={(e) => setMinCondition(e.target.value)}
          >
            <option value="">상관없음</option>
            {PRODUCT_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {PRODUCT_CONDITION_LABEL[c]} 이상
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="buy-team">그룹 (선택)</Label>
          <select
            id="buy-team"
            className={selectClass}
            value={teamId}
            onChange={(e) => {
              const v = e.target.value === "" ? "" : Number(e.target.value);
              setTeamId(v);
              setMemberId("");
              setSeriesId("");
            }}
          >
            <option value="">전체</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="buy-member">멤버 (선택)</Label>
          <select
            id="buy-member"
            className={selectClass}
            value={memberId}
            onChange={(e) => setMemberId(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={teamId === "" || teamMembers.length === 0}
          >
            <option value="">전체</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 시리즈(특정 카드)는 토레카일 때만. */}
      {isPhotocard && seriesChoices.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="buy-series">시리즈 (선택)</Label>
          <select
            id="buy-series"
            className={selectClass}
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">지정 안 함</option>
            {seriesChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {teamId === "" && (
            <p className="text-xs text-muted-foreground">그룹을 고르면 시리즈를 좁혀서 볼 수 있어요.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="buy-budget">희망 예산 (원, 개당)</Label>
          <Input
            id="buy-budget"
            type="number"
            inputMode="numeric"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="비우면 협의"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="buy-qty">수량</Label>
          <Input
            id="buy-qty"
            type="number"
            inputMode="numeric"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="buy-desc">상세 설명 (선택)</Label>
        <Textarea
          id="buy-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="원하는 상태·버전·거래 조건 등을 적어주세요"
          rows={5}
          maxLength={BUY_REQUEST_DESC_MAX}
        />
      </div>

      <div className="space-y-2">
        <Label>참고 이미지 (선택)</Label>
        <BuyRequestPhotoUpload photos={photos} onChange={setPhotos} />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "등록 중..." : "삽니다 등록"}
      </Button>
    </form>
  );
}
