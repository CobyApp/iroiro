"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TeamCombobox } from "@/modules/teams/components/TeamCombobox";
import type { Team } from "@/modules/teams/types";
import { MemberCombobox } from "@/modules/members/components/MemberCombobox";
import type { MemberWithTeams } from "@/modules/members/types";
import type { SeriesOption } from "@/modules/series/lib/queries";
import { CatalogCardPicker } from "./CatalogCardPicker";
import { importCatalogCardPhoto } from "../actions";
import { todayKstYmd } from "@/lib/datetime";
import {
  createProduct,
  getExchangeRateForDate,
  updateProduct,
} from "../actions";
import { computeMargin } from "../lib/accounting";
import { ProductPhotoDownload } from "./ProductPhotoDownload";
import { ProductPhotoUpload } from "./ProductPhotoUpload";
import type { ProductCreateInput, ProductPhotoInput } from "../lib/schema";
import {
  AUCTION_STATUS_LABEL,
  ITEM_TYPES,
  ITEM_TYPE_LABEL,
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_LABEL,
  SALE_MODES,
  SALE_MODE_LABEL,
  SALE_STATUSES,
  SALE_STATUS_LABEL,
  type ItemType,
  type ProductCondition,
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
  mode: "new" | "edit";
  product?: ProductWithPhotos | null;
  teams: Team[];
  members: MemberWithTeams[];
  series: SeriesOption[];
  publicBaseUrl: string;
  catalogPublicBase: string;
};

