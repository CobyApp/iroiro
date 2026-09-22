import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// 관리자·카탈로그 페이지 본문 래퍼 — 여백(p-4 sm:p-6)과 세로 리듬(space-y-4)을 한 곳에서 맞춘다.
// narrow는 폼처럼 좁게 읽히는 페이지(max-w-2xl 중앙 정렬). 서버 컴포넌트에서 그대로 쓴다.
export function AdminPage({
  children,
  narrow = false,
  className,
}: {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 p-4 sm:p-6", narrow && "mx-auto max-w-2xl", className)}>
      {children}
    </div>
  );
}
