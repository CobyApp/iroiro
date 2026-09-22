import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 목록이 빈 화면을 스토어·중고·찜·장바구니 등에서 동일하게 보여주기 위한 공용 컴포넌트.
// 이모지 또는 아이콘 중 하나로 헤드라인을 세우고, 안내 문구와 선택적 CTA 를 둔다.
// (프레젠테이션 컴포넌트 — 카드 프레임/여백/타이포는 여기 한 곳에서만 관리한다.)

export type EmptyStateAction = {
  href: string;
  label: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
};

export function EmptyState({
  emoji,
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  /** 헤드라인 위 큰 이모지(아이콘과 택일). */
  emoji?: string;
  /** 헤드라인 위 원형 배경 아이콘(이모지와 택일). */
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-12 text-center shadow-card",
        className,
      )}
    >
      {emoji ? (
        <p className="mb-2 text-4xl">{emoji}</p>
      ) : Icon ? (
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      ) : null}
      <p className="font-display text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button asChild className="mt-5" variant={action.variant}>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
