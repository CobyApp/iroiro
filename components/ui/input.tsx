import * as React from "react";
import { cn } from "@/lib/utils";

// 공용 입력창 — 읽기 쉬운 단일 테두리와 명확한 포커스 링.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-xs border border-input bg-card px-4 py-2 text-base outline-none sm:text-sm transition-[box-shadow,border-color] file:border-0 file:bg-transparent file:text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
