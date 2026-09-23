import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { approveUsedTradePayment } from "@/modules/used/lib/checkout";
import { approveUsedBundlePayment } from "@/modules/used/lib/bundle-checkout";
import { approveOrderPayment } from "@/modules/orders/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 승인 리다이렉트 — 사용자가 결제창에서 승인하면 pg_token 과 함께 여기로 돌아온다.
// pending 거래(?trade=) 또는 묶음(?bundle=)을 approve() 후 paid 로 전이하고 상세로 되돌려보낸다.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const pgToken = sp.get("pg_token");
  const account = await getCurrentAccount();
  const bundleId = Number(sp.get("bundle"));
  const tradeId = Number(sp.get("trade"));
  const orderNo = sp.get("order");

  if (!account || !pgToken) {
    return NextResponse.redirect(publicUrl(request, "/used?payfail=1"));
  }

  // 스토어 주문 결제 승인.
  if (orderNo) {
    const result = await approveOrderPayment(orderNo, pgToken, account.id);
    return NextResponse.redirect(
      publicUrl(
        request,
        result.ok
          ? `/orders/${orderNo}/complete`
          : `/checkout?payfail=1`,
      ),
    );
  }

  // 묶음 결제 승인.
  if (Number.isInteger(bundleId) && bundleId > 0) {
    const result = await approveUsedBundlePayment(bundleId, pgToken, account.id);
    const base = result.bundleId ? `/used/bundle/${result.bundleId}` : "/mypage/used";
    return NextResponse.redirect(
      publicUrl(request, result.ok ? `${base}?paid=1` : `${base}?payfail=1`),
    );
  }

  // 단건 거래 승인.
  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    return NextResponse.redirect(publicUrl(request, "/used?payfail=1"));
  }
  const result = await approveUsedTradePayment(tradeId, pgToken, account.id);
  const base = result.listingId ? `/used/${result.listingId}` : "/mypage/used";
  return NextResponse.redirect(
    publicUrl(request, result.ok ? `${base}?paid=1` : `${base}?payfail=1`),
  );
}
