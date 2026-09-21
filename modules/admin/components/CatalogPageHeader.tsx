import type { ReactNode } from "react";

// 카탈로그 페이지 공통 헤더 — 제목 + 수치 배지 + 설명 한 줄, 오른쪽에 액션.
// 서버 컴포넌트에서 그대로 쓰고, 액션은 children 으로 넘긴다.
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
  /** 제목 위 작은 라벨(예: 그룹명) */
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="flex items-baseline gap-2 text-xl font-bold tracking-tight text-foreground">
          {title}
          {count !== undefined && (
            <span className="catalog-stat rounded-md bg-secondary px-1.5 py-0.5 text-sm font-semibold text-secondary-foreground">
              {count.toLocaleString()}
            </span>
          )}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
