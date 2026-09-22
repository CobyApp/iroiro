import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { approveUsedTradePayment } from "@/modules/used/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 승인 리다이렉트 — 사용자가 결제창에서 승인하면 pg_token 과 함께 여기로 돌아온다.
// pending 거래를 approve() 후 paid 로 전이하고, 매물 상세로 되돌려보낸다.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tradeId = Number(request.nextUrl.searchParams.get("trade"));
  const pgToken = request.nextUrl.searchParams.get("pg_token");
  const account = await getCurrentAccount();

  if (!account || !Number.isInteger(tradeId) || tradeId <= 0 || !pgToken) {
    return NextResponse.redirect(publicUrl(request, "/used?payfail=1"));
  }

  const result = await approveUsedTradePayment(tradeId, pgToken, account.id);
  const base = result.listingId ? `/used/${result.listingId}` : "/mypage/used";
  return NextResponse.redirect(
    publicUrl(request, result.ok ? `${base}?paid=1` : `${base}?payfail=1`),
  );
}
