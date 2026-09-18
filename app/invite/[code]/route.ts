import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
} from "@/modules/referral/lib/apply";

// 초대 링크 진입점 — 코드 검증 후 리퍼럴 쿠키를 심고 소개 페이지로.
// (가입 완료 시 completeSignupAction이 쿠키를 읽어 보상을 귀속한다.)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const trimmed = code.trim().slice(0, 32);

  const welcome = new URL("/welcome", request.url);
  const response = NextResponse.redirect(welcome);

  // 무효 코드는 쿠키 없이 소개 페이지로만 — 열거 힌트를 주지 않는다.
  const inviter = trimmed
    ? await db.account.findFirst({
        where: { publicCode: trimmed, deletedAt: null },
        select: { id: true },
      })
    : null;
  if (inviter) {
    response.cookies.set(REFERRAL_COOKIE, trimmed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}
