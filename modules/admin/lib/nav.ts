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
  Scale,
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

// 관리자(/admin)·카탈로그(/admin/catalog) 공용 셸의 메뉴 정의 — 데이터로 두고 사이드바가 렌더한다.
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
// 스토어 상품·주문·정산·배송은 스토어·배송 공간(/admin/store)으로 분리됐다(바로가기로 진입).
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
        href: "/admin/store",
        icon: Truck,
        role: "siteAdmin",
      },
      {
        key: "to-market",
        label: "중고거래 관리 →",
        href: "/admin/used",
        icon: Store,
        role: "siteAdmin",
      },
      {
        key: "to-board",
        label: "커뮤니티 관리 →",
        href: "/admin/posts",
        icon: MessageSquare,
        role: "siteAdmin",
      },
      {
        key: "to-catalog",
        label: "토레카 카탈로그 →",
        href: "/admin/catalog",
        icon: ArrowRight,
        role: "siteAdmin",
      },
    ],
  },
];

// 중고거래 관리 — 별도 설치형 공간(/admin/used). site admin + used 부분 권한.
// 신고 처리(매물 차단·해제·기각)와 매물 모니터링을 한곳에서. 회원 제재는 메인 관리자에서.
export const MARKET_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/admin/used", icon: LayoutDashboard, role: "used" },
    ],
  },
  {
    title: "중고거래",
    items: [
      {
        key: "reports",
        label: "매물 신고",
        href: "/admin/used/reports",
        icon: Flag,
        matchPrefix: "/admin/used/reports",
        role: "used",
      },
      {
        key: "review-reports",
        label: "후기 신고",
        href: "/admin/used/review-reports",
        icon: Star,
        matchPrefix: "/admin/used/review-reports",
        role: "used",
      },
      {
        key: "disputes",
        label: "거래 분쟁",
        href: "/admin/used/disputes",
        icon: Scale,
        matchPrefix: "/admin/used/disputes",
        role: "used",
      },
      {
        key: "listings",
        label: "매물",
        href: "/admin/used/listings",
        icon: Store,
        matchPrefix: "/admin/used/listings",
        role: "used",
      },
      {
        key: "blocked",
        label: "차단 매물",
        href: "/admin/used/blocked",
        icon: Ban,
        matchPrefix: "/admin/used/blocked",
        role: "used",
      },
      {
        key: "fee",
        label: "판매 수수료",
        href: "/admin/used/settings",
        icon: Coins,
        matchPrefix: "/admin/used/settings",
        role: "used",
      },
    ],
  },
];

// 스토어·배송 관리 — 스토어 상품·주문·정산 + 배송 정책. site admin + delivery 부분 권한.
export const DELIVERY_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/admin/store", icon: LayoutDashboard, role: "delivery" },
    ],
  },
  {
    title: "판매",
    items: [
      {
        key: "products",
        label: "상품",
        href: "/admin/store/products",
        icon: Package,
        matchPrefix: "/admin/store/products",
        role: "delivery",
      },
      {
        key: "orders",
        label: "주문",
        href: "/admin/store/orders",
        icon: ShoppingBag,
        matchPrefix: "/admin/store/orders",
        role: "delivery",
      },
      {
        key: "reviews",
        label: "리뷰",
        href: "/admin/store/reviews",
        icon: Star,
        matchPrefix: "/admin/store/reviews",
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
        href: "/admin/store/policy",
        icon: Truck,
        matchPrefix: "/admin/store/policy",
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
      { key: "home", label: "홈", href: "/admin/posts", icon: LayoutDashboard, role: "community" },
    ],
  },
  {
    title: "게시판",
    items: [
      {
        key: "posts",
        label: "게시판 · 신고",
        href: "/admin/posts/posts",
        icon: MessageSquare,
        matchPrefix: "/admin/posts/posts",
        role: "community",
      },
      {
        key: "notices",
        label: "공지",
        href: "/admin/posts/notices",
        icon: Megaphone,
        matchPrefix: "/admin/posts/notices",
        role: "community",
      },
    ],
  },
];

// 카탈로그 — 홈은 정확히 /admin/catalog 일 때만 활성, 나머지는 하위 경로까지.
// 검수는 /admin/catalog/cards 안의 탭이라 별도 항목을 두지 않는다.
export const CATALOG_SECTIONS: NavSection[] = [
  {
    items: [
      { key: "home", label: "홈", href: "/admin/catalog", icon: LayoutDashboard, role: "catalog" },
    ],
  },
  {
    title: "마스터 데이터",
    items: [
      {
        key: "cards",
        label: "토레카",
        href: "/admin/catalog/cards",
        icon: WalletCards,
        matchPrefix: "/admin/catalog/cards",
        role: "catalog",
      },
      {
        key: "series",
        label: "시리즈",
        href: "/admin/catalog/series",
        icon: Layers,
        matchPrefix: "/admin/catalog/series",
        role: "catalog",
      },
      {
        key: "kinds",
        label: "종류",
        href: "/admin/catalog/kinds",
        icon: Tag,
        matchPrefix: "/admin/catalog/kinds",
        role: "catalog",
      },
      {
        key: "teams",
        label: "그룹",
        href: "/admin/catalog/teams",
        icon: Users,
        matchPrefix: "/admin/catalog/teams",
        role: "catalog",
      },
      {
        key: "members",
        label: "멤버",
        href: "/admin/catalog/members",
        icon: User,
        matchPrefix: "/admin/catalog/members",
        role: "catalog",
      },
    ],
  },
];
