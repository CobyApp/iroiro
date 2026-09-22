"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HScroll } from "@/components/HScroll";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeriesOption } from "@/modules/products/lib/queries";
import { fetchExistingCards } from "@/modules/cards/actions";
import { cardFrontUrl, type Card } from "@/modules/cards/types";
import { kindLabelOf, sortKindKeys, type KindOption } from "@/modules/series/lib/kind-options";
import { createUsedListing } from "../actions";
import {
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_LABEL,
  USED_ITEM_TYPE_LABEL,
  USED_ITEM_TYPES,
  USED_SHIPPING_LABEL,
  USED_SHIPPING_METHODS,
  type UsedItemType,
  type UsedShippingMethod,
} from "../types";
import { UsedPhotoUpload, type UploadedUsedPhoto } from "./UsedPhotoUpload";

type TeamOpt = { id: number; name: string };
type MemberOpt = { id: number; name: string; teamIds: number[] };


// 중고 매물 등록 — 사진 → 카탈로그(그룹→멤버→종류→시리즈) → 상태·가격 → 배송.
// 시리즈를 고르면 일본 시세·중고 최근 거래가를 보여줘 가격 결정을 돕는다.
// 종류 라벨·순서는 DB(series_kind)에서 내려온 kinds 로 그린다 — /catalog/kinds 편집이 그대로 반영.
export function UsedListingForm({
  teams,
  members,
  seriesOptions,
  kinds: kindRows,
  fxRate100,
  usedSoldBySeries,
  publicBaseUrl,
}: {
  teams: TeamOpt[];
  members: MemberOpt[];
  seriesOptions: SeriesOption[];
  kinds: KindOption[];
  /** 100¥당 원 — 0이면 환산 생략 */
  fxRate100: number;
  /** seriesId → 최근 중고 완료 거래가(최신순) */
  usedSoldBySeries: Record<number, number[]>;
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [photos, setPhotos] = useState<UploadedUsedPhoto[]>([]);
  const [description, setDescription] = useState("");
  // 굿즈 종류 — 토레카(photocard)만 카탈로그 카드 흐름, 나머지는 제목·그룹·멤버 직접 입력.
  const [itemType, setItemType] = useState<UsedItemType>("photocard");
  const isToreca = itemType === "photocard";
  // 비-토레카 굿즈의 제목(토레카는 카드 이름 자동).
  const [title, setTitle] = useState("");
  // 토레카 마스터에서 고른 카드 — 제목·계층은 서버가 여기서 파생한다.
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsChecked, setCardsChecked] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<number | null>(null);
  const [condition, setCondition] = useState<string>("good");
  const [saleMode, setSaleMode] = useState<"fixed" | "auction">("fixed");
  const [price, setPrice] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [shippingMethod, setShippingMethod] =
    useState<UsedShippingMethod>("post");
  const [shippingFee, setShippingFee] = useState("0");

  const membersOfTeam = useMemo(
    () =>
      teamId === null
        ? []
        : members.filter((m) => m.teamIds.includes(teamId)),
    [members, teamId],
  );
  const kinds = useMemo(() => {
    const inTeam = seriesOptions.filter(
      (s) => teamId === null || s.teamId === teamId,
    );
    return sortKindKeys([...new Set(inTeam.map((s) => s.kind))], kindRows);
  }, [seriesOptions, teamId, kindRows]);
  const seriesOfKind = useMemo(
    () =>
      seriesOptions.filter(
        (s) =>
          (teamId === null || s.teamId === teamId) &&
          (kind === null || s.kind === kind),
      ),
    [seriesOptions, teamId, kind],
  );

  // 멤버·시리즈가 정해지면 카탈로그의 카드 목록을 불러온다.
  function loadCards(nextSeriesId: number | null, nextMemberId: number | null) {
    setSelectedCard(null);
    setCardsChecked(false);
    if (nextSeriesId === null && nextMemberId === null) {
      setCards([]);
      return;
    }
    startTransition(async () => {
      const result = await fetchExistingCards(nextSeriesId, nextMemberId);
      if (result.ok) {
        setCards(result.data);
        setCardsChecked(true);
      }
    });
  }

  const selectedSeries =
    seriesId !== null
      ? seriesOptions.find((s) => s.id === seriesId) ?? null
      : null;
  const marketKrw =
    selectedSeries && selectedSeries.marketAvgJpy > 0 && fxRate100 > 0
      ? Math.round((selectedSeries.marketAvgJpy * fxRate100) / 100 / 100) * 100
      : 0;
  const usedSold = seriesId !== null ? (usedSoldBySeries[seriesId] ?? []) : [];

  function submit() {
    const endsAtIso = endsAtLocal ? new Date(endsAtLocal).toISOString() : null;
    startTransition(async () => {
      if (isToreca && !selectedCard) return;
      if (!isToreca && title.trim() === "") return;
      const result = await createUsedListing({
        itemType,
        cardId: isToreca ? selectedCard!.id : null,
        title: isToreca ? null : title.trim(),
        teamId: isToreca ? null : teamId,
        memberId: isToreca ? null : memberId,
        seriesId: null,
        description: description || null,
        condition: condition as (typeof PRODUCT_CONDITIONS)[number],
        saleMode,
        price: saleMode === "fixed" ? Number(price) || null : null,
        auctionStartPrice:
          saleMode === "auction" ? Number(startPrice) || null : null,
        auctionEndsAt: saleMode === "auction" ? endsAtIso : null,
        shippingMethod,
        shippingFee: Number(shippingFee) || 0,
        photos: photos.map((p, i) => ({
          r2Key: p.r2Key,
          displayOrder: i,
          isPrimary: p.isPrimary,
        })),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("매물을 등록했어요");
      router.push(`/used/${result.data.id}`);
    });
  }

  const selectCls = "h-10 w-full";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">실물 사진</h2>
        <UsedPhotoUpload photos={photos} onChange={setPhotos} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">굿즈 종류</h2>
        <Select value={itemType} onValueChange={(v) => setItemType(v as UsedItemType)}>
          <SelectTrigger className={selectCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {USED_ITEM_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {USED_ITEM_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isToreca && (
          <p className="text-xs text-muted-foreground">
            토레카 외 굿즈는 카탈로그 카드가 없어요 — 제목과 그룹·멤버를 직접 입력해주세요.
          </p>
        )}
      </section>

      {isToreca ? (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">어떤 카드인가요?</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            value={teamId !== null ? String(teamId) : ""}
            onValueChange={(v) => {
              setTeamId(v ? Number(v) : null);
              setMemberId(null);
              setKind(null);
              setSeriesId(null);
              setCards([]);
              setCardsChecked(false);
              setSelectedCard(null);
            }}
          >
            <SelectTrigger className={selectCls}>
              <SelectValue placeholder="그룹" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={memberId !== null ? String(memberId) : ""}
            onValueChange={(v) => {
              const next = v ? Number(v) : null;
              setMemberId(next);
              loadCards(seriesId, next);
            }}
            disabled={teamId === null}
          >
            <SelectTrigger className={selectCls}>
              <SelectValue placeholder="멤버" />
            </SelectTrigger>
            <SelectContent>
              {membersOfTeam.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={kind ?? ""}
            onValueChange={(v) => {
              setKind(v || null);
              setSeriesId(null);
            }}
            disabled={teamId === null}
          >
            <SelectTrigger className={selectCls}>
              <SelectValue placeholder="종류" />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {kindLabelOf(kindRows, k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={seriesId !== null ? String(seriesId) : ""}
            onValueChange={(v) => {
              const next = v ? Number(v) : null;
              setSeriesId(next);
              loadCards(next, memberId);
            }}
            disabled={kind === null}
          >
            <SelectTrigger className={selectCls}>
              <SelectValue placeholder="시리즈" />
            </SelectTrigger>
            <SelectContent>
              {seriesOfKind.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.labelKo ?? s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* 카드 선택 — 토레카 등록과 같은 흐름: 카탈로그에서 실제 카드를 고른다. */}
        {cardsChecked && (
          cards.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                판매할 카드를 골라주세요 — 제목은 카드 이름으로 자동 지정돼요.
              </p>
              <HScroll className="scroll-x flex gap-2 overflow-x-auto pb-1">
                {cards.map((card) => {
                  const url = cardFrontUrl(card, publicBaseUrl);
                  const active = selectedCard?.id === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCard(card)}
                      className={`w-24 shrink-0 rounded-md border-2 p-1 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:border-border"
                      }`}
                      aria-pressed={active}
                    >
                      <span className="block aspect-[63/88] overflow-hidden rounded-sm border border-border bg-muted">
                        {url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={card.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[10px] leading-tight text-muted-foreground">
                        포즈 {card.pose} · {card.name}
                      </span>
                    </button>
                  );
                })}
              </HScroll>
            </div>
          ) : (
            <p className="rounded-sm border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              이 조건의 카드가 카탈로그에 아직 없어요 —{" "}
              <Link
                href="/cards/new"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                토레카 등록
              </Link>
              으로 먼저 제보해주세요 (승인되면 여기서 바로 고를 수 있어요).
            </p>
          )
        )}
        {selectedCard && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">매물 제목 (자동)</span>
            <p className="font-medium text-foreground">{selectedCard.name}</p>
          </div>
        )}
        {(marketKrw > 0 || usedSold.length > 0) && (
          <div className="rounded-sm border border-border bg-lilac/40 px-3 py-2 text-xs text-muted-foreground">
            {marketKrw > 0 && (
              <span>
                일본 시세 평균{" "}
                <b className="text-foreground">≈₩{marketKrw.toLocaleString()}</b>
              </span>
            )}
            {usedSold.length > 0 && (
              <span className={marketKrw > 0 ? "ml-3" : undefined}>
                이 시리즈 중고 최근 거래{" "}
                <b className="text-foreground">
                  ₩{usedSold[0].toLocaleString()}
                </b>
              </span>
            )}
          </div>
        )}
      </section>
      ) : (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">굿즈 정보</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">제목</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`예: ${USED_ITEM_TYPE_LABEL[itemType]} — 멤버명 / 시리즈`}
            maxLength={80}
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            value={teamId !== null ? String(teamId) : ""}
            onValueChange={(v) => {
              setTeamId(v ? Number(v) : null);
              setMemberId(null);
            }}
          >
            <SelectTrigger className={selectCls}>
              <SelectValue placeholder="그룹 (선택)" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={memberId !== null ? String(memberId) : ""}
            onValueChange={(v) => setMemberId(v ? Number(v) : null)}
            disabled={teamId === null}
          >
            <SelectTrigger className={selectCls}>
              <SelectValue placeholder="멤버 (선택)" />
            </SelectTrigger>
            <SelectContent>
              {membersOfTeam.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">실물 상태</h2>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="상태 설명 — 흠집·구매 시기·보관 방법 등을 적어주세요"
          rows={4}
        />
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger className={selectCls}>
            <SelectValue placeholder="상품 상태" />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_CONDITIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {PRODUCT_CONDITION_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">판매 방식</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["fixed", "auction"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSaleMode(mode)}
              className={`rounded-sm border px-3 py-2.5 text-sm font-medium transition-colors ${
                saleMode === mode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {mode === "fixed" ? "바로 판매" : "입찰 경매"}
            </button>
          ))}
        </div>
        {saleMode === "fixed" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">판매가 (원)</span>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder={marketKrw > 0 ? String(marketKrw) : "10000"}
            />
          </label>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">시작가 (원)</span>
              <Input
                value={startPrice}
                onChange={(e) =>
                  setStartPrice(e.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                placeholder={
                  marketKrw > 0 ? String(Math.round(marketKrw / 2 / 100) * 100) : "5000"
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">마감 시각</span>
              <Input
                type="datetime-local"
                value={endsAtLocal}
                onChange={(e) => setEndsAtLocal(e.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">배송</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            value={shippingMethod}
            onValueChange={(v) => setShippingMethod(v as UsedShippingMethod)}
          >
            <SelectTrigger className={selectCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USED_SHIPPING_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {USED_SHIPPING_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="block text-sm">
            <Input
              value={shippingFee}
              onChange={(e) =>
                setShippingFee(e.target.value.replace(/[^0-9]/g, ""))
              }
              inputMode="numeric"
              aria-label="배송비 (원, 0이면 포함)"
              placeholder="배송비 (0=포함)"
            />
          </label>
        </div>
        {shippingMethod === "post" && (
          <p className="text-xs text-muted-foreground">
            우체국 준등기 — 거래 확정 후 접수 QR이 자동 발급돼요(추후 연동, 현재
            체험판).
          </p>
        )}
      </section>

      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={submit}
        disabled={
          pending ||
          photos.length === 0 ||
          (isToreca ? selectedCard === null : title.trim() === "")
        }
      >
        {pending ? "등록 중…" : "매물 등록하기"}
      </Button>
    </div>
  );
}
