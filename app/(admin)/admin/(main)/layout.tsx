import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminShell } from "@/modules/admin/components/AdminShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { primaryAdminHref } from "@/modules/admin/lib/adminRoles";
import { PageTransition } from "@/components/PageTransition";
import { APP_NAMES, appDisplayName, isDevDeploy } from "@/lib/app-name";

// 운영 관리자 대시보드((main) 그룹) 전용 — 별도 설치형 PWA "이로이로 관리자".
// 매니페스트·아이콘·테마는 /admin, /admin/banners, /admin/users, /admin/points 에만 적용된다.
// (스토어·중고·커뮤니티·토레카 공간은 각자 layout에서 자기 매니페스트를 준다.) dev 배포는 이름에 " dev".
export async function generateMetadata(): Promise<Metadata> {
  const name = appDisplayName(APP_NAMES.admin);
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: "/admin/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/brand/admin-icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [
        { url: "/brand/admin-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    // 헤더가 밝은 카드색이라 상태바도 기본(어두운 글자) — 셸이 safe-area 상단 패딩을 직접 준다.
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: "default",
    },
  };
}

// 밝은 UI(크림 배경)에 맞춘 테마색 — 매니페스트(background_color·theme_color)와 동일.
export const viewport: Viewport = {
  themeColor: "#fffdf9",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // 권한 가드 (룰 3) — 메인 운영 관리자(/admin)는 site admin 전용. 부분 관리자는 각자 공간으로.
  // (배송·중고·커뮤니티·토레카) 부분 권한만 있으면 가진 권한의 첫 공간으로 보낸다.
  // Server Action은 layout과 별개로 requireAdmin/requireAdminSpace에서 재검증.
  const account = await getCurrentAccount();
  if (!account) redirect("/login?returnTo=/admin");
  if (!isAdmin(account)) redirect(primaryAdminHref(account) ?? "/");

  return (
    <AdminShell
      scope="admin"
      appName={appDisplayName(APP_NAMES.admin)}
      isDev={isDevDeploy()}
      isSiteAdmin
    >
      <PageTransition>{children}</PageTransition>
    </AdminShell>
  );
}
