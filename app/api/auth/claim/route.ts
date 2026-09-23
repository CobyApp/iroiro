import { type NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/modules/auth/lib/cookies";
import { claimLoginPairing, isValidPairingCode } from "@/modules/auth/lib/pairing";
import { createSession } from "@/modules/auth/lib/session";

// Prisma 사용 → Node 런타임 필수.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PWA 로그인 페어링 회수 — 앱(홈 화면)이 자신이 만든 code 로 폴링한다.
// Safari 에서 로그인이 끝나 code↔account 가 남았으면, 이 요청(앱 컨텍스트)에서 세션을 발급하고
// 세션 쿠키를 앱 컨텍스트에 심는다. 1회용이라 성공 후 code 는 소멸한다.
// GET /api/auth/claim?code=... → { ok: boolean }
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const noStore = { "Cache-Control": "no-store" };
  if (!isValidPairingCode(code)) {
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }
  const accountId = await claimLoginPairing(code);
  if (!accountId) {
    // 아직 로그인 전이거나 만료/이미 사용됨 — 앱은 계속 폴링(대기)한다.
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
  const { token, expiresAt } = await createSession(accountId);
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
  return response;
}
