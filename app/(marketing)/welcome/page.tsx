import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/modules/ui/components/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/modules/products/components/ProductImage";
import { listProducts } from "@/modules/products/lib/queries";
import { productGridPhotoUrl } from "@/modules/products/lib/customer-media";
import {
  AlbumIcon,
  BellIcon,
  GiftIcon,
  HeartIcon,
  ShieldIcon,
  SparkleIcon,
  TruckIcon,
} from "@/modules/marketing/components/icons";

export const metadata: Metadata = {
  title: "이로이로 — 일본 아이돌 포토카드, 한국에서",
  description:
    "일본 아이돌 포토카드를 국내 재고로 빠르게 — 현지 가격 수준, 해외배송비 없이.",
};

// 메인 CTA는 하나 — 가입 강요 없이 비로그인 그대로 쇼핑으로.
const BROWSE_HREF = "/products";

export default async function WelcomePage() {
  // 마키 갤러리 — 공개된 판매중 상품의 워터마크 이미지만 사용.
  const { items } = await listProducts({
    saleStatus: "active",
    sort: "newest",
    pageSize: 40,
    page: 1,
  });
  const imgs = items
    .map((p) => {
      const t = p.photos.find((ph) => ph.isThumbnail) ?? p.photos[0];
      return t ? { src: productGridPhotoUrl(t.id), alt: p.name } : null;
    })
    .filter((x): x is { src: string; alt: string } => x !== null);
  const rowA = imgs.filter((_, i) => i % 2 === 0);
  const rowB = imgs.filter((_, i) => i % 2 === 1);

  return (
    <div className="overflow-x-clip pb-4">
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative px-4 pb-14 pt-16 text-center sm:pt-24">
        <div className="mx-auto max-w-3xl">
          <BrandMark className="mx-auto h-16 w-16" />
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#ebd98d] bg-lemon/70 px-3 py-1 text-xs font-medium text-ink">
            <SparkleIcon className="h-4 w-4" />
            OPEN BETA
          </span>
          <h1 className="mt-5 font-display text-[2.6rem] leading-[1.1] sm:text-6xl">
            내 최애 <span className="gradient-text">포토카드</span>,
            <br />
            이제 <span className="gradient-text">한국에서</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ink-soft">
            일본 아이돌 포카를 <b className="text-foreground">국내 재고</b>로 —
            현지 가격 수준, <b className="text-foreground">해외배송비 없이.</b>
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <Link href={BROWSE_HREF}>서비스 둘러보기</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            가입 없이도 모든 매물을 볼 수 있어요
          </p>
        </div>
      </section>

      {/* ── 마키 갤러리 ──────────────────────────────────── */}
      {imgs.length > 0 && (
        <section className="scroll-x marquee-wrap space-y-3 overflow-hidden py-2">
          {[
            { row: rowA, dir: "marquee-left" },
            { row: rowB, dir: "marquee-right" },
          ].map(({ row, dir }, ri) => (
            <div key={ri} className={`marquee-track ${dir}`}>
              {[...row, ...row].map((im, i) => (
                <div
                  key={i}
                  className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-sm border border-border bg-lilac shadow-card sm:w-32"
                >
                  <ProductImage
                    src={im.src}
                    alt={im.alt}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ))}
          <p className="text-center text-xs text-muted-foreground">
            실제 보유 중인 CUTIE STREET 컬렉션
          </p>
        </section>
      )}

      {/* ── 왜 이로이로 (핵심 4) ─────────────────────────── */}
      <section className="mx-auto mt-16 max-w-4xl px-4">
        <h2 className="text-center font-display text-2xl leading-tight sm:text-3xl">
          사는 곳을 넘어, <span className="gradient-text">모으는 재미</span>
          까지.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            {
              Icon: HeartIcon,
              t: "현지 가격 수준",
              d: "프리미엄 없이 정가에 가깝게 — 해외배송비도 없어요.",
            },
            {
              Icon: TruckIcon,
              t: "국내 재고 · 빠른 배송",
              d: "직접 매입해 국내 보관. 며칠 안에 받아요.",
            },
            {
              Icon: ShieldIcon,
              t: "정품 · 실물 직접 촬영",
              d: "일본 직매입 정품만, 받을 카드 그대로 찍어 올려요.",
            },
            {
              Icon: AlbumIcon,
              t: "나만의 디지털 도감",
              d: "구매 카드는 컬렉션에 자동 등록 — 수집률을 채우는 재미.",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="flex items-start gap-4 rounded-md border border-border bg-card p-5 shadow-card"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-lemon text-ink">
                <c.Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-base">{c.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {c.d}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 가입 혜택 (실제 제공 중인 것만) ───────────────── */}
      <section className="px-4">
        <div className="mx-auto mt-16 max-w-4xl rounded-md border border-border bg-lilac/60 p-6 shadow-card sm:p-10">
          <div className="text-center">
            <Badge className="mb-3">WELCOME BENEFIT</Badge>
            <h2 className="font-display text-2xl leading-tight text-foreground sm:text-3xl">
              가입하면 <span className="gradient-text">바로 받는 혜택</span>
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              전부 지금 실제로 지급되는 혜택이에요.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              {
                Icon: GiftIcon,
                t: "웰컴 1,000P + 무료배송 쿠폰 3장",
                d: "가입 즉시 지급 — 첫 주문부터 바로 사용",
              },
              {
                Icon: SparkleIcon,
                t: "도착 인증 리뷰 100P",
                d: "받은 카드 리뷰를 남기면 카드마다 적립",
              },
              {
                Icon: HeartIcon,
                t: "친구 초대 500P",
                d: "초대한 쪽·가입한 쪽 모두 받아요",
              },
              {
                Icon: BellIcon,
                t: "최애 맞춤 홈 · 알림",
                d: "최애를 등록하면 입고·입찰 소식을 먼저",
              },
            ].map((c) => (
              <div
                key={c.t}
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                  <c.Icon className="h-5 w-5" />
                </span>
                <p className="mt-2 font-display text-sm text-foreground">
                  {c.t}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 로드맵 (compact) ─────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-4xl px-4 text-center">
        <Badge variant="outline" className="mb-3">
          EXPANSION ROADMAP
        </Badge>
        <h2 className="font-display text-2xl leading-tight sm:text-3xl">
          <span className="gradient-text">CUTIE STREET</span>로 시작해
          <br />
          KAWAII LAB. 전체로.
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            { n: "CUTIE STREET", s: "NOW", now: true },
            { n: "FRUITS ZIPPER", s: "NEXT" },
            { n: "CANDY TUNE", s: "SOON" },
            { n: "SWEET STEADY", s: "SOON" },
          ].map((g) => (
            <span
              key={g.n}
              className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium ${
                g.now ? "bg-primary text-primary-foreground" : "bg-card"
              }`}
            >
              {g.n}
              <span
                className={`text-[10px] ${g.now ? "opacity-90" : "text-muted-foreground"}`}
              >
                {g.s}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* ── 최종 CTA ─────────────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-2xl px-4">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-8 text-center shadow-elevated sm:p-12">
          <BrandWordmark className="mx-auto mb-4 h-8 w-auto" />
          <h2 className="font-display text-2xl leading-tight sm:text-3xl">
            첫 카드, <span className="gradient-text">지금 만나러 갈까요?</span>
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
            가입 없이도 모든 매물을 둘러볼 수 있어요. 마음에 드는 카드가
            보이면 그때 시작해도 늦지 않아요.
          </p>
          <div className="mt-7 flex justify-center">
            <Button asChild size="lg">
              <Link href={BROWSE_HREF}>서비스 둘러보기</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
