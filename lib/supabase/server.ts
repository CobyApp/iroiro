import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component·Server Action·Route Handler에서 사용.
// 브라우저로부터 받은 쿠키를 사용해 인증된 사용자 컨텍스트를 가짐.
// publishable 키 사용 — RLS가 권한을 결정.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서 cookie set은 throw 발생 — middleware가 처리하므로 무시.
          }
        },
      },
    },
  );
}
