import type { Metadata } from "next";
import Link from "next/link";
import {
  Coins,
  Sparkles,
  Gavel,
  ArrowRight,
  ChevronRight,
  LogOut,
  LibraryBig,
  PackageCheck,
  UserRound,
  UserCog,
  MapPin,
  IdCard,
  Mail,
} from "lucide-react";
import { getCurrentAccount } from "@/modules/auth/dal";
import { LogoutConfirmDialog } from "@/modules/auth/components/LogoutConfirmDialog";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";
import { getInventory } from "@/modules/collection/lib/queries";
import { getPointBalance } from "@/modules/points/lib/queries";
import { Button } from "@/components/ui/button";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { ProfileAvatar } from "./_components/ProfileAvatar";
import { DeleteAccountItem } from "./_components/DeleteAccountItem";
import { PushToggle } from "@/modules/notifications/components/PushToggle";

// 메뉴는 두 갈래로만 — 쇼핑·거래(사고 파는 일)와 내 정보(취향·계정).
// 찜·중고거래는 하단 탭에 이미 있어 여기서는 빼 중복을 없앤다. 포인트는 위 요약 타일에서도 진입한다.
const MY_LINK_SECTIONS = [
  {
    title: "쇼핑 · 거래",
    links: [
      {
        href: "/orders",
        label: "주문 내역",
        description: "결제 · 배송 확인",
        icon: PackageCheck,
      },
      {
        href: "/mypage/bids",
        label: "입찰 내역",
        description: "진행중 경매 · 낙찰",
        icon: Gavel,
      },
      {
        href: "/mypage/points",
        label: "포인트 · 쿠폰",
        description: "잔액 · 적립 · 쿠폰",
        icon: Coins,
      },
      {
        href: "/cards/new",
        label: "토레카 등록",
        description: "카드 제보 · 승인 시 100P",
        icon: IdCard,
      },
    ],
  },
  {
    title: "내 정보",
    links: [
      {
        href: "/mypage/favorites",
        label: "최애 설정",
        description: "좋아하는 그룹 · 멤버",
        icon: Sparkles,
      },
      {
        href: "/messages",
        label: "쪽지함",
        description: "1:1 대화",
        icon: Mail,
      },
      {
        href: "/mypage/edit",
        label: "회원정보 변경",
        description: "닉네임 · 프로필",
        icon: UserCog,
      },
      {
        href: "/mypage/addresses",
        label: "주소록",
        description: "배송지 관리",
        icon: MapPin,
      },
    ],
  },
] as const;

export const metadata: Metadata = { title: "마이페이지" };

// 마이페이지 — 컬렉션을 내 공간의 첫 행동으로 두고, 쇼핑 활동과 계정 관리를 분리한다.
export default async function MyPage() {
  const account = await getCurrentAccount().catch(() => null);

  if (!account) {
    return (
      <div className="shop-page-frame space-y-6">
        <ShopPageHeader title="마이페이지" />
        <GuestFeatureGate
          icon={UserRound}
          title="이로이로를 나만의 공간으로 만들어보세요"
          description="로그인하면 마음에 든 상품을 저장하고, 구매한 카드를 컬렉션에 모아 언제든 이어서 볼 수 있어요."
          benefits={[
            "찜한 상품을 기기와 상관없이 저장",
            "주문과 배송 상태 한눈에 확인",
            "소장 카드를 나만의 컬렉션으로 정리",
          ]}
        />
      </div>
    );
  }

  const [inventory, pointBalance] = await Promise.all([
    getInventory(account.id),
    getPointBalance(account.id),
  ]);
  const totalCards = inventory.reduce((sum, entry) => sum + entry.quantity, 0);
  const displayName = account.displayName ?? "회원";

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader title={`${displayName}님의 공간`} />

      {/* 프로필 + 요약 — 소장 카드·포인트를 숫자로, 컬렉션 진입은 여기 한 곳에서만. */}
      <section
        className="shop-content-surface space-y-5"
        aria-labelledby="profile-summary-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <ProfileAvatar
              avatarKey={account.avatarKey}
              displayName={displayName}
              size={72}
            />
            <div className="min-w-0">
              <p className="shop-section-eyebrow">PROFILE</p>
              <h2
                id="profile-summary-title"
                className="mt-1 truncate text-xl font-semibold text-foreground"
              >
                {displayName}
              </h2>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/collections">
              <LibraryBig />
              컬렉션 열기
              <ArrowRight />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border/60 rounded-xl border border-border/70 bg-card/70">
          <Link href="/collections" className="px-4 py-3.5 transition-colors hover:bg-muted/50">
            <p className="text-xs text-muted-foreground">소장 카드</p>
            <p className="mt-1 font-display text-xl text-foreground">
              {totalCards}
              <span className="ml-0.5 text-sm font-medium">장</span>
            </p>
          </Link>
          <Link href="/mypage/points" className="px-4 py-3.5 transition-colors hover:bg-muted/50">
            <p className="text-xs text-muted-foreground">보유 포인트</p>
            <p className="mt-1 font-display text-xl text-foreground">
              {pointBalance.toLocaleString()}
              <span className="ml-0.5 text-sm font-medium">P</span>
            </p>
          </Link>
        </div>
      </section>

      <section
        className="shop-content-surface space-y-4"
        aria-labelledby="quick-actions-title"
      >
        <div>
          <p className="shop-section-eyebrow">MY MENU</p>
          <h2 id="quick-actions-title" className="shop-section-title">
            내 메뉴
          </h2>
        </div>
        <nav aria-label="마이페이지 메뉴" className="space-y-5">
          {MY_LINK_SECTIONS.map((section) => {
            const links = section.links;
            return (
              <div key={section.title} className="space-y-2">
                <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {section.title}
                </p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {links.map(({ href, label, description, icon: Icon }) => (
                    <li key={href}>
                      <Link href={href} className="mypage-quick-link group">
                        <span className="mypage-quick-link-icon">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {label}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {description}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </section>

      {/* 알림 설정 — 이 기기의 푸시 온오프 (벨 팝오버와 동일 로직) */}
      <section
        className="shop-content-surface space-y-4"
        aria-labelledby="notification-settings-title"
      >
        <div>
          <p className="shop-section-eyebrow">NOTIFICATIONS</p>
          <h2 id="notification-settings-title" className="shop-section-title">
            알림 설정
          </h2>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-1">
          <PushToggle variant="settings" />
        </div>
      </section>

      <section
        className="shop-content-surface space-y-4"
        aria-labelledby="account-actions-title"
      >
        <div>
          <p className="shop-section-eyebrow">ACCOUNT</p>
          <h2 id="account-actions-title" className="shop-section-title">
            계정 관리
          </h2>
        </div>
        <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/70 p-1">
          <LogoutConfirmDialog>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </LogoutConfirmDialog>
          <DeleteAccountItem />
        </div>
      </section>
    </div>
  );
}
