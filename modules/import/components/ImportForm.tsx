"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProductFromImport } from "@/modules/import/actions";
import type { ImportPrefill } from "@/modules/import/lib/mapping";

const STATUSES = [
  { v: "draft", label: "임시저장" },
  { v: "active", label: "판매중" },
  { v: "archived", label: "보관" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function ImportForm({
  externalId,
  prefill,
  defaultPrice = 0,
  members,
  frontUrl,
  backUrl,
}: {
  externalId: number;
  prefill: ImportPrefill;
  // 시세(엔) → 현재 환율 → 500원 반올림한 판매가 프리필(0이면 미정).
  defaultPrice?: number;
  members: { id: number; name: string }[];
  frontUrl: string;
  backUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(prefill.name);
  const [itemCode, setItemCode] = useState(prefill.itemCode);
  const [description, setDescription] = useState(prefill.description);
  const [memberId, setMemberId] = useState(
    prefill.memberId ? String(prefill.memberId) : "",
  );
  const [regularPrice, setRegularPrice] = useState(
    defaultPrice > 0 ? String(defaultPrice) : "",
  );
  const [salePrice, setSalePrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("1");
  const [saleStatus, setSaleStatus] = useState("draft");
  const [purchaseDate, setPurchaseDate] = useState("");

  function handleSubmit() {
    const reg = Number(regularPrice);
    const sale = Number(salePrice || regularPrice);
    if (!name.trim()) return toast.info("상품명을 입력해 주세요.");
    if (!Number.isFinite(reg) || reg < 0) return toast.info("정가를 입력해 주세요.");
    if (sale > reg) return toast.info("할인가는 정가 이하여야 해요.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate))
      return toast.info("매입일을 선택해 주세요.");

    startTransition(async () => {
      try {
        const { id } = await createProductFromImport({
          externalId,
          name: name.trim(),
          itemCode: itemCode.trim() || null,
          itemType: "photocard",
          saleMode: "fixed",
          teamId: prefill.teamId,
          // 미선택이면 서버가 카드 정보로 그룹·멤버를 자동 생성해 매핑한다.
          memberId: memberId ? Number(memberId) : null,
          description: description.trim() || null,
          regularPrice: reg,
          salePrice: sale,
          purchasePriceJpy: 0,
          purchaseExchangeRate: 1,
          purchasePriceKrw: 0,
          packagingCostKrw: 0,
          overseasShippingKrw: 0,
          domesticShippingKrw: 0,
          otherCostKrw: 0,
          purchaser: null,
          purchaseDate,
          condition: null,
          stockQuantity: Number(stockQuantity) || 0,
          saleStatus: saleStatus as "draft" | "active" | "archived",
        });
        toast.success("상품으로 등록했어요.");
        router.push(`/admin/products/${id}/edit`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "등록에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        <div className="aspect-[3/4] overflow-hidden rounded-md border border-border bg-lilac shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- 외부 이미지 미리보기 */}
          <img src={frontUrl} alt="" className="h-full w-full object-cover" />
        </div>
        {backUrl && (
          <div className="aspect-[3/4] w-1/2 overflow-hidden rounded-sm border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 이미지 미리보기 */}
            <img src={backUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          시세 ¥{prefill.marketAvgJpy.toLocaleString()} · 정가 ¥
          {prefill.retailJpy.toLocaleString()}
          <br />
          저장 시 이미지가 우리 저장소로 복사돼요.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="상품명">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="멤버">
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="자동 (없으면 새로 생성)" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!memberId && (
              <p className="text-xs text-muted-foreground">
                비워두면 ‘{prefill.autoMemberName}’ 멤버
                {prefill.teamId === null
                  ? `와 ‘${prefill.autoTeamName}’ 그룹을`
                  : "를"}{" "}
                자동 생성해 연결해요.
              </p>
            )}
          </Field>
          <Field label="시리얼(SKU)">
            <Input
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
            />
          </Field>
        </div>
        <Field label="설명">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="정가 (₩)">
            <Input
              type="number"
              value={regularPrice}
              onChange={(e) => setRegularPrice(e.target.value)}
            />
          </Field>
          <Field label="판매가 (₩, 비우면 정가)">
            <Input
              type="number"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="재고">
            <Input
              type="number"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
            />
          </Field>
          <Field label="매입일">
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </Field>
          <Field label="상태">
            <Select value={saleStatus} onValueChange={setSaleStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.v} value={s.v}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "등록 중…" : "상품으로 등록"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push("/admin/import")}
            disabled={pending}
          >
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
