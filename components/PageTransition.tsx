"use client";

import { usePathname } from "next/navigation";

// 라우트 전환 시 콘텐츠에 fade+상승 등장 애니메이션.
// pathname을 key로 remount하여 이동마다 재생. reduced-motion은 CSS(.page-enter)에서 무효화.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
