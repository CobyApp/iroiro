import { NextResponse, type NextRequest } from "next/server";

// 현재 경로를 요청 헤더로 전달 — 서버 레이아웃이 pathname을 읽어 조건부 렌더
// (예: /admin/login은 관리자 크롬 없이 렌더)에 사용한다.
// admin 접근 통제는 app/(admin)/layout.tsx의 계정 가드가 단독으로 담당한다(룰 3).
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // 정적 자원·이미지·favicon 제외 — 세션 갱신 불필요한 경로
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
