import { NextResponse } from "next/server";
import { autoConfirmDueUsedTrades } from "@/modules/used/lib/settle-trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 중고 안전거래 자동 수령확정 스윕 — 외부 스케줄러(EventBridge 등)가 주기 호출.
// lazy 스윕(마이페이지 진입 시)의 보조 장치라, 크론이 없어도 기능은 동작한다(확정이
// 다음 진입까지 늦어질 뿐). CRON_SECRET 이 설정돼 있으면 Bearer 토큰 일치 필수.
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const confirmed = await autoConfirmDueUsedTrades();
  return NextResponse.json({ ok: true, confirmed });
}
