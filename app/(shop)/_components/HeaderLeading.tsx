"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";
import { BrandLockup } from "@/modules/ui/components/BrandMark";
import { SALE_MODE_LABEL } from "@/modules/products/types";
import { USED_ITEM_TYPE_LABEL } from "@/modules/used/types";
import { POST_TOPICS, POST_TOPIC_EMOJI, POST_TOPIC_LABELS } from "@/modules/posts/types";
import { useRecentSearches } from "./use-recent-searches";
import { WishlistSearch } from "@/modules/wishlist/components/WishlistSearch";
import type { SearchTagFacets } from "@/modules/search/lib/tag-facets";

// 상단 헤더 왼쪽 영역 — 현재 화면에 맞춰 셋 중 하나를 보여준다.
//  · 검색   스토어(/·/products)·중고(/used)·커뮤니티(/posts) 목록 → 탭에 맞는 검색 + 필터 태그 패널
//  · 뒤로   상세·하위 페이지(경로가 한 단계 더 깊거나 leaf 페이지) → 상단 네비 뒤로가기
//  · 로고   그 외 상위 탭(찜·마이 등) → 이로이로 로고
// 검색 패널은 최근 검색어 + 그 탭의 필터(그룹·종류·판매방식·토픽)를 커서 올리면 바로 고르게 한다.

export type TeamOption = { id: number; name: string };
export type MemberOption = { id: number; name: string };

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
  hint: "스토어에서 상품·그룹으로 찾기",
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
  | { kind: "logo" }
  | { kind: "account" };

export type HeaderAccount = { displayName: string; avatarUrl: string | null };

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
    // 찜은 자체 검색(찜 목록 안에서 필터)을 페이지에서 제공 — 헤더 스토어 검색을 붙이지 않는다.
    case "/wishlist":
      return { kind: "logo" };
    // 장바구니는 담긴 상품 안에서 검색(페이지 자체 제공) — 헤더 스토어 검색을 붙이지 않는다.
    case "/cart":
      return { kind: "logo" };
    // 메뉴에서 진입하는 leaf 페이지 — 자체 상위 탭이 없으니 뒤로가기.
    case "/messages":
    case "/orders":
      return { kind: "back", fallback: "/" };
    // 마이 탭 — 로고 대신 내 계정 정보를 보여준다(계정 없으면 로고 폴백).
    case "/mypage":
      return { kind: "account" };
    default:
      // 찜 등 상위 탭 루트 — 로고.
      return { kind: "logo" };
  }
}

const EMPTY_FACETS: SearchTagFacets = {
  storeTeamIds: [],
  storeItemTypes: [],
  storeMembersByTeam: {},
  usedTeamIds: [],
  usedSaleModes: [],
  usedItemTypes: [],
  usedMembersByTeam: {},
};

