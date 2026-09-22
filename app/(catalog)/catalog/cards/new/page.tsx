import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listSeriesOptions } from "@/modules/series/lib/queries";
import { listSeriesKinds } from "@/modules/series/lib/kinds-queries";
import { CardForm } from "@/modules/cards/components/CardForm";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export const metadata: Metadata = { title: "토레카 등록" };

type SearchParams = Promise<{ team?: string; member?: string; series?: string }>;

// 관리자 — 토레카 직접 등록 (즉시 공개, 앞면을 AI 분석해 임베딩 저장).
// 종류 선택지는 DB(series_kind)에서 읽어 폼에 내려준다 — /catalog/kinds 편집이 그대로 반영.
// ?team=&member=&series= 로 미리 고른 채 열 수 있다(커버리지 매트릭스의 빈 셀 → 바로 등록).
export default async function CatalogCardNewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const pick = (v?: string) => (Number(v) > 0 ? Number(v) : null);
  const initial = { teamId: pick(sp.team), memberId: pick(sp.member), seriesId: pick(sp.series) };
  const [teams, members, series, kinds] = await Promise.all([
    listTeams(),
    listMembers(),
    listSeriesOptions(),
    listSeriesKinds(),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="TRADING CARDS"
        title="토레카 등록"
        description="그룹·멤버·시리즈를 고르고 앞면 사진을 올리면 즉시 공개되고, 앞면은 AI 분석되어 유사 카드 검색에 쓰여요. 멤버·시리즈가 목록에 없으면 폼 안에서 바로 추가하고, 저장 후에도 선택이 유지돼 연속으로 등록할 수 있어요."
      >
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/catalog/cards">
            <ArrowLeft className="h-4 w-4" />
            토레카 목록
          </Link>
        </Button>
      </AdminPageHeader>
      <div className="max-w-2xl rounded-md border border-border bg-card p-4 shadow-card sm:p-6">
        <CardForm
          mode="admin"
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          members={members.map((m) => ({
            id: m.id,
            name: m.name,
            teamIds: m.teamIds,
            nameJa: m.nameI18n?.["ja-jpan"] ?? null,
          }))}
          series={series}
          kinds={kinds}
          imageView={{ kind: "admin" }}
          initial={initial}
        />
      </div>
    </div>
  );
}
