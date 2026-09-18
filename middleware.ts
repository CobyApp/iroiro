import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// admin 접근 통제는 app/(admin)/layout.tsx의 계정 가드가 단독으로 담당한다(룰 3).
// pre-launch 동안 두었던 공용 자격증명 외곽 게이트(Basic Auth → 폼 로그인)는
// 실 계정 인가(account.is_admin) 도입으로 역할이 사라져 제거했다.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 정적 자원·이미지·favicon 제외 — 세션 갱신 불필요한 경로
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
