import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { failUsedTradePayment } from "@/modules/used/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 실패 리다이렉트 — 결제가 실패하면 여기로 돌아온다. 취소와 동일하게
// 대기 거래를 취소하고 매물을 판매중으로 되돌린다.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tradeId = Number(request.nextUrl.searchParams.get("trade"));
  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    return NextResponse.redirect(publicUrl(request, "/used"));
  }
  const { listingId } = await failUsedTradePayment(tradeId);
  const base = listingId ? `/used/${listingId}` : "/used";
  return NextResponse.redirect(publicUrl(request, `${base}?payfail=1`));
}
