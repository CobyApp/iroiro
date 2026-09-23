import type { Metadata, Viewport } from "next";
import { AdminAccessNotice } from "@/modules/admin/components/AdminAccessNotice";
import { connection } from "next/server";
import "@/app/catalog-theme.css";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminShell } from "@/modules/admin/components/AdminShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { adminRolesOf, hasAdminSpace } from "@/modules/admin/lib/adminRoles";
import { APP_NAMES, appDisplayName, isDevDeploy } from "@/lib/app-name";
import { PageTransition } from "@/components/PageTransition";

// 카탈로그 전용 공간 — 토레카 마스터 데이터(토레카·검수·시리즈·종류·그룹·멤버)를 관리한다.
// 운영 관리자(/admin)·소비자앱과 분리된 세 번째 설치형 PWA "이로이로 토레카". dev 배포는 이름에 " dev".
// 셸은 운영 관리자와 같은 AdminShell(scope="catalog") — 메뉴 정의만 다르다(modules/admin/lib/nav.ts).
// 시각 언어는 이로이로 디자인 시스템 공통 — app/catalog-theme.css 는 그룹 고유색·수치 유틸만 더한다.

export async function generateMetadata(): Promise<Metadata> {
  const name = appDisplayName(APP_NAMES.catalog);
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: "/admin/catalog/manifest.webmanifest",
    icons: {
      icon: [{ url: "/brand/catalog-icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/brand/catalog-icon-512.png", sizes: "512x512", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#9a8cf4",
};

export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // 권한 가드 (룰 3) — 토레카 관리 권한(catalog) 또는 site admin. 비로그인은 로그인으로,
  // 권한 없으면 홈으로. Server Action은 requireCatalogManager에서 재검증.
  const account = await getCurrentAccount();
  if (!account) return <AdminAccessNotice mode="login" returnTo="/admin/catalog" />;
  if (!hasAdminSpace(account, "catalog")) {
    return <AdminAccessNotice mode="forbidden" spaceLabel="토레카" />;
  }

  return (
    <AdminShell
      scope="catalog"
      appName={appDisplayName(APP_NAMES.catalog)}
      isDev={isDevDeploy()}
      isSiteAdmin={isAdmin(account)}
      spaces={[...adminRolesOf(account)]}
    >
      {/* 카탈로그 페이지는 자체 여백이 없어 레이아웃에서 공용 페이지 프레임을 한 번 감싼다. */}
      <AdminPage className="mx-auto max-w-7xl">
        <PageTransition>{children}</PageTransition>
      </AdminPage>
    </AdminShell>
  );
}
