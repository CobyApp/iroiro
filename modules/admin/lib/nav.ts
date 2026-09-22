import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Calculator,
  Coins,
  ImageIcon,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Tag,
  Truck,
  User,
  UserCog,
  Users,
  WalletCards,
} from "lucide-react";

// 관리자(/admin)·카탈로그(/catalog) 공용 셸의 메뉴 정의 — 데이터로 두고 사이드바가 렌더한다.
// 권한 필터(visibleSections)·활성 판정(isNavItemActive)은 순수 함수라 단위 테스트가 붙는다.

/**
 * 메뉴 항목을 볼 수 있는 최소 권한.
 * - boardManager: site admin 또는 게시판 moderator (커뮤니티 관리)
 * - admin: 운영 관리자 콘솔 — site admin(account.is_admin)
 * - siteAdmin: 카탈로그 등 site admin 전용 공간 — 판정은 admin과 같다(is_admin).
 */
export type NavRole = "boardManager" | "admin" | "siteAdmin";

export type NavItem = {
  /** 렌더 key·테스트 식별자. 섹션 목록 안에서 유일. */
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  /** 지정 시 이 prefix(와 하위 경로)에서 활성. 없으면 href와 정확히 일치할 때만 활성. */
  matchPrefix?: string;
  role: NavRole;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export type NavViewer = {
  isSiteAdmin: boolean;
  isBoardManager: boolean;
};

const ROLE_CHECK: Record<NavRole, (viewer: NavViewer) => boolean> = {
  boardManager: (v) => v.isBoardManager,
  admin: (v) => v.isSiteAdmin,
  siteAdmin: (v) => v.isSiteAdmin,
};

/** 뷰어 권한으로 항목을 걸러내고, 비어버린 섹션은 제거한다. */
export function visibleSections(sections: NavSection[], viewer: NavViewer): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => ROLE_CHECK[item.role](viewer)),
    }))
    .filter((section) => section.items.length > 0);
}

/** matchPrefix가 있으면 prefix 자체와 하위 경로(`prefix/…`)에서 활성, 없으면 href 정확 일치. */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) {
    return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);
  }
  return pathname === item.href;
}

// 운영 관리자 — 홈 / 판매 / 커뮤니티 / 콘텐츠 / 회원 / 스토어 / 바로가기.
// 계정(로그아웃)은 헤더 우측 AdminAccountMenu로.
export const ADMIN_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "dashboard", label: "대시보드", href: "/admin", icon: LayoutDashboard, role: "admin" },
    ],
  },
  {
    title: "판매",
    items: [
      {
        key: "products",
        label: "상품",
        href: "/admin/products",
        icon: Package,
        matchPrefix: "/admin/products",
        role: "admin",
      },
      {
        key: "orders",
        label: "주문",
        href: "/admin/orders",
        icon: ShoppingBag,
        matchPrefix: "/admin/orders",
        role: "admin",
      },
      {
        key: "settlement",
        label: "정산",
        href: "/admin/settlement",
        icon: Calculator,
        matchPrefix: "/admin/settlement",
        role: "admin",
      },
      {
        key: "delivery",
        label: "배송",
        href: "/admin/delivery",
        icon: Truck,
        matchPrefix: "/admin/delivery",
        role: "admin",
      },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      {
        key: "banners",
        label: "배너",
        href: "/admin/banners",
        icon: ImageIcon,
        matchPrefix: "/admin/banners",
        role: "admin",
      },
      {
        key: "reviews",
        label: "리뷰",
        href: "/admin/reviews",
        icon: Star,
        matchPrefix: "/admin/reviews",
        role: "admin",
      },
    ],
  },
  {
    title: "회원",
    items: [
      {
        key: "points",
        label: "포인트 · 쿠폰",
        href: "/admin/points",
        icon: Coins,
        matchPrefix: "/admin/points",
        role: "admin",
      },
    ],
  },
  {
    title: "스토어",
    items: [
      {
        key: "settings",
        label: "설정",
        href: "/admin/settings",
        icon: Settings,
        matchPrefix: "/admin/settings",
        role: "admin",
      },
    ],
  },
  {
    title: "바로가기",
    items: [
      // 토레카 마스터·게시판 관리는 각각 별도 공간(/catalog·/board)에서 — 여기서는 진입 링크만.
      {
        key: "to-catalog",
        label: "토레카 카탈로그 →",
        href: "/catalog",
        icon: ArrowRight,
        role: "siteAdmin",
      },
      {
        key: "to-board",
        label: "게시판 관리 →",
        href: "/board",
        icon: MessageSquare,
        role: "admin",
      },
    ],
  },
];

// 게시판 관리 — 별도 설치형 공간. site admin + 게시판 moderator 진입.
// 공지·게시판/신고는 moderator+admin, 회원·등급(권한 부여·제재)은 site admin 전용.
export const BOARD_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/board", icon: LayoutDashboard, role: "boardManager" },
    ],
  },
  {
    title: "게시판",
    items: [
      {
        key: "posts",
        label: "게시판 · 신고",
        href: "/board/posts",
        icon: MessageSquare,
        matchPrefix: "/board/posts",
        role: "boardManager",
      },
      {
        key: "notices",
        label: "공지",
        href: "/board/notices",
        icon: Megaphone,
        matchPrefix: "/board/notices",
        role: "boardManager",
      },
      {
        key: "users",
        label: "회원 · 등급",
        href: "/board/users",
        icon: UserCog,
        matchPrefix: "/board/users",
        role: "admin",
      },
    ],
  },
  {
    title: "바로가기",
    items: [
      { key: "to-admin", label: "운영 관리자 →", href: "/admin", icon: ArrowRight, role: "siteAdmin" },
      {
        key: "to-catalog",
        label: "토레카 카탈로그 →",
        href: "/catalog",
        icon: ArrowRight,
        role: "siteAdmin",
      },
    ],
  },
];

// 카탈로그 — 홈은 정확히 /catalog 일 때만 활성, 나머지는 하위 경로까지.
// 검수는 /catalog/cards 안의 탭이라 별도 항목을 두지 않는다.
export const CATALOG_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/catalog", icon: LayoutDashboard, role: "siteAdmin" },
    ],
  },
  {
    title: "마스터 데이터",
    items: [
      {
        key: "cards",
        label: "토레카",
        href: "/catalog/cards",
        icon: WalletCards,
        matchPrefix: "/catalog/cards",
        role: "siteAdmin",
      },
      {
        key: "series",
        label: "시리즈",
        href: "/catalog/series",
        icon: Layers,
        matchPrefix: "/catalog/series",
        role: "siteAdmin",
      },
      {
        key: "kinds",
        label: "종류",
        href: "/catalog/kinds",
        icon: Tag,
        matchPrefix: "/catalog/kinds",
        role: "siteAdmin",
      },
      {
        key: "teams",
        label: "그룹",
        href: "/catalog/teams",
        icon: Users,
        matchPrefix: "/catalog/teams",
        role: "siteAdmin",
      },
      {
        key: "members",
        label: "멤버",
        href: "/catalog/members",
        icon: User,
        matchPrefix: "/catalog/members",
        role: "siteAdmin",
      },
    ],
  },
  {
    title: "바로가기",
    items: [
      {
        key: "to-admin",
        label: "운영 관리자 →",
        href: "/admin",
        icon: ArrowRight,
        role: "siteAdmin",
      },
    ],
  },
];
