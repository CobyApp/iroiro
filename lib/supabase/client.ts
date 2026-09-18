import { createBrowserClient } from "@supabase/ssr";

// 클라이언트 컴포넌트(브라우저)에서 사용. publishable 키만 노출 — RLS로 보호됨.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
