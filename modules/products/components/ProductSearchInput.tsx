"use client";

import { useSyncExternalStore, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PRODUCT_PAGE_SIZE, buildProductQuery } from "../lib/filters";

const RECENT_KEY = "iroiro:recent-searches";
const RECENT_MAX = 8;
const EMPTY: string[] = [];

// localStorage 기반 외부 스토어 — effect 내 setState 없이(lint 규칙)
// SSR(빈 배열)과 클라이언트 스냅샷을 useSyncExternalStore로 동기화한다.
const listeners = new Set<() => void>();
let cacheRaw: string | null | undefined;
let cache: string[] = EMPTY;

function readRecent(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RECENT_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string").slice(0, RECENT_MAX)
      : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function writeRecent(terms: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(terms.slice(0, RECENT_MAX)));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 조용히 무시 — 검색 자체엔 영향 없음.
  }
  listeners.forEach((notify) => notify());
}

function subscribeRecent(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

export function ProductSearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const recent = useSyncExternalStore(subscribeRecent, readRecent, () => EMPTY);

  function search(term: string) {
    const trimmed = term.trim();
    if (trimmed) {
      writeRecent([trimmed, ...recent.filter((t) => t !== trimmed)]);
    }
    const query = buildProductQuery({
      q: trimmed || undefined,
      sort: "newest",
      page: 1,
      pageSize: PRODUCT_PAGE_SIZE,
      stock: undefined,
    });
    startTransition(() => router.push(`/products${query}`));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    search(value);
  }

  function removeRecent(term: string) {
    writeRecent(recent.filter((t) => t !== term));
  }

  function clearRecent() {
    writeRecent([]);
  }

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} role="search" className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="상품명·그룹·멤버 검색"
          className="pl-9"
          disabled={pending}
          aria-label="상품 검색"
        />
      </form>
      {recent.length > 0 && (
        <div
          className="scroll-x scroll-x-bleed flex items-center gap-1.5 overflow-x-auto pb-1"
          aria-label="최근 검색어"
        >
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            최근 검색
          </span>
          {recent.map((term) => (
            <span
              key={term}
              className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs text-foreground"
            >
              <button
                type="button"
                onClick={() => {
                  setValue(term);
                  search(term);
                }}
                disabled={pending}
                className="disabled:opacity-50"
              >
                {term}
              </button>
              <button
                type="button"
                onClick={() => removeRecent(term)}
                disabled={pending}
                aria-label={`${term} 삭제`}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearRecent}
            disabled={pending}
            className="shrink-0 px-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            전체 삭제
          </button>
        </div>
      )}
    </div>
  );
}