export function ProductForm({
  mode,
  product,
  teams: initialTeams,
  members: initialMembers,
  series,
  publicBaseUrl,
  catalogPublicBase,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // 목록에서 전달한 필터·페이지·정렬 query를 그대로 보존해 돌아갈 URL을 구성.
  function backToList(): string {
    const qs = searchParams.toString();
    return `/admin/products${qs ? `?${qs}` : ""}`;
  }
  const teams = initialTeams;
  const members = initialMembers;
  const [itemCode, setItemCode] = useState(product?.itemCode ?? "");
  const [itemType, setItemType] = useState<ItemType>(
    product?.itemType ?? "photocard",
  );
  const [teamId, setTeamId] = useState<number | null>(product?.teamId ?? null);
  const [memberId, setMemberId] = useState<number | null>(
    product?.memberId ?? null,
  );
  const [seriesId, setSeriesId] = useState<number | null>(
    product?.seriesId ?? null,
  );
  const [catalogImporting, setCatalogImporting] = useState(false);
  // 단건 폼에서 카탈로그 카드를 골랐을 때의 출처 카드 id — 신규 등록에서만 전송(수정은 건드리지 않음).
  const [catalogCardId, setCatalogCardId] = useState<number | null>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [purchasePriceJpy, setPurchasePriceJpy] = useState(
    product?.purchasePriceJpy?.toString() ?? "0",
  );
  const [exchangeRate, setExchangeRate] = useState(
    product?.purchaseExchangeRate?.toString() ?? "925",
  );
  // 수정 모드는 기존 환율이 의도된 값이므로 자동 덮어쓰기 금지(touched).
  const [rateTouched, setRateTouched] = useState(mode === "edit");
  const [fxNote, setFxNote] = useState<string | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [purchaser, setPurchaser] = useState(product?.purchaser ?? "");
  const [purchaseDate, setPurchaseDate] = useState(
    product?.purchaseDate ?? todayKstYmd(),
  );
  const [listPrice, setListPrice] = useState(
    product?.regularPrice?.toString() ?? "0",
  );
  const [salePrice, setSalePrice] = useState(
    product?.salePrice?.toString() ?? "0",
  );
  // 사용자가 할인가를 직접 손대기 전에는 정가를 따라 자동 동기화.
  // 수정 모드는 기존 값이 의도된 입력이므로 처음부터 dirty 처리.
  const [salePriceTouched, setSalePriceTouched] = useState(mode === "edit");
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
  const [condition, setCondition] = useState<ProductCondition | "">(
    product?.condition ?? "",
  );
  const [packaging, setPackaging] = useState(
    product?.packagingCostKrw?.toString() ?? "0",
  );
  const [overseasShipping, setOverseasShipping] = useState(
    product?.overseasShippingKrw?.toString() ?? "0",
  );
  const [domesticShipping, setDomesticShipping] = useState(
    product?.domesticShippingKrw?.toString() ?? "0",
  );
  const [otherCost, setOtherCost] = useState(
    product?.otherCostKrw?.toString() ?? "0",
  );
  const [photos, setPhotos] = useState<ProductPhotoInput[]>(
    product?.photos.map((photo) => ({
      r2Key: photo.r2Key,
      altText: photo.altText,
      displayOrder: photo.displayOrder,
      isThumbnail: photo.isThumbnail,
    })) ?? [],
  );

  function fxNoteText(r: {
    date: string;
    requestedDate: string;
    source: string;
  }): string {
    return r.date === r.requestedDate
      ? `${r.date} 기준 환율 · ${r.source}`
      : `${r.requestedDate}은 휴장일 → ${r.date} 기준 적용 · ${r.source}`;
  }

  // 매입일 기준 환율 자동 적용. manual=true면 사용자가 직접 수정한 값도 덮어쓴다.
  async function loadRate(date: string, manual = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (!manual && rateTouched) return;
    setRateLoading(true);
    try {
      const result = await getExchangeRateForDate(date);
      if (!result.ok) {
        setFxNote(result.message);
        return;
      }
      setExchangeRate(String(result.data.rate));
      setRateTouched(false);
      setFxNote(fxNoteText(result.data));
    } catch (error) {
      setFxNote(error instanceof Error ? error.message : "환율 조회 실패");
    } finally {
      setRateLoading(false);
    }
  }

  // 신규 등록: 매입일 기본값(오늘) 기준 환율을 최초 1회 자동 조회.
  useEffect(() => {
    if (mode !== "new") return;
    let cancelled = false;
    getExchangeRateForDate(purchaseDate)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setFxNote(result.message);
          return;
        }
        setExchangeRate(String(result.data.rate));
        setFxNote(fxNoteText(result.data));
      })
      .catch((error) => {
        if (cancelled) return;
        setFxNote(error instanceof Error ? error.message : "환율 조회 실패");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const purchaseKrw =
    Math.round(
      (Number(purchasePriceJpy || 0) * Number(exchangeRate || 0)) / 100,
    ) || 0;

  const packagingKrw = Number(packaging || 0);
  const overseasKrw = Number(overseasShipping || 0);
  const domesticKrw = Number(domesticShipping || 0);
  const otherKrw = Number(otherCost || 0);
  const effectiveSale = salePrice ? Number(salePrice) : Number(listPrice || 0);
  const { totalCost, profit, marginRate } = computeMargin(effectiveSale, {
    purchasePriceKrw: purchaseKrw,
    packagingCostKrw: packagingKrw,
    overseasShippingKrw: overseasKrw,
    domesticShippingKrw: domesticKrw,
    otherCostKrw: otherKrw,
  });

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
      // 신규 등록만 출처 카드를 심는다. 수정에서는 undefined 로 두어 기존 값을 보존한다.
      catalogCardId: mode === "new" ? catalogCardId : undefined,
      name,
      description: description || null,
      purchasePriceJpy: Number(purchasePriceJpy),
      purchaseExchangeRate: Number(exchangeRate),
      purchasePriceKrw: purchaseKrw,
      packagingCostKrw: packagingKrw,
      overseasShippingKrw: overseasKrw,
      domesticShippingKrw: domesticKrw,
      otherCostKrw: otherKrw,
      purchaser: purchaser.trim() === "" ? null : purchaser.trim(),
      purchaseDate,
      regularPrice: isAuction ? startPrice : Number(listPrice),
      // salePrice는 DB NOT NULL — 비워두면 정가와 동일하게 보낸다.
      salePrice: isAuction
        ? startPrice
        : salePrice
          ? Number(salePrice)
          : Number(listPrice),
      condition: condition === "" ? null : condition,
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
      if (mode === "new") {
        const result = await createProduct(payload);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        router.push(backToList());
        return;
      }
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
            <CardTitle>식별</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                판매할 토레카를 카탈로그에서 고르면 그룹·멤버·시리즈·이름·정가·사진이 한 번에 채워져요.
              </p>
              <div className="mt-2">
                <CatalogCardPicker
                  teams={teams}
                  members={members}
                  series={series}
                  catalogPublicBase={catalogPublicBase}
                  onPick={(card) => {
                    setCatalogCardId(card.id);
                    setTeamId(card.teamId);
                    setMemberId(card.memberId);
                    setSeriesId(card.seriesId);
                    setItemType(card.itemType as ItemType);
                    if (card.itemCode) setItemCode(card.itemCode);
                    setName(card.name);
                    if (card.retailPriceJpy > 0 && (listPrice === "0" || listPrice === "")) {
                      // 정가(엔)는 참고용 — 판매가는 관리자가 원화로 정한다. 여기선 이름·식별만 채우고
                      // 가격은 매입 정보에서 계산되므로 건드리지 않는다.
                    }
                    setCatalogImporting(true);
                    void (async () => {
                      const res = await importCatalogCardPhoto({ cardId: card.id });
                      if (res.ok) {
                        setPhotos((prev) => [
                          ...prev,
                          {
                            r2Key: res.data.r2Key,
                            altText: null,
                            displayOrder: prev.length,
                            isThumbnail: prev.length === 0,
                          },
                        ]);
                        toast.success("토레카 정보와 사진을 불러왔어요");
                      } else {
                        toast.error(res.message);
                      }
                      setCatalogImporting(false);
                    })();
                  }}
                />
              </div>
              {seriesId != null && (
                <p className="mt-2 text-xs text-primary">
                  시리즈 연결됨 · {series.find((s) => s.id === seriesId)?.label ?? `#${seriesId}`}
                  {catalogImporting && " · 사진 불러오는 중…"}
                </p>
              )}
            </div>
            <div>
              <Label>그룹</Label>
              <TeamCombobox
                teams={teams}
                value={teamId}
                onChange={(id) => {
                  setTeamId(id);
                  setMemberId(null);
                }}
              />
            </div>
            <div>
              <Label>멤버</Label>
              <MemberCombobox
                members={members}
                teamId={teamId}
                value={memberId}
                onChange={setMemberId}
              />
            </div>
            <div>
              <Label>
                아이템 구분 <span className="text-destructive">*</span>
              </Label>
              <Select value={itemType} onValueChange={(value) => setItemType(value as ItemType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ITEM_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="name">
                상품명 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="item-code">
                아이템 코드{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  — 외부 식별 코드 (선택)
                </span>
              </Label>
              <Input
                id="item-code"
                value={itemCode}
                onChange={(event) => setItemCode(event.target.value)}
                placeholder="예: TRCD-NJZ-MNZ-001"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>가격 · 재고</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <Label htmlFor="jpy">
                  매입가 (JPY) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="jpy"
                  type="number"
                  value={purchasePriceJpy}
                  onChange={(event) => setPurchasePriceJpy(event.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="rate">
                    환율 (100¥ = ?₩){" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => void loadRate(purchaseDate, true)}
                    disabled={rateLoading}
                    className="text-xs font-medium text-primary underline underline-offset-2 disabled:opacity-50"
                  >
                    {rateLoading ? "조회 중…" : "매입일 환율 적용"}
                  </button>
                </div>
                <Input
                  id="rate"
                  type="number"
                  step="0.0001"
                  value={exchangeRate}
                  onChange={(event) => {
                    setExchangeRate(event.target.value);
                    setRateTouched(true);
                    setFxNote(null);
                  }}
                />
              </div>
              <div>
                <Label>매입가 (KRW)</Label>
                <Input value={purchaseKrw.toLocaleString()} disabled readOnly />
              </div>
            </div>
            {fxNote && (
              <p className="-mt-1 text-xs text-muted-foreground">{fxNote}</p>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">
                부대비용 (KRW) — 총원가·마진에 반영
              </Label>
              <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div>
                  <Label htmlFor="pkg" className="text-xs">
                    포장비
                  </Label>
                  <Input
                    id="pkg"
                    type="number"
                    value={packaging}
                    onChange={(e) => setPackaging(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="oss" className="text-xs">
                    해외배송
                  </Label>
                  <Input
                    id="oss"
                    type="number"
                    value={overseasShipping}
                    onChange={(e) => setOverseasShipping(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="dss" className="text-xs">
                    국내배송
                  </Label>
                  <Input
                    id="dss"
                    type="number"
                    value={domesticShipping}
                    onChange={(e) => setDomesticShipping(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="etc" className="text-xs">
                    기타
                  </Label>
                  <Input
                    id="etc"
                    type="number"
                    value={otherCost}
                    onChange={(e) => setOtherCost(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">총원가</span>
                <b>₩{totalCost.toLocaleString()}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  예상 마진 (판매가 기준)
                </span>
                <b className={profit >= 0 ? "text-primary" : "text-destructive"}>
                  ₩{profit.toLocaleString()} ({marginRate}%)
                </b>
              </div>
            </div>
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

        <Card>
          <CardHeader>
            <CardTitle>매입 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="purchase-date">
                매입일 <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                id="purchase-date"
                value={purchaseDate || null}
                onChange={(next) => {
                  const value = next ?? "";
                  setPurchaseDate(value);
                  // 매입일이 바뀌면 (사용자가 환율을 직접 안 만졌을 때) 그 날짜 환율 자동 적용.
                  if (value) void loadRate(value);
                }}
                placeholder="매입일 선택"
              />
            </div>
            <div>
              <Label htmlFor="purchaser">
                매입자{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  — 매입자별 정산에 사용 (선택)
                </span>
              </Label>
              <Input
                id="purchaser"
                value={purchaser}
                onChange={(event) => setPurchaser(event.target.value)}
                placeholder="예: 코비, 미나미"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>부가 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>컨디션</Label>
              <Select
                value={condition === "" ? "__unset__" : condition}
                onValueChange={(value) =>
                  setCondition(
                    value === "__unset__" ? "" : (value as ProductCondition),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택 (생략 가능)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">선택 안 함</SelectItem>
                  {PRODUCT_CONDITIONS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {PRODUCT_CONDITION_LABEL[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="desc">설명</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
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
        {mode === "edit" && product && product.photos.length > 0 && (
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
          {mode === "new" ? "등록" : "저장"}
        </Button>
      </div>
    </div>
  );
}
