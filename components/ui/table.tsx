import * as React from "react";
import { cn } from "@/lib/utils";

type TableProps = React.ComponentProps<"table"> & {
  /**
   * 표 최소 너비 — 기본은 폰(md 미만)에서 40rem을 확보해 열이 글자 단위로
   * 쪼개지지 않고 가로 스크롤되게 한다. 열이 2~3개인 좁은 표는 `min-w-0`으로 끈다.
   */
  minWidthClassName?: string;
};

function Table({
  className,
  minWidthClassName = "min-w-[40rem] md:min-w-0",
  ...props
}: TableProps) {
  return (
    <div className="relative w-full overflow-x-auto rounded-md max-md:scroll-x-fade border border-border bg-card shadow-card">
      <table
        className={cn(
          "w-full caption-bottom text-sm",
          minWidthClassName,
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("bg-muted/60 [&_tr]:border-b-[3px]", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b-2 border-border/50 transition-colors hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-12 whitespace-nowrap px-4 text-left align-middle text-sm font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("p-4 align-middle", className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
export type { TableProps };
