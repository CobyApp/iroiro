"use client";

import { useRef, useState } from "react";

// 카카오 로그인 버튼.
//  · 일반 브라우저: 평소처럼 /api/auth/kakao 로 전체 이동(링크 그대로).
//  · iOS 홈 화면 앱(standalone): 외부 OAuth 가 Safari 로 튕겨 세션 쿠키가 앱에 안 심기는 문제 →
//    앱이 code 를 만들어 Safari 로 로그인시키고, /api/auth/claim 을 폴링해 앱 컨텍스트에서 세션을 받는다.

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari 홈앱: navigator.standalone. 그 외: display-mode standalone.
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const displayStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return iosStandalone || displayStandalone;
}

function generatePairCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3분

export function KakaoLoginButton({
  href,
  returnTo,
  className,
  children,
}: {
  href: string; // 일반 브라우저용 시작 URL (예: /api/auth/kakao?returnTo=...)
  returnTo: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const [waiting, setWaiting] = useState(false);
  const stopRef = useRef(false);

  async function pollClaim(code: string) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    stopRef.current = false;
    while (!stopRef.current && Date.now() < deadline) {
      try {
        const res = await fetch(`/api/auth/claim?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean };
          if (data.ok) {
            window.location.href = returnTo && returnTo.startsWith("/") ? returnTo : "/";
            return;
          }
        }
      } catch {
        // 네트워크 흔들림 — 계속 폴링.
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setWaiting(false);
  }

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isStandalone()) return; // 일반 브라우저 — 링크 기본 동작(전체 이동).
    e.preventDefault();
    const code = generatePairCode();
    const url = new URL(href, window.location.origin);
    url.searchParams.set("pair", code);
    // Safari(외부 브라우저)로 로그인 창을 연다. 앱은 남아서 폴링한다.
    window.open(url.toString(), "_blank", "noopener");
    setWaiting(true);
    void pollClaim(code);
    // 앱으로 돌아왔을 때 즉시 한 번 더 확인.
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollClaim(code);
    };
    document.addEventListener("visibilitychange", onVisible, { once: true });
  }

  if (waiting) {
    return (
      <div className={className} aria-live="polite">
        <span className="text-sm">브라우저에서 로그인 후 앱으로 돌아오면 자동으로 연결돼요…</span>
      </div>
    );
  }

  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
