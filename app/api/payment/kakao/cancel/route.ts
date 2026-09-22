import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { failUsedTradePayment } from "@/modules/used/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 취소 리다이렉트 — 사용자가 결제창에서 결제를 취소하면 여기로 돌아온다.
// 결제 대기 거래를 취소하고 매물을 다시 판매중으로 되돌린 뒤 상세로 보낸다.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tradeId = Number(request.nextUrl.searchParams.get("trade"));
  const account = await getCurrentAccount();
  if (!account || !Number.isInteger(tradeId) || tradeId <= 0) {
    return NextResponse.redirect(publicUrl(request, "/used"));
  }
  const { listingId } = await failUsedTradePayment(tradeId, account.id);
  const base = listingId ? `/used/${listingId}` : "/used";
  return NextResponse.redirect(publicUrl(request, `${base}?paycancel=1`));
}
