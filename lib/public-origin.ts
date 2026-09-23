import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

// Public origin for absolute redirects built inside Route Handlers.
// Behind the ALB the container sees its own internal host (ip-172-31-x.compute.internal:3000),
// so `request.url` must never be used for user-facing redirects. Precedence:
//   1. APP_URL (explicit per-environment config)
//   2. X-Forwarded-Host / X-Forwarded-Proto set by the load balancer
//   3. the request's own origin (local dev without a proxy)
export function publicOrigin(request: NextRequest): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

// `new URL(path, publicOrigin(request))` shorthand for redirects.
export function publicUrl(request: NextRequest, path: string): URL {
  return new URL(path, publicOrigin(request));
}

// 요청 User-Agent 로 모바일 기기 여부를 판정한다(카카오페이 결제 리다이렉트 URL 선택용).
// PC 는 QR(next_redirect_pc_url), 모바일은 카카오톡 앱 연동(next_redirect_mobile_url)을 쓴다.
export async function isMobileFromHeaders(): Promise<boolean> {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  return /Android|iPhone|iPad|iPod|Mobile|KAKAOTALK/i.test(ua);
}

// Server Action 등 NextRequest 가 없는 곳에서 쓰는 공개 origin 해석.
// Route Handler 의 publicOrigin 과 같은 우선순위(APP_URL → X-Forwarded-* → Host).
export async function publicOriginFromHeaders(): Promise<string> {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? h.get("host")?.trim();
  if (host) {
    const proto =
      h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}
