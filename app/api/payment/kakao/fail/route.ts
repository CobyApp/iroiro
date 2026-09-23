import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { failUsedTradePayment } from "@/modules/used/lib/checkout";
import { failUsedBundlePayment } from "@/modules/used/lib/bundle-checkout";
import { failOrderPayment } from "@/modules/orders/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 실패 리다이렉트 — 결제가 실패하면 여기로 돌아온다. 취소와 동일하게
// 대기 거래(?trade=)·묶음(?bundle=)을 취소하고 매물을 판매중으로 되돌린다.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const account = await getCurrentAccount();
  const bundleId = Number(sp.get("bundle"));
  const tradeId = Number(sp.get("trade"));
  const orderNo = sp.get("order");
  if (!account) {
    return NextResponse.redirect(
      publicUrl(request, "/payment/result?status=fail"),
    );
  }
  if (orderNo) {
    await failOrderPayment(orderNo, account.id);
    return NextResponse.redirect(
      publicUrl(
        request,
        `/payment/result?status=fail&kind=order&order=${encodeURIComponent(orderNo)}`,
      ),
    );
  }
  if (Number.isInteger(bundleId) && bundleId > 0) {
    await failUsedBundlePayment(bundleId, account.id);
    return NextResponse.redirect(
      publicUrl(
        request,
        `/payment/result?status=fail&kind=bundle&id=${bundleId}`,
      ),
    );
  }
  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    return NextResponse.redirect(
      publicUrl(request, "/payment/result?status=fail"),
    );
  }
  const { listingId } = await failUsedTradePayment(tradeId, account.id);
  const detail = listingId ? `&kind=trade&id=${listingId}` : "";
  return NextResponse.redirect(
    publicUrl(request, `/payment/result?status=fail${detail}`),
  );
}
