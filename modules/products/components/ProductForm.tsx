"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import type { SeriesOption } from "@/modules/series/lib/queries";
import { updateProduct } from "../actions";
import type { ProductCreateInput, ProductPhotoInput } from "../lib/schema";
import {
  SALE_STATUSES,
  SALE_STATUS_LABEL,
  type ItemType,
  type ProductWithPhotos,
  type SaleStatus,
} from "../types";

// 스토어 상품 = 토레카 카드(1:1). 이름·그룹·멤버·시리즈·이미지는 토레카 관리(card)가 소유해
// 실시간 반영되고, 상품 편집에선 가격·재고·판매 상태만 바꾼다. 판매 방식은 고정가 전용(경매 없음).
type Props = {
  product?: ProductWithPhotos | null;
  teams: Team[];
  members: MemberWithTeams[];
  series: SeriesOption[];
};

export function ProductForm({
  product,
  teams,
  members,
  series,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // 목록에서 전달한 필터·페이지·정렬 query를 그대로 보존해 돌아갈 URL을 구성.
  function backToList(): string {
    const qs = searchParams.toString();
    return `/delivery/products${qs ? `?${qs}` : ""}`;
  }

  // 토레카 정보는 card 가 소유(읽기전용). 저장 시 기존값을 그대로 실어 서버가 비우지 않게 한다.
  const itemCode = product?.itemCode ?? "";
  const itemType: ItemType = product?.itemType ?? "photocard";
  const teamId = product?.teamId ?? null;
  const memberId = product?.memberId ?? null;
  const seriesId = product?.seriesId ?? null;
  const name = product?.name ?? "";
  // 사진은 card 앞면(cards/wm)을 참조 — 편집 불가, 저장 시 기존값 유지.
  const photos: ProductPhotoInput[] =
    product?.photos.map((photo) => ({
      r2Key: photo.r2Key,
      altText: photo.altText,
      displayOrder: photo.displayOrder,
      isThumbnail: photo.isThumbnail,
    })) ?? [];

  const [listPrice, setListPrice] = useState(
    product?.regularPrice?.toString() ?? "0",
  );
  const [salePrice, setSalePrice] = useState(
    product?.salePrice?.toString() ?? "0",
  );
  const [salePriceTouched, setSalePriceTouched] = useState(true);
  const [stock, setStock] = useState(product?.stockQuantity?.toString() ?? "0");
  const [saleStatus, setSaleStatus] = useState<SaleStatus>(
    product?.saleStatus ?? "draft",
  );

  function buildPayload(): ProductCreateInput {
    const trimmedCode = itemCode.trim();
    return {
      // 스토어는 고정가 전용 — 경매 필드는 항상 비운다.
      saleMode: "fixed",
      auctionStartPrice: null,
      auctionEndsAt: null,
      itemCode: trimmedCode === "" ? null : trimmedCode,
      itemType,
      teamId,
      memberId,
      seriesId,
      // 출처 카드(catalog_card_id)는 수정하지 않는다 — undefined 로 기존 값 보존.
      catalogCardId: undefined,
      name,
      regularPrice: Number(listPrice),
      // salePrice는 DB NOT NULL — 비워두면 정가와 동일하게 보낸다.
      salePrice: salePrice ? Number(salePrice) : Number(listPrice),
      stockQuantity: Number(stock),
      saleStatus,
      photos,
    };
  }

  function onSubmit() {
    startTransition(async () => {
      const payload = buildPayload();
      if (product) {
        const result = await updateProduct({ id: product.id, ...payload });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
      }
      router.push(backToList());
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>토레카 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          <p className="text-xs text-muted-foreground">
            이름·그룹·멤버·시리즈·사진은 토레카 관리에서 수정하면 실시간 반영돼요. 여기선
            가격·재고·판매 상태만 바꿀 수 있어요.
          </p>
          <dl className="grid grid-cols-1 gap-1.5">
            {[
              ["상품명", name || "-"],
              ["그룹", teams.find((t) => t.id === teamId)?.name ?? "-"],
              ["멤버", members.find((m) => m.id === memberId)?.name ?? "-"],
              ["시리즈", series.find((s) => s.id === seriesId)?.label ?? "-"],
              ...(itemCode ? ([["아이템 코드", itemCode]] as [string, string][]) : []),
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>가격 · 재고</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <Label htmlFor="list">
                정가 (KRW) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="list"
                type="number"
                value={listPrice}
                onChange={(event) => {
                  const next = event.target.value;
                  setListPrice(next);
                  if (!salePriceTouched) setSalePrice(next);
                }}
              />
            </div>
            <div>
              <Label htmlFor="sale">
                할인가 (KRW){" "}
                <span className="text-xs font-normal text-muted-foreground">
                  — 비워두면 정가와 동일
                </span>
              </Label>
              <Input
                id="sale"
                type="number"
                value={salePrice}
                placeholder={listPrice || "정가와 동일"}
                onChange={(event) => {
                  setSalePrice(event.target.value);
                  setSalePriceTouched(true);
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <Label htmlFor="stock">
                재고 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="stock"
                type="number"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
              />
            </div>
            <div>
              <Label>
                판매 상태 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={saleStatus}
                onValueChange={(value) => setSaleStatus(value as SaleStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {SALE_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-border bg-card/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgb(0_0_0/0.04)] backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(backToList())}
          disabled={pending}
        >
          취소
        </Button>
        <Button type="button" onClick={onSubmit} disabled={pending}>
          저장
        </Button>
      </div>
    </div>
  );
}
