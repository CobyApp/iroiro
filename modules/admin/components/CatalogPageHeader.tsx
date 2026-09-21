import type { ReactNode } from "react";

// 카탈로그 페이지 공통 헤더 — 고객 화면의 ShopPageHeader 와 같은 리듬(eyebrow · display 제목 · 설명)을 쓰고,
// 카탈로그만 제목 옆 총량 배지와 오른쪽 액션 영역을 더한다. 서버 컴포넌트에서 그대로 쓴다.
export function CatalogPageHeader({
  title,
  count,
  description,
  eyebrow,
  children,
}: {
  title: string;
  /** 제목 옆 총량 배지 — 생략 가능 */
  count?: number;
  description?: ReactNode;
  /** 제목 위 작은 라벨(예: TRADING CARD ARCHIVE) */
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4" data-page-section>
      <div className="min-w-0">
        {eyebrow && <p className="shop-page-eyebrow">{eyebrow}</p>}
        <h1 className="shop-page-title flex items-baseline gap-2.5">
          {title}
          {count !== undefined && (
            <span className="catalog-stat rounded-full bg-primary/10 px-2.5 py-0.5 font-sans text-sm font-semibold text-primary">
              {count.toLocaleString()}
            </span>
          )}
        </h1>
        {description && <p className="shop-page-description">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
