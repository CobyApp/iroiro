import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminShell } from "@/modules/admin/components/AdminShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { adminRolesOf, hasAdminSpace } from "@/modules/admin/lib/adminRoles";
import { APP_NAMES, appDisplayName, isDevDeploy } from "@/lib/app-name";
import { PageTransition } from "@/components/PageTransition";

// 중고거래 관리 전용 공간(/market) — 매물 신고 처리·매물 모니터링·차단 관리.
// 운영 관리자(/admin)·게시판(/board) 등과 분리된 설치형 PWA "이로이로 중고거래".
// 접근은 중고거래 관리자(= site admin 또는 used 부분 권한). Server Action은 requireUsedManager에서 재검증.
// 셸은 공용 AdminShell(scope="market") — 메뉴 정의만 다르다(modules/admin/lib/nav.ts MARKET_SECTIONS).

export async function generateMetadata(): Promise<Metadata> {
  const name = appDisplayName(APP_NAMES.market);
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: "/market/manifest.webmanifest",
    icons: {
      icon: [{ url: "/brand/market-icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/brand/market-icon-512.png", sizes: "512x512", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f4a06a",
};

export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  await connection();

  const account = await getCurrentAccount();
  if (!account) redirect("/login?returnTo=/market");
  if (!hasAdminSpace(account, "used")) redirect("/");

  return (
    <AdminShell
      scope="market"
      appName={appDisplayName(APP_NAMES.market)}
      isDev={isDevDeploy()}
      isSiteAdmin={isAdmin(account)}
      spaces={[...adminRolesOf(account)]}
    >
      <PageTransition>{children}</PageTransition>
    </AdminShell>
  );
}
