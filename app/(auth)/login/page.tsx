import { PageBack } from "@/components/PageBack";
import { BrandMark, BrandWordmark } from "@/modules/ui/components/BrandMark";

// 로그인 화면 — 카카오 소셜 로그인. 자체 인증(DB 세션).
// 버튼은 <a>로 OAuth 시작 라우트(GET /api/auth/{provider})에 직접 이동 → 제공자로 302.
const ERROR_MESSAGES: Record<string, string> = {
  denied: "로그인이 취소되었습니다.",
  invalid_request: "잘못된 요청입니다. 다시 시도해 주세요.",
  state_mismatch: "보안 검증에 실패했습니다. 다시 시도해 주세요.",
  provider_unavailable: "현재 이 로그인 수단을 사용할 수 없습니다.",
  oauth_failed:
    "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;
  // 오픈 리다이렉트 방지 — 같은 사이트 절대경로만.
  const safeReturn =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : null;
  const q = safeReturn ? `?returnTo=${encodeURIComponent(safeReturn)}` : "";
  const message = error
    ? (ERROR_MESSAGES[error] ?? "로그인에 실패했습니다.")
    : null;

  return (
    <div className="space-y-3">
      {/* 뒤로가기 — 로그인 없이도 쇼핑으로 돌아갈 수 있게. */}
      <div className="flex items-center gap-2">
        <PageBack fallbackHref="/" />
        <span className="text-sm text-muted-foreground">둘러보기로 돌아가기</span>
      </div>

      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="mb-7 text-center">
        <BrandMark className="mx-auto h-14 w-14 sm:h-16 sm:w-16" preload />
        <BrandWordmark className="mx-auto mb-4 mt-2 h-7 w-auto sm:h-8" preload />
        <h1 className="font-display text-2xl text-foreground">로그인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          간편하게 시작하고 굿즈를 둘러보세요
        </p>
      </div>

      {message && (
        <p
          role="alert"
          className="mb-4 rounded-xs border border-border bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-card"
        >
          {message}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth 시작 라우트(Route Handler)로의 전체 이동. 외부 제공자로 302라 Link 부적합. */}
        <a
          href={`/api/auth/kakao${q}`}
          className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#e3ce00] bg-[#FEE500] text-[15px] font-semibold text-[#191600] transition-[transform,background-color] hover:bg-[#f8e200] active:scale-[.98]"
        >
          <KakaoMark />
          카카오로 시작하기
        </a>
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        로그인 시 이용약관 및 개인정보처리방침에 동의하게 됩니다.
      </p>
      </div>
    </div>
  );
}

function KakaoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#191600"
        d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.7 6.6-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.5 10-7.8S17.5 3 12 3Z"
      />
    </svg>
  );
}
