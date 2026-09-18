import Link from "next/link";
import type { ReactNode } from "react";
import { PageTransition } from "@/components/PageTransition";
import { BrandLockup } from "@/modules/ui/components/BrandMark";

// 랜딩/온보딩 전용 경량 레이아웃 — 소개 페이지는 상단 네비 없이 몰입형으로.
// 방해 요소를 없애고 콘텐츠·CTA에만 집중시킨다.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      {/* 네비 없음 — 소개 페이지는 콘텐츠·CTA에만 집중한다. */}
      <main className="relative z-10 w-full flex-1">
        <PageTransition>{children}</PageTransition>
      </main>

      <footer className="relative z-10 border-t border-border bg-cream/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <BrandLockup markClassName="h-7 w-7" wordmarkClassName="h-4" />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">
              서비스 둘러보기
            </Link>
            <Link
              href="/guide"
              className="transition-colors hover:text-foreground"
            >
              입덕 가이드
            </Link>
            <span>© 2026 이로이로</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
