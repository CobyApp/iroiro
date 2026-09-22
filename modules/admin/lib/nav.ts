import type { LucideIcon } from "lucide-react";
import type { AdminSpace } from "./adminRoles";
import {
  ArrowRight,
  Coins,
  ImageIcon,
  Layers,
  Ban,
  Flag,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  Store,
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
 * - siteAdmin: 메인 운영 관리자 전용 — site admin(account.is_admin).
 * - delivery|used|community|catalog: 각 관리 공간의 부분 권한(site admin 은 전부 포함).
 */
export type NavRole = "siteAdmin" | AdminSpace;

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
  /** 보유한 부분 관리 권한. site admin 은 전부 가진 것으로 본다(아래 ROLE_CHECK). */
  spaces: ReadonlySet<AdminSpace>;
};

function hasSpace(viewer: NavViewer, space: AdminSpace): boolean {
  return viewer.isSiteAdmin || viewer.spaces.has(space);
}

const ROLE_CHECK: Record<NavRole, (viewer: NavViewer) => boolean> = {
  siteAdmin: (v) => v.isSiteAdmin,
  delivery: (v) => hasSpace(v, "delivery"),
  used: (v) => hasSpace(v, "used"),
  community: (v) => hasSpace(v, "community"),
  catalog: (v) => hasSpace(v, "catalog"),
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

// 운영 관리자 — 홈 / 콘텐츠 / 회원 / 스토어 / 바로가기.
// 스토어 상품·주문·정산·배송은 스토어·배송 공간(/delivery)으로 분리됐다(바로가기로 진입).
// 계정(로그아웃)은 헤더 우측 AdminAccountMenu로.
export const ADMIN_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "dashboard", label: "대시보드", href: "/admin", icon: LayoutDashboard, role: "siteAdmin" },
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
        role: "siteAdmin",
      },
    ],
  },
  {
    title: "회원",
    items: [
      {
        key: "users",
        label: "회원 · 등급",
        href: "/admin/users",
        icon: UserCog,
        matchPrefix: "/admin/users",
        role: "siteAdmin",
      },
      {
        key: "points",
        label: "포인트 · 쿠폰",
        href: "/admin/points",
        icon: Coins,
        matchPrefix: "/admin/points",
        role: "siteAdmin",
      },
    ],
  },
  {
    title: "바로가기",
    items: [
      // 스토어·중고·커뮤니티·토레카는 각각 별도 공간에서 — 메인에서는 진입 링크만(역방향은 없음).
      {
        key: "to-delivery",
        label: "스토어 관리 →",
        href: "/delivery",
        icon: Truck,
        role: "siteAdmin",
      },
      {
        key: "to-market",
        label: "중고거래 관리 →",
        href: "/market",
        icon: Store,
        role: "siteAdmin",
      },
      {
        key: "to-board",
        label: "커뮤니티 관리 →",
        href: "/board",
        icon: MessageSquare,
        role: "siteAdmin",
      },
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

// 중고거래 관리 — 별도 설치형 공간(/market). site admin + used 부분 권한.
// 신고 처리(매물 차단·해제·기각)와 매물 모니터링을 한곳에서. 회원 제재는 메인 관리자에서.
export const MARKET_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/market", icon: LayoutDashboard, role: "used" },
    ],
  },
  {
    title: "중고거래",
    items: [
      {
        key: "reports",
        label: "매물 신고",
        href: "/market/reports",
        icon: Flag,
        matchPrefix: "/market/reports",
        role: "used",
      },
      {
        key: "review-reports",
        label: "후기 신고",
        href: "/market/review-reports",
        icon: Star,
        matchPrefix: "/market/review-reports",
        role: "used",
      },
      {
        key: "listings",
        label: "매물",
        href: "/market/listings",
        icon: Store,
        matchPrefix: "/market/listings",
        role: "used",
      },
      {
        key: "blocked",
        label: "차단 매물",
        href: "/market/blocked",
        icon: Ban,
        matchPrefix: "/market/blocked",
        role: "used",
      },
      {
        key: "fee",
        label: "판매 수수료",
        href: "/market/settings",
        icon: Coins,
        matchPrefix: "/market/settings",
        role: "used",
      },
    ],
  },
];

// 스토어·배송 관리 — 스토어 상품·주문·정산 + 배송 정책. site admin + delivery 부분 권한.
export const DELIVERY_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/delivery", icon: LayoutDashboard, role: "delivery" },
    ],
  },
  {
    title: "판매",
    items: [
      {
        key: "products",
        label: "상품",
        href: "/delivery/products",
        icon: Package,
        matchPrefix: "/delivery/products",
        role: "delivery",
      },
      {
        key: "orders",
        label: "주문",
        href: "/delivery/orders",
        icon: ShoppingBag,
        matchPrefix: "/delivery/orders",
        role: "delivery",
      },
      {
        key: "reviews",
        label: "리뷰",
        href: "/delivery/reviews",
        icon: Star,
        matchPrefix: "/delivery/reviews",
        role: "delivery",
      },
    ],
  },
  {
    title: "배송",
    items: [
      {
        key: "policy",
        label: "배송 정책",
        href: "/delivery/policy",
        icon: Truck,
        matchPrefix: "/delivery/policy",
        role: "delivery",
      },
    ],
  },
];

// 게시판 관리 — 별도 설치형 공간. site admin + 게시판 moderator 진입.
// 공지·게시판/신고를 처리한다. 회원·등급(권한 부여·제재)은 메인 관리자(/admin/users)로 이동했다.
export const BOARD_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/board", icon: LayoutDashboard, role: "community" },
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
        role: "community",
      },
      {
        key: "notices",
        label: "공지",
        href: "/board/notices",
        icon: Megaphone,
        matchPrefix: "/board/notices",
        role: "community",
      },
    ],
  },
];

// 카탈로그 — 홈은 정확히 /catalog 일 때만 활성, 나머지는 하위 경로까지.
// 검수는 /catalog/cards 안의 탭이라 별도 항목을 두지 않는다.
export const CATALOG_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/catalog", icon: LayoutDashboard, role: "catalog" },
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
        role: "catalog",
      },
      {
        key: "series",
        label: "시리즈",
        href: "/catalog/series",
        icon: Layers,
        matchPrefix: "/catalog/series",
        role: "catalog",
      },
      {
        key: "kinds",
        label: "종류",
        href: "/catalog/kinds",
        icon: Tag,
        matchPrefix: "/catalog/kinds",
        role: "catalog",
      },
      {
        key: "teams",
        label: "그룹",
        href: "/catalog/teams",
        icon: Users,
        matchPrefix: "/catalog/teams",
        role: "catalog",
      },
      {
        key: "members",
        label: "멤버",
        href: "/catalog/members",
        icon: User,
        matchPrefix: "/catalog/members",
        role: "catalog",
      },
    ],
  },
];
