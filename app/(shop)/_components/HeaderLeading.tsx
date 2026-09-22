"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";
import { BrandLockup } from "@/modules/ui/components/BrandMark";
import { ITEM_TYPE_LABEL, SALE_MODE_LABEL } from "@/modules/products/types";
import { POST_TOPICS, POST_TOPIC_EMOJI, POST_TOPIC_LABELS } from "@/modules/posts/types";
import { useRecentSearches } from "./use-recent-searches";

// 상단 헤더 왼쪽 영역 — 현재 화면에 맞춰 셋 중 하나를 보여준다.
//  · 검색   스토어(/·/products)·중고(/used)·커뮤니티(/posts) 목록 → 탭에 맞는 검색 + 필터 태그 패널
//  · 뒤로   상세·하위 페이지(경로가 한 단계 더 깊거나 leaf 페이지) → 상단 네비 뒤로가기
//  · 로고   그 외 상위 탭(찜·마이 등) → 이로이로 로고
// 검색 패널은 최근 검색어 + 그 탭의 필터(그룹·종류·판매방식·토픽)를 커서 올리면 바로 고르게 한다.

export type TeamOption = { id: number; name: string };

type SearchMode = {
  kind: "search";
  key: "product" | "used" | "community";
  action: string;
  recentKey: string;
  placeholder: string;
  label: string;
  hint: string;
};

const PRODUCT: SearchMode = {
  kind: "search",
  key: "product",
  action: "/products",
  recentKey: "iroiro:recent-searches",
  placeholder: "상품·그룹·멤버 검색",
  label: "상품 검색",
  hint: "스토어에서 상품·그룹·종류로 찾기",
};
const USED: SearchMode = {
  kind: "search",
  key: "used",
  action: "/used",
  recentKey: "iroiro:recent-searches:used",
  placeholder: "중고 매물·그룹 검색",
  label: "중고 매물 검색",
  hint: "중고거래에서 매물·그룹·판매방식으로 찾기",
};
const COMMUNITY: SearchMode = {
  kind: "search",
  key: "community",
  action: "/posts",
  recentKey: "iroiro:recent-searches:posts",
  placeholder: "커뮤니티 글 검색",
  label: "커뮤니티 글 검색",
  hint: "커뮤니티에서 글 제목·토픽으로 찾기",
};

type Leading =
  | SearchMode
  | { kind: "back"; fallback: string }
  | { kind: "logo" };

function resolveLeading(pathname: string): Leading {
  if (pathname === "/") return PRODUCT;
  const seg = pathname.split("/").filter(Boolean);
  // 상세·하위 페이지 — 한 단계 더 깊으면 뒤로가기. 부모 경로를 폴백으로.
  if (seg.length >= 2) {
    return { kind: "back", fallback: `/${seg.slice(0, -1).join("/")}` };
  }
  switch (`/${seg[0]}`) {
    case "/products":
      return PRODUCT;
    case "/used":
      return USED;
    case "/posts":
      return COMMUNITY;
    // 메뉴에서 진입하는 leaf 페이지 — 자체 상위 탭이 없으니 뒤로가기.
    case "/messages":
    case "/orders":
      return { kind: "back", fallback: "/" };
    default:
      // 찜·마이 등 상위 탭 루트 — 로고.
      return { kind: "logo" };
  }
}

export function HeaderLeading({ teams = [] }: { teams?: TeamOption[] }) {
  const pathname = usePathname();
  const leading = resolveLeading(pathname);

  if (leading.kind === "back") return <BackButton fallback={leading.fallback} />;
  if (leading.kind === "logo") {
    // 데스크톱은 레이아웃의 상시 로고가 이미 있으니 모바일에서만 로고를 보여준다.
    return (
      <div className="flex min-w-0 flex-1 items-center sm:hidden">
        <Link href="/" aria-label="이로이로 홈" className="shrink-0">
          <BrandLockup markClassName="h-8 w-8" wordmarkClassName="h-5" />
        </Link>
      </div>
    );
  }
  return <SearchField mode={leading} teams={teams} />;
}

