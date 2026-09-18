import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/modules/ui/components/BrandMark";
import {
  AlbumIcon,
  HeartIcon,
  ShieldIcon,
  SparkleIcon,
} from "@/modules/marketing/components/icons";

export const metadata: Metadata = {
  title: "일본 아이돌 입덕 가이드 — 이로이로",
  description:
    "KAWAII LAB. 계보부터 토레카 문화, 필수 용어사전까지 — 일본 아이돌 처음이라면 여기서 시작하세요.",
};

// 그룹 계보 — 정적 소개 콘텐츠(팀 마스터와 무관, 마케팅 카피).
const KAWAII_LAB_GROUPS = [
  {
    name: "FRUITS ZIPPER",
    year: "2022",
    desc: "“NEW KAWAII”를 내건 프로젝트의 시작. 일본 무도관을 채운 대표 주자.",
  },
  {
    name: "CANDY TUNE",
    year: "2023",
    desc: "두 번째 그룹. 캐치한 곡과 개성 강한 멤버들로 빠르게 성장 중.",
  },
  {
    name: "SWEET STEADY",
    year: "2024",
    desc: "세 번째 그룹. 청량하고 단정한 콘셉트가 매력.",
  },
  {
    name: "CUTIE STREET",
    year: "2024",
    desc: "“큐트가 최강” — 이로이로가 지금 가장 집중하는 그룹.",
    now: true,
  },
];

// 용어사전 — 처음 입덕하면 반드시 마주치는 단어들.
const GLOSSARY: { term: string; read: string; desc: string }[] = [
  {
    term: "오시 (推し)",
    read: "최애",
    desc: "가장 응원하는 멤버. “누구 오시예요?”가 팬들의 첫 인사.",
  },
  {
    term: "오시카츠 (推し活)",
    read: "덕질 활동",
    desc: "최애를 응원하는 모든 활동 — 굿즈 수집, 공연 관람, 카페 이벤트까지.",
  },
  {
    term: "토레카 (トレカ)",
    read: "트레이딩 카드",
    desc: "랜덤 봉입으로 판매되는 멤버 카드. K-pop의 포토카드에 해당해요.",
  },
  {
    term: "생사진 (生写真)",
    read: "나마샤신",
    desc: "공식이 발매하는 스냅 사진. 토레카보다 크고, 역시 랜덤 판매가 기본.",
  },
  {
    term: "체키 (チェキ)",
    read: "폴라로이드",
    desc: "멤버가 직접 찍는 인스탁스 즉석사진. 특전회의 꽃이자 최고가 굿즈.",
  },
  {
    term: "특전회 (特典会)",
    read: "팬 이벤트",
    desc: "CD·굿즈 구매 특전으로 멤버와 만나는 행사. 체키 촬영·대화 등.",
  },
  {
    term: "원정 (遠征)",
    read: "엔세이",
    desc: "다른 지역·해외 공연을 보러 가는 것. 한국 팬에게는 일본행 그 자체.",
  },
  {
    term: "ver. (버전)",
    read: "버전",
    desc: "같은 멤버라도 발매 시기·의상별로 카드가 나뉘어요. 버전이 시세를 가릅니다.",
  },
];

const STEPS = [
  {
    Icon: HeartIcon,
    t: "1. 최애를 정하고",
    d: "그룹 영상을 보다 눈이 가는 멤버가 생기면 — 그게 오시예요. 이로이로에서 최애로 등록하면 홈이 맞춤 추천으로 바뀌어요.",
  },
  {
    Icon: SparkleIcon,
    t: "2. 첫 카드를 모으고",
    d: "일반 판매로 바로 사거나, 입찰 경매로 시작가부터 노려보세요. 전 상품 실물 직접 촬영이라 받아보고 실망할 일이 없어요.",
  },
  {
    Icon: AlbumIcon,
    t: "3. 도감을 채워요",
    d: "구매한 카드는 디지털 컬렉션에 자동 등록. 수집률을 채우는 재미가 진짜 시작입니다.",
  },
];

