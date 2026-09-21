import Link from "next/link";
import {
  fetchAllExternalCards,
  type ExternalCard,
} from "@/modules/import/lib/cutie-card";
import { matchMemberId, matchTeamId } from "@/modules/import/lib/mapping";
import { listImportedSourceIds } from "@/modules/products/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { ImportFilters } from "@/modules/import/components/ImportFilters";
import { CatalogSyncButton } from "@/modules/import/components/CatalogSyncButton";
import { env } from "@/lib/env";

const PAGE = 60;
const ANALYZER_URL = env.CUTIE_CARD_API_BASE;

// 관리자 — 외부 Cutie Card 분석기에서 카드를 골라 상품으로 임포트 (그룹/멤버/종류 필터).
export default async function AdminImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    team?: string;
    member?: string;
    offset?: string;
    hide?: string;
  }>;
}) {
  const sp = await searchParams;
  const kind = sp.kind ?? "";
  const teamId = sp.team ? Number(sp.team) : null;
  const memberId = sp.member ? Number(sp.member) : null;
  const hideRegistered = sp.hide === "1";
  const offset = Number(sp.offset ?? 0) || 0;

  let error: string | null = null;
  let cards: ExternalCard[] = [];
  let members: { id: number; name: string; nameJa: string | null }[] = [];
  let teams: { id: number; name: string }[] = [];
  let importedSourceIds = new Set<string>();
  try {
    const [res, membersRaw, teamsRaw, ids] = await Promise.all([
      fetchAllExternalCards({ kind: kind || undefined }),
      listMembers(),
      listTeams(),
      listImportedSourceIds(),
    ]);
    cards = res.items;
    importedSourceIds = new Set(ids);
    members = membersRaw.map((m) => ({
      id: m.id,
      name: m.name,
      nameJa: (m.nameI18n?.["ja-jpan"] as string | undefined) ?? null,
    }));
    teams = teamsRaw.map((t) => ({ id: t.id, name: t.name }));
  } catch (e) {
    error = e instanceof Error ? e.message : "외부 API 호출 실패";
  }

  const isRegistered = (c: ExternalCard) =>
    importedSourceIds.has(String(c.id));

  // 그룹/멤버 필터 — 매핑 기반(카드 → 우리 team/member). kind는 이미 API에서 필터됨.
  let filtered = cards;
  if (teamId != null) {
    filtered = filtered.filter((c) => matchTeamId(c, teams) === teamId);
  }
  if (memberId != null) {
    filtered = filtered.filter((c) => matchMemberId(c, members) === memberId);
  }

  const registeredCount = filtered.filter(isRegistered).length;
  const newCount = filtered.length - registeredCount;
  const shown = hideRegistered
    ? filtered.filter((c) => !isRegistered(c))
    : filtered;
  const paged = shown.slice(offset, offset + PAGE);

  const qs = (nextOffset: number) => {
    const q = new URLSearchParams();
    if (kind) q.set("kind", kind);
    if (sp.team) q.set("team", sp.team);
    if (sp.member) q.set("member", sp.member);
    if (hideRegistered) q.set("hide", "1");
    if (nextOffset > 0) q.set("offset", String(nextOffset));
    return `?${q.toString()}`;
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">카드 가져오기</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cutie Card 분석기에서 카드를 골라 상품으로 등록해요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <CatalogSyncButton />
        <Link
          href="/catalog/import/reset"
          className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm shadow-card transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          데이터 초기화 · 일괄 가져오기
        </Link>
        </div>
      </div>

      {/* 출처 안내 */}
      <div className="rounded-md border border-border bg-lilac/40 p-4 text-sm shadow-card">
        <p className="font-medium text-foreground">이 카드들은 어디서 오나요?</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          외부 <b>토레카 분석기</b>가 시장에 풀린 큐티 스트리트 토레카를
          수집·정리한 카탈로그예요. 여기서 카드를 고르면 이미지·시세·정가가
          자동으로 채워져 상품 초안이 만들어집니다. 실제 매입가·재고는 등록 후
          상품 수정에서 입력하세요.
        </p>
        <a
          href={ANALYZER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
        >
          토레카 분석기 열기 ↗
        </a>
      </div>

      {error ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-destructive shadow-card">
          {error}
        </div>
      ) : (
        <>
          <ImportFilters
            teams={teams}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              총 {filtered.length}건 · {shown.length ? offset + 1 : 0}–
              {offset + paged.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              신규 {newCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              등록됨 {registeredCount}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {paged.map((c) => {
              const registered = isRegistered(c);
              return (
                <Link
                  key={c.id}
                  href={`/catalog/import/${c.id}`}
                  className={`group relative block rounded-sm border p-2 shadow-card transition-transform hover:-translate-y-0.5 ${
                    registered
                      ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20"
                      : "border-border bg-card"
                  }`}
                >
                  <span
                    className={`absolute right-1 top-1 z-10 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-bold ${
                      registered
                        ? "bg-emerald-500 text-white"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {registered ? "등록됨" : "신규"}
                  </span>
                  <div
                    className={`aspect-[3/4] overflow-hidden rounded-xs border border-border bg-lilac ${
                      registered ? "opacity-70" : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 외부 API 이미지 */}
                    <img
                      src={c.image_url}
                      alt={c.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-foreground">
                    {c.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.series.label} · 시세 ¥{c.market_avg_jpy.toLocaleString()}
                  </p>
                </Link>
              );
            })}
          </div>

          {shown.length === 0 && (
            <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
              {hideRegistered
                ? "조건에 맞는 신규 카드가 없어요."
                : "조건에 맞는 카드가 없어요."}
            </div>
          )}

          <div className="flex justify-between pt-2">
            {offset > 0 ? (
              <Link
                href={qs(Math.max(0, offset - PAGE))}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm shadow-card"
              >
                이전
              </Link>
            ) : (
              <span />
            )}
            {offset + PAGE < shown.length && (
              <Link
                href={qs(offset + PAGE)}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm shadow-card"
              >
                다음
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
