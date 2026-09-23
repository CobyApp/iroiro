import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import { formatKstDate } from "@/lib/datetime";
import { getUsedBundleById } from "@/modules/used/lib/queries";
import { AUTO_CONFIRM_MS } from "@/modules/used/lib/settle-trade";
import { BundleProgress } from "@/modules/used/components/BundleProgress";
import { UsedListingCard } from "@/modules/used/components/UsedListingCard";

export const metadata: Metadata = { title: "묶음 구매" };

// 묶음 구매 상세 — 당사자(구매자/판매자)만. 함께 담은 매물 + 진행 패널.
export default async function UsedBundlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundleId = Number(id);
  if (!Number.isInteger(bundleId) || bundleId <= 0) notFound();

  const [account, data] = await Promise.all([
    getCurrentAccount(),
    getUsedBundleById(bundleId),
  ]);
  if (!data || !account) notFound();

  const role =
    account.id === data.bundle.buyerAccountId
      ? ("buyer" as const)
      : account.id === data.bundle.sellerAccountId
        ? ("seller" as const)
        : null;
  if (role === null) notFound();

  // 발송된 묶음 — 자동 구매확정 예정일 안내(배송조회는 택배사 링크로 컴포넌트가 표시).
  let autoConfirmNote: string | null = null;
  if (data.bundle.status === "shipped" && data.bundle.shippedAt) {
    const dueAt = new Date(
      new Date(data.bundle.shippedAt).getTime() + AUTO_CONFIRM_MS,
    );
    autoConfirmNote = `${formatKstDate(dueAt)}에 자동으로 구매확정돼요`;
  }

  return (
    <div className="shop-page-frame space-y-5">
      <h1 className="text-xl font-bold text-foreground">
        묶음 구매 {data.items.length}개
      </h1>

      <BundleProgress
        bundle={data.bundle}
        role={role}
        autoConfirmNote={autoConfirmNote}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">함께 담은 매물</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {data.items.map((listing) => (
            <UsedListingCard
              key={listing.id}
              listing={listing}
              publicBaseUrl={env.R2_PUBLIC_BASE}
            />
          ))}
        </div>
      </section>

      <Link
        href={`/used/seller/${data.bundle.sellerAccountId}`}
        className="inline-block text-sm text-primary underline-offset-2 hover:underline"
      >
        이 판매자 상점 보기 →
      </Link>
    </div>
  );
}
