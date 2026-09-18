import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Load balancer health check — intentionally public. No DB access, no PII, constant body.
export function GET(): NextResponse {
  return NextResponse.json({ ok: true });
}
