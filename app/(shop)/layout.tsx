import { Suspense } from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartButton } from "@/modules/cart/components/CartButton";
import { NotificationBell } from "@/modules/notifications/components/NotificationBell";
import { AccountNav } from "@/modules/auth/components/AccountNav";
import { BrandLockup } from "@/modules/ui/components/BrandMark";
import Link from "next/link";
import { listTeams } from "@/modules/teams/lib/queries";
import { getSearchTagFacets } from "@/modules/search/lib/tag-facets";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getPublicUrl } from "@/lib/r2/presign";
import { SiteFooter } from "./_components/SiteFooter";
import { MobileTabBar } from "./_components/MobileTabBar";
import { DesktopNavLinks } from "./_components/DesktopNavLinks";
import { HeaderLeading } from "./_components/HeaderLeading";
import { NavigationFeedback } from "./_components/NavigationFeedback";
import { PageTransition } from "@/components/PageTransition";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 검색 패널의 그룹 필터 태그 — 그룹 표는 작아(수 개) 레이아웃에서 가볍게 읽는다.
  // 태그 facet — 상품/매물이 없는 그룹·종류·판매방식 태그는 감춘다(빈 결과 방지).
  const [teams, tagFacets, account] = await Promise.all([
    listTeams(),
    getSearchTagFacets(),
    getCurrentAccount().catch(() => null),
  ]);
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));
  // 마이 탭 헤더에 보여줄 최소 계정 정보(모바일). 비로그인은 null → 로고 폴백.
  const headerAccount = account
    ? {
        displayName: account.displayName ?? "회원",
        avatarUrl: account.avatarKey ? getPublicUrl(account.avatarKey) : null,
      }
    : null;

  return (
    <TooltipProvider>
      <div className="relative flex min-h-screen flex-col">
        <Suspense fallback={null}>
          <NavigationFeedback />
        </Suspense>

        <header className="shop-header sticky top-0 z-30 border-b border-border/50 bg-cream/82 backdrop-blur-xl">
          {/* 로고 좌 / 탐색과 구매·계정 기능 우. */}
          <div className="shop-page-frame flex h-16 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-0">
            {/* 데스크톱은 좌측 로고를 상시 노출하고 그 오른쪽에 검색바를 둔다(공간 충분). */}
            <Link
              href="/"
              aria-label="이로이로 홈"
              className="hidden shrink-0 sm:block"
            >
              <BrandLockup markClassName="h-8 w-8" wordmarkClassName="h-5" />
            </Link>
            {/* 탭에 따라 검색(스토어·중고·커뮤니티)·뒤로가기(상세)·로고로 바뀐다. */}
            <HeaderLeading teams={teamOptions} tagFacets={tagFacets} account={headerAccount} />
            {/* 핵심 탐색과 구매·계정 기능을 시각적으로 분리해 메뉴 밀도를 낮춘다. */}
            <div className="flex min-w-0 shrink-0 items-center gap-0 sm:gap-2">
              <div className="hidden sm:block">
                <DesktopNavLinks />
              </div>
              <span
                className="hidden h-6 w-px bg-border/60 sm:block"
                aria-hidden="true"
              />
              <Suspense
                fallback={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2.5"
                    aria-label="장바구니"
                    disabled
                  >
                    <ShoppingBag className="h-5 w-5" />
                    <span className="hidden lg:inline">장바구니</span>
                  </Button>
                }
              >
                <CartButton />
              </Suspense>
              {/* 쪽지는 커뮤니티(/posts) 안 메뉴로 옮겼다 — 헤더에서 제거. */}
              {/* 알림 벨 — 장바구니 오른쪽. 로그인 시에만 렌더(내부에서 판단). */}
              <Suspense fallback={null}>
                <NotificationBell />
              </Suspense>
              <Suspense
                fallback={
                  <div className="h-9 w-9 rounded-full bg-muted/50 sm:w-16" />
                }
              >
                <AccountNav />
              </Suspense>
            </div>
          </div>
        </header>

        <main className="shop-main relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <PageTransition>{children}</PageTransition>
        </main>

        <SiteFooter />
        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