function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  // 데스크톱은 좌측 상시 로고와 브라우저 뒤로가기가 있어 상단 뒤로가기 버튼이 불필요 — 모바일에서만 노출.
  return (
    <div className="flex min-w-0 flex-1 items-center sm:hidden">
      <button
        type="button"
        aria-label="뒤로"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) router.back();
          else router.push(fallback);
        }}
        className="-ml-1 inline-flex h-9 items-center gap-1 rounded-full pl-1 pr-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <ArrowLeft className="h-5 w-5" />
        뒤로
      </button>
    </div>
  );
}

function SearchField({ mode, teams }: { mode: SearchMode; teams: TeamOption[] }) {
  const router = useRouter();
  const { recent, push, remove, clear } = useRecentSearches(mode.recentKey);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function goSearch(term: string) {
    const t = term.trim();
    push(t);
    setQ(t);
    setOpen(false);
    router.push(t ? `${mode.action}?q=${encodeURIComponent(t)}` : mode.action);
  }

  function goFilter(href: string) {
    setOpen(false);
    router.push(href);
  }

  const typed = q.trim().toLowerCase();
  const matchTeams = teams
    .filter((t) => (typed ? t.name.toLowerCase().includes(typed) : true))
    .slice(0, 10);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goSearch(q);
        }}
      >
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder={mode.placeholder}
          aria-label={mode.label}
          className="h-10 w-full rounded-full border border-border bg-card/80 pl-9 pr-4 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary sm:text-sm"
        />
      </form>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 space-y-3 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-elevated"
          role="listbox"
          aria-label={mode.label}
        >
          <p className="px-1 text-[11px] text-muted-foreground">{mode.hint}</p>

          {recent.length > 0 && (
            <ChipGroup label="최근 검색" onClear={clear}>
              {recent.map((term) => (
                <RemovableChip key={term} onClick={() => goSearch(term)} onRemove={() => remove(term)}>
                  {term}
                </RemovableChip>
              ))}
            </ChipGroup>
          )}

          {/* 그룹 태그 — 모든 검색 탭 공통(스토어·중고는 ?team, 커뮤니티는 글 검색어로) */}
          {matchTeams.length > 0 && (
            <ChipGroup label="그룹">
              {matchTeams.map((t) => (
                <Chip
                  key={t.id}
                  onClick={() =>
                    mode.key === "community"
                      ? goSearch(t.name)
                      : goFilter(`${mode.action}?team=${t.id}`)
                  }
                >
                  {t.name}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {/* 스토어 — 종류 태그 */}
          {mode.key === "product" && !typed && (
            <ChipGroup label="종류">
              {(Object.keys(ITEM_TYPE_LABEL) as (keyof typeof ITEM_TYPE_LABEL)[]).map((type) => (
                <Chip key={type} onClick={() => goFilter(`/products?item=${type}`)}>
                  {ITEM_TYPE_LABEL[type]}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {/* 중고 — 판매 방식 태그 */}
          {mode.key === "used" && !typed && (
            <ChipGroup label="판매 방식">
              {(Object.keys(SALE_MODE_LABEL) as (keyof typeof SALE_MODE_LABEL)[]).map((m) => (
                <Chip key={m} onClick={() => goFilter(`/used?mode=${m}`)}>
                  {SALE_MODE_LABEL[m]}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {/* 커뮤니티 — 토픽 태그 */}
          {mode.key === "community" && !typed && (
            <ChipGroup label="토픽">
              {POST_TOPICS.map((topic) => (
                <Chip key={topic} onClick={() => goFilter(`/posts?topic=${topic}`)}>
                  {POST_TOPIC_EMOJI[topic]} {POST_TOPIC_LABELS[topic]}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ChipGroup({
  label,
  onClear,
  children,
}: {
  label: string;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            전체 삭제
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
    >
      {children}
    </button>
  );
}

function RemovableChip({
  onClick,
  onRemove,
  children,
}: {
  onClick: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-background py-1 pl-3 pr-1 text-xs text-foreground">
      <button type="button" onClick={onClick} className="max-w-[10rem] truncate">
        {children}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="삭제"
        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