export function HeaderLeading({
  teams = [],
  members = [],
  tagFacets = EMPTY_FACETS,
  account = null,
}: {
  teams?: TeamOption[];
  members?: MemberOption[];
  tagFacets?: SearchTagFacets;
  account?: HeaderAccount | null;
}) {
  const pathname = usePathname();
  const leading = resolveLeading(pathname);

  // 찜은 자체 검색(찜 목록 필터) — 모바일 상단 헤더에 찜 전용 검색바를 둔다(데스크탑은 페이지 안).
  if (pathname === "/wishlist") {
    return (
      <div className="min-w-0 flex-1 sm:hidden">
        <WishlistSearch />
      </div>
    );
  }

  if (leading.kind === "back") return <BackButton fallback={leading.fallback} />;
  if (leading.kind === "account" && account) {
    // 마이 탭 — 로고 자리에 내 계정 정보(모바일). 데스크톱은 레이아웃 로고가 이미 있다.
    const initial = (account.displayName.trim()[0] ?? "?").toUpperCase();
    return (
      <div className="flex min-w-0 flex-1 items-center sm:hidden">
        <Link href="/mypage/edit" className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-lemon text-sm font-display text-ink">
            {account.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- R2 외부 호스트 */
              <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {account.displayName}
          </span>
        </Link>
      </div>
    );
  }
  if (leading.kind === "account") {
    // 비로그인 마이 탭 — 로고 대신 게스트 모드 표시(모바일).
    return (
      <div className="flex min-w-0 flex-1 items-center sm:hidden">
        <span className="text-sm font-semibold text-muted-foreground">게스트 모드</span>
      </div>
    );
  }
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
  // 검색바 — 데스크톱은 네비바 아래(HeaderSearchBar)로 내렸으므로 상단 헤더에선 모바일만.
  return (
    <div className="min-w-0 flex-1 sm:hidden">
      <SearchField mode={leading} teams={teams} members={members} tagFacets={tagFacets} />
    </div>
  );
}

// 검색 데이터(그룹·멤버·facet)를 레이아웃에서 한 번 읽어 페이지 안 검색바로 내려주는 컨텍스트.
// 페이지마다 다시 서버 조회하지 않고, 각 페이지가 타이틀 아래에 <InPageSearchBar/> 만 두면 된다.
type SearchData = {
  teams: TeamOption[];
  members: MemberOption[];
  tagFacets: SearchTagFacets;
};
const SearchDataContext = createContext<SearchData>({
  teams: [],
  members: [],
  tagFacets: EMPTY_FACETS,
});

export function SearchDataProvider({
  teams = [],
  members = [],
  tagFacets = EMPTY_FACETS,
  children,
}: {
  teams?: TeamOption[];
  members?: MemberOption[];
  tagFacets?: SearchTagFacets;
  children: React.ReactNode;
}) {
  return (
    <SearchDataContext.Provider value={{ teams, members, tagFacets }}>
      {children}
    </SearchDataContext.Provider>
  );
}

// 데스크톱 전용 — 각 목록 페이지가 자신의 타이틀 아래에 두는 검색바(모바일은 상단 헤더 검색 유지).
// 검색 대상 탭(스토어·중고·커뮤니티)에서만 렌더하고, 그 외에선 스스로 감춘다.
export function InPageSearchBar({ className }: { className?: string }) {
  const { teams, members, tagFacets } = useContext(SearchDataContext);
  const pathname = usePathname();
  const leading = resolveLeading(pathname);
  if (leading.kind !== "search") return null;
  return (
    <div className={`hidden w-full sm:block ${className ?? ""}`}>
      <SearchField mode={leading} teams={teams} members={members} tagFacets={tagFacets} />
    </div>
  );
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

function SearchField({
  mode,
  teams,
  members,
  tagFacets,
}: {
  mode: SearchMode;
  teams: TeamOption[];
  members: MemberOption[];
  tagFacets: SearchTagFacets;
}) {
  const router = useRouter();
  const { recent, push, remove, clear } = useRecentSearches(mode.recentKey);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  // 그룹 칩을 누르면 그 그룹의 멤버 칩을 펼친다(바로 이동 대신). 다시 누르면 접힌다.
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 패널을 닫을 때 멤버 펼침 상태도 함께 초기화한다.
  function closePanel() {
    setOpen(false);
    setSelectedTeamId(null);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closePanel();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function goSearch(term: string) {
    const t = term.trim();
    push(t);
    setQ(t);
    closePanel();
    router.push(t ? `${mode.action}?q=${encodeURIComponent(t)}` : mode.action);
  }

  function goFilter(href: string) {
    closePanel();
    router.push(href);
  }

  const typed = q.trim().toLowerCase();
  // 상품/매물이 있는 그룹만 태그로 — 커뮤니티는 글 검색어라 facet 제한 없이 모두 노출.
  const teamFacet =
    mode.key === "product"
      ? tagFacets.storeTeamIds
      : mode.key === "used"
        ? tagFacets.usedTeamIds
        : null;
  const teamAllowed = teamFacet ? new Set(teamFacet) : null;
  const matchTeams = teams
    .filter((t) => (teamAllowed ? teamAllowed.has(t.id) : true))
    .filter((t) => (typed ? t.name.toLowerCase().includes(typed) : true))
    .slice(0, 10);
  // 그룹 선택 시 그 그룹의 멤버 칩 — 상품/매물이 있는 멤버만(커뮤니티는 멤버 필터 없음).
  const membersByTeam =
    mode.key === "product"
      ? tagFacets.storeMembersByTeam
      : mode.key === "used"
        ? tagFacets.usedMembersByTeam
        : null;
  const memberNameById = new Map(members.map((m) => [m.id, m.name]));
  const selectedTeam =
    selectedTeamId !== null ? (teams.find((t) => t.id === selectedTeamId) ?? null) : null;
  const teamMembers =
    membersByTeam && selectedTeamId !== null
      ? (membersByTeam[String(selectedTeamId)] ?? [])
          .map((id) => ({ id, name: memberNameById.get(id) }))
          .filter((m): m is MemberOption => typeof m.name === "string")
      : [];
  // 결과가 있는 판매방식·종류만(중고).
  const usedModes = new Set(tagFacets.usedSaleModes);
  const usedTypeKeys = (Object.keys(USED_ITEM_TYPE_LABEL) as (keyof typeof USED_ITEM_TYPE_LABEL)[]).filter(
    (t) => tagFacets.usedItemTypes.includes(t),
  );

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
          onKeyDown={(e) => e.key === "Escape" && closePanel()}
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

          {/* 그룹 태그 — 모든 검색 탭 공통. 커뮤니티는 글 검색어로 바로 이동,
             스토어·중고는 그룹을 눌러 멤버 칩을 펼친다(멤버로도 필터). */}
          {matchTeams.length > 0 && (
            <ChipGroup label="그룹">
              {matchTeams.map((t) => (
                <Chip
                  key={t.id}
                  active={selectedTeamId === t.id}
                  onClick={() =>
                    mode.key === "community"
                      ? goSearch(t.name)
                      : setSelectedTeamId((prev) => (prev === t.id ? null : t.id))
                  }
                >
                  {t.name}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {/* 그룹 선택 시 멤버 칩 — "그룹 전체"로 팀만 필터하거나 멤버까지 좁힌다. */}
          {selectedTeam && (mode.key === "product" || mode.key === "used") && (
            <ChipGroup label={`${selectedTeam.name} 멤버`}>
              <Chip onClick={() => goFilter(`${mode.action}?team=${selectedTeam.id}`)}>
                그룹 전체
              </Chip>
              {teamMembers.map((m) => (
                <Chip
                  key={m.id}
                  onClick={() =>
                    goFilter(`${mode.action}?team=${selectedTeam.id}&member=${m.id}`)
                  }
                >
                  {m.name}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {/* 스토어는 토레카만 취급 — 종류 필터 없음(그룹·검색어로 찾는다). */}

          {/* 중고 — 판매 방식 태그(매물이 있는 방식만) */}
          {mode.key === "used" && !typed && (
            <ChipGroup label="판매 방식">
              {(Object.keys(SALE_MODE_LABEL) as (keyof typeof SALE_MODE_LABEL)[])
                .filter((m) => usedModes.has(m))
                .map((m) => (
                <Chip key={m} onClick={() => goFilter(`/used?mode=${m}`)}>
                  {SALE_MODE_LABEL[m]}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {/* 중고 — 굿즈 종류 태그(매물이 있는 종류만) */}
          {mode.key === "used" && !typed && usedTypeKeys.length > 0 && (
            <ChipGroup label="종류">
              {usedTypeKeys.map((t) => (
                <Chip key={t} onClick={() => goFilter(`/used?item=${t}`)}>
                  {USED_ITEM_TYPE_LABEL[t]}
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

function Chip({
  onClick,
  active = false,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
      }`}
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
