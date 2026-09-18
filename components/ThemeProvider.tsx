"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// 라이트모드 고정 — 단일 파스텔 브랜드 시스템을 항상 같은 인상으로 제공한다.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      forcedTheme="light"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
