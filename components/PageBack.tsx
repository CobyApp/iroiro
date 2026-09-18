"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// 하위 페이지 공용 뒤로가기 — 히스토리가 있으면 back, 없으면(직접 진입) fallback으로.
export function PageBack({ fallbackHref = "/" }: { fallbackHref?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
