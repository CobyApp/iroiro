import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { failUsedTradePayment } from "@/modules/used/lib/checkout";
import { failUsedBundlePayment } from "@/modules/used/lib/bundle-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 실패 리다이렉트 — 결제가 실패하면 여기로 돌아온다. 취소와 동일하게
// 대기 거래(?trade=)·묶음(?bundle=)을 취소하고 매물을 판매중으로 되돌린다.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const account = await getCurrentAccount();
  const bundleId = Number(sp.get("bundle"));
  const tradeId = Number(sp.get("trade"));
  if (!account) {
    return NextResponse.redirect(publicUrl(request, "/used"));
  }
  if (Number.isInteger(bundleId) && bundleId > 0) {
    await failUsedBundlePayment(bundleId, account.id);
    return NextResponse.redirect(
      publicUrl(request, `/used/bundle/${bundleId}?payfail=1`),
    );
  }
  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    return NextResponse.redirect(publicUrl(request, "/used"));
  }
  const { listingId } = await failUsedTradePayment(tradeId, account.id);
  const base = listingId ? `/used/${listingId}` : "/used";
  return NextResponse.redirect(publicUrl(request, `${base}?payfail=1`));
}
