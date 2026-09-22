import type { ReactNode } from "react";
import { PageBack } from "@/components/PageBack";

// 인증 화면 전용 레이아웃 — shop 헤더·탭바 없이 상단 뒤로가기만. 중앙 정렬.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10">
      <div className="flex items-center gap-2 py-3">
        <PageBack fallbackHref="/" />
        <span className="text-sm text-muted-foreground">뒤로가기</span>
      </div>
      <main className="flex-1">{children}</main>
    </div>
  );
}
