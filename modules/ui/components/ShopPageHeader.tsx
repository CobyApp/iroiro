import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** 고객 화면의 최상위 제목·설명·보조 동작을 같은 리듬으로 정렬한다. */
export function ShopPageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <header className={cn("shop-page-header", className)} data-page-section>
      <div className="min-w-0">
        {eyebrow && <p className="shop-page-eyebrow">{eyebrow}</p>}
        <h1 className="shop-page-title">{title}</h1>
        {description && <p className="shop-page-description">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
