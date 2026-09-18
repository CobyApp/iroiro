import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        // 모바일에서 버튼이 화면 폭을 넘기면 가로로 삐져나가 문서가 넓어진다
        // (하단 네비바 우측 빈 공간). max-w-full + flex-wrap으로 아래 줄로 넘긴다.
        "flex max-w-full flex-row flex-wrap items-center justify-center gap-1",
        className,
      )}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li {...props} />;
}

function PaginationLink({
  className,
  isActive,
  href,
  children,
  ...props
}: React.ComponentProps<typeof Link> & {
  isActive?: boolean;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "default" : "ghost",
          size: "icon",
        }),
        className,
      )}
      href={href}
      {...props}
    >
      {children}
    </Link>
  );
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      aria-label="이전 페이지"
      className={cn(
        buttonVariants({ variant: "ghost", size: "default" }),
        className,
      )}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>이전</span>
    </Link>
  );
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      aria-label="다음 페이지"
      className={cn(
        buttonVariants({ variant: "ghost", size: "default" }),
        className,
      )}
      {...props}
    >
      <span>다음</span>
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("flex h-10 w-10 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
