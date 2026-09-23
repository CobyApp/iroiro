import Link from "next/link";
import { LogIn, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/modules/ui/components/BrandMark";

const CONTACT_EMAIL = "coby5502@iroiro.club";

// 관리 페이지 접근 안내 — 튕겨내지 않고 상황을 알려준다.
//  · login    : 로그인 필요(게스트)
//  · forbidden: 로그인했지만 권한 없음 → 관리자에게 권한 요청 안내
export function AdminAccessNotice({
  mode,
  returnTo = "/admin",
  spaceLabel,
}: {
  mode: "login" | "forbidden";
  returnTo?: string;
  spaceLabel?: string;
}) {
  const isLogin = mode === "login";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15">
        {isLogin ? (
          <LogIn className="h-8 w-8 text-primary" aria-hidden />
        ) : (
          <ShieldAlert className="h-8 w-8 text-primary" aria-hidden />
        )}
      </div>

      <h1 className="mt-6 font-display text-2xl text-foreground">
        {isLogin ? "관리 페이지예요" : "접근 권한이 없어요"}
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {isLogin ? (
          <>이 페이지는 관리자만 이용할 수 있어요.
            <br />먼저 로그인해 주세요.</>
        ) : (
          <>
            {spaceLabel ? `${spaceLabel} 관리 권한이 없어요.` : "관리자 권한이 없어요."}
            <br />
            관리자에게 권한을 요청해 주세요.
          </>
        )}
      </p>

      <div className="mt-7 w-full space-y-2">
        {isLogin ? (
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              로그인하기
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg" variant="outline" className="w-full">
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("관리자 권한 요청")}`}>
              권한 요청 문의
            </a>
          </Button>
        )}
        <Button asChild variant="ghost" size="lg" className="w-full">
          <Link href="/">홈으로 돌아가기</Link>
        </Button>
      </div>

      {!isLogin && (
        <p className="mt-6 text-xs text-muted-foreground">
          문의: {CONTACT_EMAIL}
        </p>
      )}

      <div className="mt-10 opacity-60">
        <BrandMark className="h-7 w-7" />
      </div>
    </main>
  );
}
