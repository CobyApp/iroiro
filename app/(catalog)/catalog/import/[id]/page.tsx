import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { listMembers } from "@/modules/members/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { fetchExternalCard } from "@/modules/import/lib/cutie-card";
import { buildImportPrefill } from "@/modules/import/lib/mapping";
import { ImportForm } from "@/modules/import/components/ImportForm";
import { fetchJpyKrwRate, jpyToKrwPrice } from "@/modules/products/lib/fx";
import { todayKstYmd } from "@/lib/datetime";

export default async function AdminImportCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const externalId = Number(id);
  const [card, members, teams] = await Promise.all([
    fetchExternalCard(externalId),
    listMembers(),
    listTeams(),
  ]);
  if (!card) notFound();

  const prefill = buildImportPrefill(
    card,
    members.map((m) => ({
      id: m.id,
      name: m.name,
      nameJa: (m.nameI18n?.["ja-jpan"] as string | undefined) ?? null,
    })),
    teams.map((t) => ({ id: t.id, name: t.name })),
  );

  // 판매가 프리필 — 시세(없으면 정가) 엔화를 현재 환율로 환산해 500원 단위 반올림.
  const rate100 = await fetchJpyKrwRate(todayKstYmd())
    .then((r) => r.rate)
    .catch(() => 0);
  const defaultPrice = jpyToKrwPrice(
    prefill.marketAvgJpy || prefill.retailJpy,
    rate100,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Toaster />
      <div className="flex items-center gap-2">
        <Link
          href="/catalog/import"
          aria-label="뒤로"
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-2xl font-bold">카드 → 상품 등록</h2>
      </div>
      <ImportForm
        externalId={externalId}
        prefill={prefill}
        defaultPrice={defaultPrice}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        frontUrl={card.image_url}
        backUrl={card.back_image_url}
      />
    </div>
  );
}
