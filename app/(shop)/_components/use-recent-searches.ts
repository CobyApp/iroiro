"use client";

import { useCallback, useSyncExternalStore } from "react";

// localStorage 기반 최근 검색어 훅 — effect 내 setState 없이(lint 규칙) SSR(빈 배열)과
// 클라이언트 스냅샷을 useSyncExternalStore로 동기화한다. 검색 목적지가 다른 탭(상품·중고)이
// 서로 섞이지 않도록 스토리지 키를 나눠 인스턴스별 캐시를 둔다.

const RECENT_MAX = 8;
const EMPTY: readonly string[] = [];

type Store = {
  listeners: Set<() => void>;
  cacheRaw: string | null | undefined;
  cache: string[];
};

const stores = new Map<string, Store>();

function storeFor(key: string): Store {
  let s = stores.get(key);
  if (!s) {
    s = { listeners: new Set(), cacheRaw: undefined, cache: EMPTY as string[] };
    stores.set(key, s);
  }
  return s;
}

function read(key: string): string[] {
  const s = storeFor(key);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY as string[];
  }
  if (raw === s.cacheRaw) return s.cache;
  s.cacheRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    s.cache = Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string").slice(0, RECENT_MAX)
      : (EMPTY as string[]);
  } catch {
    s.cache = EMPTY as string[];
  }
  return s.cache;
}

function write(key: string, terms: string[]): void {
  const s = storeFor(key);
  try {
    localStorage.setItem(key, JSON.stringify(terms.slice(0, RECENT_MAX)));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 조용히 무시 — 검색 자체엔 영향 없음.
  }
  s.listeners.forEach((notify) => notify());
}

export type RecentSearches = {
  recent: string[];
  push: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
};

export function useRecentSearches(key: string): RecentSearches {
  const subscribe = useCallback(
    (notify: () => void) => {
      const s = storeFor(key);
      s.listeners.add(notify);
      window.addEventListener("storage", notify);
      return () => {
        s.listeners.delete(notify);
        window.removeEventListener("storage", notify);
      };
    },
    [key],
  );

  const recent = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY as string[],
  );

  const push = useCallback(
    (term: string) => {
      const t = term.trim();
      if (!t) return;
      write(key, [t, ...read(key).filter((x) => x !== t)]);
    },
    [key],
  );
  const remove = useCallback(
    (term: string) => write(key, read(key).filter((x) => x !== term)),
    [key],
  );
  const clear = useCallback(() => write(key, []), [key]);

  return { recent, push, remove, clear };
}
