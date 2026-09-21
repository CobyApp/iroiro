import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listSeriesOptions } from "@/modules/series/lib/queries";
import { CardForm } from "@/modules/cards/components/CardForm";

export const metadata: Metadata = { title: "토레카 등록" };

// 관리자 — 토레카 직접 등록 (즉시 공개, 앞면을 AI 분석해 임베딩 저장).
export default async function CatalogCardNewPage() {
  const [teams, members, series] = await Promise.all([
    listTeams(),
    listMembers(),
    listSeriesOptions(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/catalog/cards"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          토레카
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-foreground">토레카 등록</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          그룹·멤버·시리즈를 고르고 앞면 사진을 올리면 즉시 공개되고, 앞면은 AI 분석되어 유사 카드 검색에 쓰여요.
        </p>
      </div>
      <div className="max-w-2xl rounded-md border border-border bg-card p-4 shadow-card sm:p-6">
        <CardForm
          mode="admin"
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          members={members.map((m) => ({ id: m.id, name: m.name, teamIds: m.teamIds }))}
          series={series}
          imageView={{ kind: "admin" }}
        />
      </div>
    </div>
  );
}
