import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminShell } from "@/modules/admin/components/AdminShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { adminRolesOf, hasAdminSpace } from "@/modules/admin/lib/adminRoles";
import { APP_NAMES, appDisplayName, isDevDeploy } from "@/lib/app-name";
import { PageTransition } from "@/components/PageTransition";

// 스토어·배송 관리 전용 공간 — 스토어 상품·주문·정산 + 배송 정책.
// 셸은 공용 AdminShell(scope="delivery") — 메뉴 정의만 다르다(nav.ts DELIVERY_SECTIONS).

export async function generateMetadata(): Promise<Metadata> {
  const name = appDisplayName(APP_NAMES.delivery);
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: "/delivery/manifest.webmanifest",
    icons: {
      icon: [{ url: "/brand/delivery-icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/brand/delivery-icon-512.png", sizes: "512x512", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#93dcf8",
};

export default async function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  const account = await getCurrentAccount();
  if (!account) redirect("/login?returnTo=/delivery");
  if (!hasAdminSpace(account, "delivery")) redirect("/");

  return (
    <AdminShell
      scope="delivery"
      appName={appDisplayName(APP_NAMES.delivery)}
      isDev={isDevDeploy()}
      isSiteAdmin={isAdmin(account)}
      spaces={[...adminRolesOf(account)]}
    >
      <PageTransition>{children}</PageTransition>
    </AdminShell>
  );
}
