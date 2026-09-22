import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminShell } from "@/modules/admin/components/AdminShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { adminRolesOf, hasAdminSpace } from "@/modules/admin/lib/adminRoles";
import { APP_NAMES, appDisplayName, isDevDeploy } from "@/lib/app-name";
import { PageTransition } from "@/components/PageTransition";

// 게시판 관리 전용 공간 — 공지·게시판/신고·회원등급을 관리한다.
// 운영 관리자(/admin)·카탈로그(/admin/catalog)와 분리된 설치형 PWA "이로이로 게시판".
// 접근은 게시판 관리자(= site admin 또는 moderator). 회원·등급 편집만 site admin 전용(메뉴에서 필터).
// 셸은 공용 AdminShell(scope="board") — 메뉴 정의만 다르다(modules/admin/lib/nav.ts BOARD_SECTIONS).

export async function generateMetadata(): Promise<Metadata> {
  const name = appDisplayName(APP_NAMES.board);
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: "/admin/posts/manifest.webmanifest",
    icons: {
      icon: [{ url: "/brand/board-icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/brand/board-icon-512.png", sizes: "512x512", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#2fb7a5",
};

export default async function BoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // 권한 가드 (룰 3) — 게시판 관리자(admin+moderator)만. 비로그인은 로그인으로, 권한 없으면 홈으로.
  // Server Action은 requireBoardManager/requireAdmin에서 재검증.
  const account = await getCurrentAccount();
  if (!account) redirect("/login?returnTo=/admin/posts");
  if (!hasAdminSpace(account, "community")) redirect("/");

  return (
    <AdminShell
      scope="board"
      appName={appDisplayName(APP_NAMES.board)}
      isDev={isDevDeploy()}
      isSiteAdmin={isAdmin(account)}
      spaces={[...adminRolesOf(account)]}
    >
      <PageTransition>{children}</PageTransition>
    </AdminShell>
  );
}
