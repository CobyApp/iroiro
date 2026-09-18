import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { CardForm } from "@/modules/cards/components/CardForm";

export const metadata: Metadata = { title: "토레카 등록" };

// 관리자 — 토레카 직접 등록 (즉시 공개).
export default async function AdminCardNewPage() {
  const [teams, members, seriesRows] = await Promise.all([
    listTeams(),
    listMembers(),
    db.series.findMany({
      select: { id: true, teamId: true, label: true, kind: true },
      orderBy: { label: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <Link
          href="/admin/cards"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          토레카 데이터
        </Link>
        <h1 className="text-xl font-bold text-foreground">토레카 등록</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          그룹·멤버·시리즈를 고르고 앞/뒷면 사진을 올리면 즉시 공개돼요.
        </p>
      </div>
      <div className="max-w-2xl rounded-md border border-border bg-card p-4 shadow-card sm:p-6">
        <CardForm
          mode="admin"
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          members={members.map((m) => ({
            id: m.id,
            name: m.name,
            teamIds: m.teamIds,
          }))}
          series={seriesRows.map((s) => ({
            id: Number(s.id),
            teamId: s.teamId === null ? null : Number(s.teamId),
            label: s.label,
            kind: s.kind,
          }))}
          publicBaseUrl={env.R2_PUBLIC_BASE}
        />
      </div>
    </div>
  );
}
