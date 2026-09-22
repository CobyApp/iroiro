import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared page header for the admin and catalog shells — same rhythm as the customer
// ShopPageHeader (eyebrow · display title · description) plus an optional count badge and
// an actions slot. Uses the `.shop-page-header` CSS class so it stacks vertically on
// phones (globals.css @media (max-width: 639px)). Server component friendly.
export function AdminPageHeader({
  title,
  count,
  description,
  eyebrow,
  children,
  className,
}: {
  title: string;
  /** Total badge next to the title — optional. */
  count?: number;
  description?: ReactNode;
  /** Small label above the title (e.g. TRADING CARD ARCHIVE). */
  eyebrow?: string;
  /** Right-hand actions (buttons, links). Wrap and go full-width on phones. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("shop-page-header", className)} data-page-section>
      <div className="min-w-0">
        {eyebrow && <p className="shop-page-eyebrow">{eyebrow}</p>}
        <h1 className="shop-page-title flex flex-wrap items-baseline gap-2.5">
          <span className="min-w-0 break-keep">{title}</span>
          {count !== undefined && (
            <span className="catalog-stat rounded-full bg-primary/10 px-2.5 py-0.5 font-sans text-sm font-semibold text-primary">
              {count.toLocaleString()}
            </span>
          )}
        </h1>
        {description && <p className="shop-page-description">{description}</p>}
      </div>
      {children && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          {children}
        </div>
      )}
    </header>
  );
}
