import Link from "next/link";
import { BrandLockup } from "@/modules/ui/components/BrandMark";

const LINKS = [
  { href: "/welcome", label: "소개" },
  { href: "/guide", label: "입덕 가이드" },
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
];

// 하단 푸터 — 데스크톱은 좌우 정렬 한 단, 모바일은 중앙 정렬 스택.
export function SiteFooter() {
  return (
    <footer className="shop-footer relative z-10 mt-10 border-t-[3px] border-border bg-cream/70 pb-[var(--shop-tabbar-safe)] backdrop-blur sm:pb-0">
      {/* 모바일: 하단 고정 탭바 높이만큼 크림 배경을 늘려 바와 푸터 사이 여백을 없앤다. */}
      <div className="shop-page-frame px-4 py-7 sm:px-0 sm:py-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-center gap-1.5 sm:items-start">
            <BrandLockup markClassName="h-8 w-8" wordmarkClassName="h-5" />
            <p className="text-xs text-muted-foreground">
              일본 아이돌 토레카·굿즈, 이제 한국에서
            </p>
          </div>
          <nav
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5"
            aria-label="사이트 안내"
          >
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-5 border-t border-border/60 pt-4 text-center text-[11px] text-muted-foreground sm:text-left">
          © 2026 이로이로 · 문의는 커뮤니티 게시판으로
        </p>
      </div>
    </footer>
  );
}
