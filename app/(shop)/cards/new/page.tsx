import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { env } from "@/lib/env";
import { catalogDb } from "@/lib/catalog-db";
import { PageBack } from "@/components/PageBack";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listSeriesKinds } from "@/modules/series/lib/kinds-queries";
import { CardForm } from "@/modules/cards/components/CardForm";
import { CARD_STATUS_LABEL, cardFrontUrl } from "@/modules/cards/types";
import { toCard } from "@/modules/cards/lib/transform";

export const metadata: Metadata = { title: "토레카 등록" };

// 유저 — 새 토레카 제보. 검수 후 카탈로그에 공개된다.
export default async function CardSubmitPage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("profile"));

  const [teams, members, kinds, seriesRows, mySubmissions] = await Promise.all([
    listTeams(),
    listMembers(),
    listSeriesKinds(),
    catalogDb.series.findMany({
      select: { id: true, teamId: true, label: true, kind: true },
      orderBy: { label: "asc" },
    }),
    catalogDb.card.findMany({
      where: { submittedByAccountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader
        eyebrow="CARD ARCHIVE"
        title="토레카 등록"
        description="아직 카탈로그에 없는 토레카를 제보해 주세요 — 검수 승인되면 100P가 적립돼요."
        action={<PageBack fallbackHref="/mypage" />}
      />

      {/* PhotoScan 촬영 가이드 — 토레카분석기와 동일한 안내. */}
      <section className="flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Camera className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-foreground">
            카드는 Google PhotoScan으로 찍어주세요
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            빛 반사 없이 평평하게 스캔돼 카드 인식 정확도가 올라가요. 앱으로
            실물 카드를 스캔한 뒤, 저장된 사진을 여기에 올려주세요.
          </p>
          <p className="mt-1.5 flex gap-3 text-xs">
            <a
              href="https://play.google.com/store/apps/details?id=com.google.android.apps.photos.scanner"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Android 설치
            </a>
            <a
              href="https://apps.apple.com/app/photoscan-by-google-photos/id1165525994"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              iOS 설치
            </a>
          </p>
        </div>
      </section>

      <section className="shop-content-surface">
        <CardForm
          mode="user"
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
          kinds={kinds}
          imageView={{ kind: "public", publicBase: env.CATALOG_PUBLIC_BASE }}
        />
      </section>

      {mySubmissions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold text-foreground">내 제보</h2>
            {mySubmissions.some((r) => r.status === "pending") && (
              <span className="text-xs text-muted-foreground">
                검수 대기{" "}
                {mySubmissions.filter((r) => r.status === "pending").length}건
                — 승인되면 100P 적립
              </span>
            )}
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {mySubmissions.map(toCard).map((card) => {
              const status = card.status;
              const url = cardFrontUrl(card, env.CATALOG_PUBLIC_BASE);
              return (
                <li key={card.id} className="space-y-1">
                  <div className="aspect-[63/88] overflow-hidden rounded-sm border border-border bg-muted">
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={card.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <p className="line-clamp-1 text-xs text-foreground">{card.name}</p>
                  <p
                    className={`text-[11px] ${
                      status === "active"
                        ? "text-primary"
                        : status === "rejected"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {CARD_STATUS_LABEL[status]}
                    {status === "rejected" && card.reviewNote
                      ? ` — ${card.reviewNote}`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
