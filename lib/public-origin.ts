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
