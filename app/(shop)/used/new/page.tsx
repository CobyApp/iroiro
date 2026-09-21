import type { Metadata } from "next";
import { env } from "@/lib/env";
import { redirect } from "next/navigation";
import { PageBack } from "@/components/PageBack";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import {
  listSeriesOptions,
} from "@/modules/products/lib/queries";
import { listUsedSoldPrices } from "@/modules/used/lib/queries";
import { fetchJpyKrwRate } from "@/modules/products/lib/fx";
import { todayKstYmd } from "@/lib/datetime";
import { UsedListingForm } from "@/modules/used/components/UsedListingForm";

export const metadata: Metadata = { title: "중고 판매하기" };

export default async function UsedNewPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login-required?from=/used/new");

  const [teams, members, seriesOptions, fxRate100] = await Promise.all([
    listTeams(),
    listMembers(),
    listSeriesOptions(),
    fetchJpyKrwRate(todayKstYmd())
      .then((r) => r.rate)
      .catch(() => 0),
  ]);

  // 시리즈별 중고 최근 거래가 — 폼에서 가격 추천에 사용(시리즈 수가 적어 일괄 로드).
  const usedSoldBySeries: Record<number, number[]> = {};
  await Promise.all(
    seriesOptions.map(async (s) => {
      const rows = await listUsedSoldPrices(s.id, 3);
      if (rows.length > 0) usedSoldBySeries[s.id] = rows.map((r) => r.price);
    }),
  );

  return (
    <div className="shop-page-frame space-y-4">
      <PageBack fallbackHref="/used" />
      <h1 className="text-xl font-bold text-foreground">중고 판매하기</h1>
      <UsedListingForm
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        members={members.map((m) => ({
          id: m.id,
          name: m.name,
          teamIds: m.teamIds,
        }))}
        seriesOptions={seriesOptions}
        fxRate100={fxRate100}
        usedSoldBySeries={usedSoldBySeries}
        publicBaseUrl={env.CATALOG_PUBLIC_BASE}
      />
    </div>
  );
}
