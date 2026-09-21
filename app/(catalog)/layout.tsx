import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CatalogShell } from "@/modules/admin/components/CatalogShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { PageTransition } from "@/components/PageTransition";

// 카탈로그 전용 공간 — 토레카 마스터 데이터(토레카·종류/포즈·그룹·멤버·분석기 가져오기·AI 데이터)를
// 관리한다. 운영 관리자(/admin)와 분리된 별도 설치형 PWA이며, 이 layout이 /catalog 하위 전체를 관장한다.
export const metadata: Metadata = {
  title: { default: "이로이로 카탈로그", template: "%s · 이로이로 카탈로그" },
  applicationName: "이로이로 카탈로그",
  manifest: "/catalog/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/admin-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/brand/admin-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "이로이로 카탈로그",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#211B34",
};

export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // 권한 가드 (룰 3) — 카탈로그는 site admin 전용. 게시판 moderator는 들어올 수 없다.
  // 비로그인은 로그인으로, 권한 없으면 홈으로. Server Action은 requireAdmin에서 재검증.
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (!isAdmin(account)) redirect("/");

  return (
    <CatalogShell>
      <PageTransition>{children}</PageTransition>
    </CatalogShell>
  );
}
