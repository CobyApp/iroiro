"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

// 찜 전용 검색 — 찜한 스토어 상품·중고 매물을 이름/그룹/멤버로 걸러본다(스토어로 이동하지 않음).
// 입력을 URL ?q= 로 반영(디바운스)하고 서버가 찜 목록 안에서 필터링한다.
export function WishlistSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `/wishlist?q=${encodeURIComponent(q)}` : "/wishlist");
    }, 250);
    return () => clearTimeout(t);
  }, [value, router]);

  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="찜한 상품·그룹·멤버 검색"
        aria-label="찜 검색"
        className="h-10 w-full rounded-full border border-border bg-card/80 pl-9 pr-9 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary sm:text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="지우기"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