export default function GuidePage() {
  return (
    <div className="overflow-x-clip pb-4">
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="px-4 pb-12 pt-16 text-center sm:pt-20">
        <div className="mx-auto max-w-3xl">
          <BrandMark className="mx-auto h-14 w-14" />
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#ebd98d] bg-lemon/70 px-3 py-1 text-xs font-medium text-ink">
            <SparkleIcon className="h-4 w-4" />
            처음이라면 여기서부터
          </span>
          <h1 className="mt-5 font-display text-[2.4rem] leading-[1.15] sm:text-5xl">
            일본 아이돌,
            <br />
            <span className="gradient-text">어디서부터 시작할까?</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink-soft">
            KAWAII LAB. 계보부터 토레카 문화, 필수 용어까지 —
            10분이면 입덕 준비 끝.
          </p>
        </div>
      </section>

      {/* ── 3 STEP 퀵스타트 ──────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.t}
              className="rounded-md border border-border bg-card p-5 shadow-card"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                <s.Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-3 font-display text-base">{s.t}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── KAWAII LAB. 계보 ─────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-4xl px-4">
        <Badge variant="outline" className="mb-3">
          KAWAII LAB.
        </Badge>
        <h2 className="font-display text-2xl leading-tight sm:text-3xl">
          한 지붕 네 그룹, <span className="gradient-text">KAWAII LAB.</span>
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          KAWAII LAB.은 하라주쿠 문화를 이끄는 ASOBISYSTEM의 아이돌
          프로젝트예요. 같은 레이블 안에서 그룹끼리 합동 공연·콘텐츠가 많아
          한 그룹에 입덕하면 자연스럽게 옆 그룹까지 알게 되는 구조랍니다.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {KAWAII_LAB_GROUPS.map((g) => (
            <div
              key={g.name}
              className={`rounded-md border p-5 shadow-card ${
                g.now
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg">{g.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {g.year} 데뷔
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {g.desc}
              </p>
              {g.now && (
                <Badge className="mt-3">이로이로에서 판매 중</Badge>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 토레카 문화 ──────────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-4xl px-4">
        <Badge variant="outline" className="mb-3">
          TORECA CULTURE
        </Badge>
        <h2 className="font-display text-2xl leading-tight sm:text-3xl">
          토레카, <span className="gradient-text">이렇게 굴러가요</span>
        </h2>
        <div className="mt-6 space-y-3">
          {[
            {
              t: "랜덤이 기본",
              d: "토레카·생사진은 멤버를 고를 수 없는 랜덤 봉입 판매가 기본이에요. 그래서 원하는 멤버·버전을 “골라 사는” 2차 거래 시장이 큽니다 — 이로이로가 하는 일이 바로 이거예요.",
            },
            {
              t: "버전이 가치를 정해요",
              d: "같은 멤버라도 발매 회차·의상별로 ver.이 나뉘고, 수량이 적은 버전은 시세가 몇 배로 뛰기도 해요. 상품명의 ver. 표기를 꼭 확인하세요.",
            },
            {
              t: "컨디션(상태)이 절반",
              d: "카드는 모서리 눌림·스크래치 하나로 가격이 갈려요. 이로이로는 전 상품을 실물 촬영하고 상태 등급을 표기해 “받아보니 다른” 일을 없앱니다.",
            },
            {
              t: "정가 이하도 가능한 입찰",
              d: "인기가 덜한 버전은 경매에서 시작가 그대로 낙찰되기도 해요. 급하지 않다면 입찰이 가장 저렴한 입덕 루트입니다.",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-md border border-border bg-card p-5 shadow-card"
            >
              <h3 className="flex items-center gap-2 font-display text-base">
                <ShieldIcon className="h-4 w-4 text-primary" />
                {c.t}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {c.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 용어사전 ─────────────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-4xl px-4">
        <Badge variant="outline" className="mb-3">
          GLOSSARY
        </Badge>
        <h2 className="font-display text-2xl leading-tight sm:text-3xl">
          이 단어만 알면 <span className="gradient-text">반은 입덕</span>
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div
              key={g.term}
              className="rounded-md border border-border bg-card p-4 shadow-card"
            >
              <p className="font-display text-sm">
                {g.term}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {g.read}
                </span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {g.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-2xl px-4">
        <div className="rounded-[2rem] border border-border bg-card p-8 text-center shadow-elevated sm:p-10">
          <h2 className="font-display text-2xl leading-tight sm:text-3xl">
            준비 끝. <span className="gradient-text">첫 카드 보러 갈까요?</span>
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
            최애를 등록하면 홈이 맞춤 추천으로 바뀌고, 입고·입찰 알림도
            받을 수 있어요.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/products">둘러보기</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/mypage/favorites">최애 설정하기</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
