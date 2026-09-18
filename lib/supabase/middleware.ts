import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 모든 요청에서 Supabase 세션(쿠키) refresh 처리.
// 토큰 만료 직전에 자동 갱신 → 사용자가 로그인 상태 유지.
// middleware.ts에서 호출.
export async function updateSession(request: NextRequest) {
  // 현재 경로를 요청 헤더로 전달 — 서버 레이아웃이 pathname을 읽어 조건부 렌더
  // (예: /admin/login은 관리자 크롬 없이 렌더)에 사용한다.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() 호출이 토큰 만료를 검사하고 필요 시 자동 refresh.
  // getSession()은 캐시된 값 반환 → middleware에선 getUser()가 안전.
  await supabase.auth.getUser();

  return supabaseResponse;
}
