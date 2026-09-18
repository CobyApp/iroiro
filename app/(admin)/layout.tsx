import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminShell } from "@/modules/admin/components/AdminShell";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { isBoardManager } from "@/modules/admin/lib/roles";
import { PageTransition } from "@/components/PageTransition";

// 관리자 영역은 별도 설치형 PWA — 이름·아이콘·테마를 소비자앱과 분리한다.
// 이 layout이 관장하는 /admin 하위 전체에 매니페스트·아이콘·테마가 적용된다.
export const metadata: Metadata = {
  title: { default: "이로이로 관리자", template: "%s · 이로이로 관리자" },
  applicationName: "이로이로 관리자",
  manifest: "/admin/manifest.webmanifest",
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
    title: "이로이로 관리자",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#211B34",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // 권한 가드 (룰 3) — 자체 세션 검증. 비로그인은 로그인으로, 권한 없으면 홈으로.
  // site admin은 전체, 게시판 moderator는 커뮤니티 관리 섹션만(사이드바에서 필터).
  // Server Action은 layout과 별개로 requireAdmin/requireBoardManager에서 재검증.
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (!isBoardManager(account)) redirect("/");

  return (
    <AdminShell isSiteAdmin={isAdmin(account)}>
      <PageTransition>{children}</PageTransition>
    </AdminShell>
  );
}
