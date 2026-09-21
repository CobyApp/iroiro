import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import "@/app/catalog-theme.css";
import { CatalogShell } from "@/modules/admin/components/CatalogShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { APP_NAMES, appDisplayName, isDevDeploy } from "@/lib/app-name";
import { PageTransition } from "@/components/PageTransition";

// 카탈로그 전용 공간 — 토레카 마스터 데이터(토레카·검수·시리즈·종류·그룹·멤버)를 관리한다.
// 운영 관리자(/admin)·소비자앱과 분리된 세 번째 설치형 PWA "이로이로 토레카". dev 배포는 이름에 " dev".
// 시각 언어도 분리: app/catalog-theme.css 가 data-theme="catalog" 스코프에 토큰을 덮어쓴다.

export async function generateMetadata(): Promise<Metadata> {
  const name = appDisplayName(APP_NAMES.catalog);
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: "/catalog/manifest.webmanifest",
    icons: {
      icon: [{ url: "/brand/catalog-icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/brand/catalog-icon-512.png", sizes: "512x512", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#5b5bd6",
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
    <div data-theme="catalog">
      <CatalogShell appName={appDisplayName(APP_NAMES.catalog)} isDev={isDevDeploy()}>
        <PageTransition>{children}</PageTransition>
      </CatalogShell>
    </div>
  );
}
