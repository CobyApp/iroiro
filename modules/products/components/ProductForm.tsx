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
import { ProductPhotoDownload } from "./ProductPhotoDownload";
import { ProductPhotoUpload } from "./ProductPhotoUpload";
import type { ProductCreateInput, ProductPhotoInput } from "../lib/schema";
import {
  AUCTION_STATUS_LABEL,
  ITEM_TYPE_LABEL,
  SALE_MODES,
  SALE_MODE_LABEL,
  SALE_STATUSES,
  SALE_STATUS_LABEL,
  type ItemType,
  type ProductWithPhotos,
  type SaleMode,
  type SaleStatus,
} from "../types";

// ISO(UTC) → datetime-local 입력값(관리자 브라우저 로컬 시각) 변환.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  product?: ProductWithPhotos | null;
  teams: Team[];
  members: MemberWithTeams[];
  series: SeriesOption[];
  publicBaseUrl: string;
};

export function ProductForm({
  product,
  teams: initialTeams,
  members: initialMembers,
  series,
  publicBaseUrl,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // 목록에서 전달한 필터·페이지·정렬 query를 그대로 보존해 돌아갈 URL을 구성.
  function backToList(): string {
    const qs = searchParams.toString();
    return `/delivery/products${qs ? `?${qs}` : ""}`;
  }
  const teams = initialTeams;
  const members = initialMembers;
  // 토레카 정보(이름·그룹·멤버·시리즈·종류·아이템코드)는 카탈로그(card)가 소유한다 — 편집 불가·읽기전용.
  // 저장 시 update payload 에 기존값을 그대로 실어 서버가 비우지 않게 한다.
  const itemCode = product?.itemCode ?? "";
  const itemType: ItemType = product?.itemType ?? "photocard";
  const teamId = product?.teamId ?? null;
  const memberId = product?.memberId ?? null;
  const seriesId = product?.seriesId ?? null;
  const name = product?.name ?? "";
  const [listPrice, setListPrice] = useState(
    product?.regularPrice?.toString() ?? "0",
  );
  const [salePrice, setSalePrice] = useState(
    product?.salePrice?.toString() ?? "0",
  );
  // 사용자가 할인가를 직접 손대기 전에는 정가를 따라 자동 동기화.
  // 수정 모드는 기존 값이 의도된 입력이므로 처음부터 dirty 처리.
  const [salePriceTouched, setSalePriceTouched] = useState(true);
  const [stock, setStock] = useState(product?.stockQuantity?.toString() ?? "0");
  const [saleStatus, setSaleStatus] = useState<SaleStatus>(
    product?.saleStatus ?? "draft",
  );
  // 판매 방식 — 경매면 시작가·마감시각 필수, 재고 1 고정(서버에서 강제).
  const [saleMode, setSaleMode] = useState<SaleMode>(
    product?.saleMode ?? "fixed",
  );
  const [auctionStartPrice, setAuctionStartPrice] = useState(
    product?.auctionStartPrice?.toString() ?? "",
  );
  const [auctionEndsLocal, setAuctionEndsLocal] = useState(
    isoToLocalInput(product?.auctionEndsAt ?? null),
  );
  const auctionLocked = (product?.auctionBidCount ?? 0) > 0;
  const [photos, setPhotos] = useState<ProductPhotoInput[]>(
    product?.photos.map((photo) => ({
      r2Key: photo.r2Key,
      altText: photo.altText,
      displayOrder: photo.displayOrder,
      isThumbnail: photo.isThumbnail,
    })) ?? [],
  );

  function buildPayload(): ProductCreateInput {
    const trimmedCode = itemCode.trim();
    const isAuction = saleMode === "auction";
    // 경매는 정가/판매가/재고를 서버가 시작가 기준으로 강제하지만, 스키마
    // 필수값이라 시작가로 채워 보낸다.
    const startPrice = Number(auctionStartPrice) || 0;
    return {
      saleMode,
      auctionStartPrice: isAuction ? startPrice : null,
      auctionEndsAt:
        isAuction && auctionEndsLocal
          ? new Date(auctionEndsLocal).toISOString()
          : null,
      itemCode: trimmedCode === "" ? null : trimmedCode,
      itemType,
      teamId,
      memberId,
      seriesId,
      // 출처 카드(catalog_card_id)는 수정하지 않는다 — undefined 로 기존 값 보존.
      catalogCardId: undefined,
      name,
      regularPrice: isAuction ? startPrice : Number(listPrice),
      // salePrice는 DB NOT NULL — 비워두면 정가와 동일하게 보낸다.
      salePrice: isAuction
        ? startPrice
        : salePrice
          ? Number(salePrice)
          : Number(listPrice),
      stockQuantity: isAuction ? 1 : Number(stock),
      saleStatus,
      photos,
    };
  }

  function onSubmit() {
    if (saleMode === "auction") {
      if (!Number(auctionStartPrice) || Number(auctionStartPrice) <= 0) {
        toast.error("경매 시작가를 입력해 주세요.");
        return;
      }
      if (!auctionEndsLocal) {
        toast.error("경매 마감 시각을 선택해 주세요.");
        return;
      }
    }
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

  // 문서 스크롤 한 개만 쓴다(내부 overflow 컨테이너 없음) — 여백은 페이지 래퍼(AdminPage)가 준다.
  // 하단 액션 바는 sticky로 화면 아래에 붙어, 긴 폼에서도 저장 버튼이 항상 손에 닿는다.
  return (
    <div className="space-y-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>토레카 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <p className="text-xs text-muted-foreground">
              이름·그룹·멤버·시리즈·종류는 토레카 관리에서 수정하면 실시간 반영돼요. 여기선
              가격·재고·판매 상태와 사진만 바꿀 수 있어요.
            </p>
            <dl className="grid grid-cols-1 gap-1.5">
              {[
                ["상품명", name || "-"],
                ["그룹", teams.find((t) => t.id === teamId)?.name ?? "-"],
                ["멤버", members.find((m) => m.id === memberId)?.name ?? "-"],
                ["시리즈", series.find((s) => s.id === seriesId)?.label ?? "-"],
                ["구분", ITEM_TYPE_LABEL[itemType]],
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
                <Label>
                  판매 방식 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={saleMode}
                  onValueChange={(value) => setSaleMode(value as SaleMode)}
                  disabled={auctionLocked}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALE_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {SALE_MODE_LABEL[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {saleMode === "auction" && product?.auctionStatus && (
                <div>
                  <Label>경매 상태</Label>
                  <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm">
                    {AUCTION_STATUS_LABEL[product.auctionStatus]}
                    {product.auctionCurrentPrice !== null && (
                      <span className="text-muted-foreground">
                        · 현재가 ₩{product.auctionCurrentPrice.toLocaleString()}{" "}
                        · 입찰 {product.auctionBidCount}건
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {saleMode === "auction" && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="min-w-0">
                    <Label htmlFor="auction-start">
                      경매 시작가 (KRW) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="auction-start"
                      type="number"
                      value={auctionStartPrice}
                      onChange={(event) => setAuctionStartPrice(event.target.value)}
                      disabled={auctionLocked}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="auction-ends">
                      마감 시각 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="auction-ends"
                      type="datetime-local"
                      value={auctionEndsLocal}
                      onChange={(event) => setAuctionEndsLocal(event.target.value)}
                      // datetime-local은 고유 최소폭이 커서 모바일 그리드를 밀어낸다.
                      className="w-full min-w-0 max-w-full"
                    />
                    {/* 입찰 기간 프리셋 — 지금 기준 +기간으로 마감 시각을 채운다. */}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(
                        [
                          ["12시간", 12],
                          ["1일", 24],
                          ["3일", 72],
                          ["5일", 120],
                          ["7일", 168],
                        ] as const
                      ).map(([label, hours]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setAuctionEndsLocal(
                              isoToLocalInput(
                                new Date(
                                  Date.now() + hours * 3600_000,
                                ).toISOString(),
                              ),
                            )
                          }
                          className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                        >
                          +{label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  경매 상품은 재고 1개 고정 · 최소 인상폭 자동(₩500/1,000/5,000) ·
                  마감 5분 전 입찰 시 5분 자동연장 · 낙찰 시 판매가가 낙찰가로
                  갱신됩니다.
                  {auctionLocked &&
                    " 입찰이 시작되어 시작가·판매 방식은 변경할 수 없어요(마감 연장은 가능)."}
                </p>
              </div>
            )}
            <div
              className={`grid grid-cols-1 gap-2 md:grid-cols-2 ${saleMode === "auction" ? "hidden" : ""}`}
            >
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
                    // 사용자가 할인가를 따로 손대지 않은 상태면 정가와 동기화.
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
              <div className={saleMode === "auction" ? "hidden" : ""}>
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

      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>사진</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductPhotoUpload
              photos={photos}
              onChange={setPhotos}
              publicBaseUrl={publicBaseUrl}
            />
          </CardContent>
        </Card>
        {product && product.photos.length > 0 && (
          <ProductPhotoDownload product={product} />
        )}
      </div>

        </div>

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
