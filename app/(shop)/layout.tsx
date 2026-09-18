import Link from "next/link";
import { Suspense } from "react";
import { Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandLockup } from "@/modules/ui/components/BrandMark";
import { WishlistNavButton } from "@/modules/wishlist/components/WishlistNavButton";
import { CartButton } from "@/modules/cart/components/CartButton";
import { NotificationBell } from "@/modules/notifications/components/NotificationBell";
import { MessagesNavButton } from "@/modules/messages/components/MessagesNavButton";
import { AccountNav } from "@/modules/auth/components/AccountNav";
import { SiteFooter } from "./_components/SiteFooter";
import { MobileTabBar } from "./_components/MobileTabBar";
import { DesktopNavLinks } from "./_components/DesktopNavLinks";
import { NavigationFeedback } from "./_components/NavigationFeedback";
import { PageTransition } from "@/components/PageTransition";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <div className="relative flex min-h-screen flex-col">
        <Suspense fallback={null}>
          <NavigationFeedback />
        </Suspense>

        <header className="shop-header sticky top-0 z-30 border-b border-border/50 bg-cream/82 backdrop-blur-xl">
          {/* 로고 좌 / 탐색과 구매·계정 기능 우. */}
          <div className="shop-page-frame flex h-16 items-center justify-between gap-3 px-4 sm:px-0">
            <Link
              href="/"
              aria-label="이로이로 홈"
              className="shop-brand flex shrink-0 items-center gap-1.5"
            >
              <BrandLockup
                className="gap-2.5"
                markClassName="h-10 w-10"
                wordmarkClassName="h-[25px]"
                preload
              />
            </Link>
            {/* 핵심 탐색과 구매·계정 기능을 시각적으로 분리해 메뉴 밀도를 낮춘다. */}
            <div className="flex items-center gap-0.5 sm:gap-2">
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
                    aria-label="찜"
                    disabled
                  >
                    <Heart className="h-5 w-5" />
                    <span className="hidden lg:inline">찜</span>
                  </Button>
                }
              >
                <WishlistNavButton />
              </Suspense>
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
              {/* 쪽지 — 로그인 시에만 렌더(내부에서 판단). */}
              <Suspense fallback={null}>
                <MessagesNavButton />
              </Suspense>
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
