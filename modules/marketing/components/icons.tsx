import type { SVGProps } from "react";

// 소개(랜딩) 전용 커스텀 아이콘 — 이모지·기본 아이콘 대신 브랜드 톤의 라인 아이콘.
// currentColor를 사용하므로 감싸는 요소의 text-* 색을 따른다.

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

// 선물/혜택 — 리본 달린 상자 (매달 무료배송 쿠폰)
export function GiftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="9" width="17" height="11.5" rx="1.6" />
      <path d="M3.5 13.5h17" />
      <path d="M12 9v11.5" />
      <path d="M12 9C10.6 5.8 6 5.8 6.4 8.4 6.7 9.2 9.5 9 12 9z" />
      <path d="M12 9c1.4-3.2 6-3.2 5.6-.6-.3.8-3.1.6-5.6.6z" />
    </Svg>
  );
}

// 왕관 — 영구 VIP 등급
export function CrownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8.5l3.6 3.2L12 5l4.4 6.7L20 8.5v8.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 14.5h16" />
    </Svg>
  );
}

// 스파클 — 신규 그룹 우선 오픈
export function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c.6 3.8 1.7 4.9 5.5 5.5-3.8.6-4.9 1.7-5.5 5.5-.6-3.8-1.7-4.9-5.5-5.5 3.8-.6 4.9-1.7 5.5-5.5z" />
      <path d="M18.5 15c.3 1.6.7 2 2.3 2.3-1.6.3-2 .7-2.3 2.3-.3-1.6-.7-2-2.3-2.3 1.6-.3 2-.7 2.3-2.3z" />
    </Svg>
  );
}

// 종 — 우선 입고 알림
export function BellIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.6 5.5 2.2 6H3.8C4.4 15 6 13.5 6 9.5z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Svg>
  );
}

// 하트 — 거래·팬 혜택
export function HeartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 20.2C8.8 18 4 14.4 4 10.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 8 2.2c0 4.2-4.8 7.8-8 10z" />
    </Svg>
  );
}

// 트럭 — 국내 재고·빠른 배송
export function TruckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 7.5h11v9H3z" />
      <path d="M14 10.5h3.6l3.4 3.4v2.6H14z" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17.5" cy="17.5" r="1.7" />
    </Svg>
  );
}

// 방패+체크 — 정품·직접 촬영
export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l7 2.6v5.1c0 4.8-3.4 7.8-7 9.8-3.6-2-7-5-7-9.8V5.6z" />
      <path d="M9 12l2 2 4-4.2" />
    </Svg>
  );
}

// 카드+하트 — 나만의 디지털 도감(컬렉션)
export function AlbumIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2.2" />
      <path d="M12 15.2s-3-1.9-3-3.9A1.7 1.7 0 0 1 12 9.9a1.7 1.7 0 0 1 3 1.4c0 2-3 3.9-3 3.9z" />
    </Svg>
  );
}
