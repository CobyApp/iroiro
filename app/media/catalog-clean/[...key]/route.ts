import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { catalogCleanImageResponse } from "@/modules/cards/lib/clean-media-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카드 앞면 **원본(clean)** 프록시 — 카탈로그(관리) 화면 전용. 라우트 핸들러는 layout 가드를
// 타지 않으므로 여기서 site admin 을 직접 검증한다(룰 3: isAdmin 단일 진실). 비관리자는 404.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const account = await getCurrentAccount().catch(() => null);
  if (!isAdmin(account)) return new Response(null, { status: 404 });
  const { key } = await params;
  return catalogCleanImageResponse(key.join("/"));
}
