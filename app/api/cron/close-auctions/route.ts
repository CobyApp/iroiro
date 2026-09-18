import { NextResponse } from "next/server";
import { settleDueAuctions } from "@/modules/auction/lib/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 경매 마감 스윕 — 외부 스케줄러(EventBridge 등)가 주기 호출. lazy 정산(조회·입찰 시)의
// 보조 장치라, 크론이 없어도 기능은 동작한다(확정·표시가 다음 조회까지 늦어질 뿐).
// 공개 라우트 보호: CRON_SECRET이 설정돼 있으면 Bearer 토큰 일치 필수
// (스케줄러 호출에 Authorization: Bearer ${CRON_SECRET} 헤더를 붙인다).
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const settled = await settleDueAuctions();
  return NextResponse.json({ ok: true, settled });
}
