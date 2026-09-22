"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

// 상단 헤더 중앙 검색바 — 제출 시 상품 목록으로 이동해 검색어를 넘긴다.
// 상품 목록의 자체 검색(ProductSearchInput)과 별개이며, 어느 화면에서든 상품 검색을 시작한다.
export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/products?q=${encodeURIComponent(term)}` : "/products");
      }}
      className="relative min-w-0 flex-1"
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="상품·그룹·멤버 검색"
        aria-label="상품 검색"
        className="h-10 w-full rounded-full border border-border bg-card/80 pl-9 pr-4 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary sm:text-sm"
      />
    </form>
  );
}
