import type { ReactNode } from "react";

// 인증 화면 전용 레이아웃 — 중앙 정렬, shop 네비 미포함.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
