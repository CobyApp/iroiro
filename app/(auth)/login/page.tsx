import { PageBack } from "@/components/PageBack";
import { BrandMark, BrandWordmark } from "@/modules/ui/components/BrandMark";

// 로그인 화면 — 카카오·네이버 소셜 로그인. 자체 인증(DB 세션).
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
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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

      <div className="rounded-md border border-border bg-card p-8 shadow-card">
      <div className="mb-8 text-center">
        <BrandMark className="mx-auto h-16 w-16" preload />
        <BrandWordmark className="mx-auto mb-5 mt-2 h-8 w-auto" preload />
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
          href="/api/auth/kakao"
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#e3ce00] bg-[#FEE500] text-sm font-medium text-[#191600] transition-[transform,background-color] hover:bg-[#f8e200] active:scale-[.98]"
        >
          <KakaoMark />
          카카오로 시작하기
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth 시작 라우트(Route Handler)로의 전체 이동. 외부 제공자로 302라 Link 부적합. */}
        <a
          href="/api/auth/naver"
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#03aa4d] bg-[#03C75A] text-sm font-medium text-white transition-[transform,background-color] hover:bg-[#02b551] active:scale-[.98]"
        >
          <NaverMark />
          네이버로 시작하기
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

function NaverMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#fff"
        d="M16.3 12.6 7.4 0H0v24h7.7V11.4L16.6 24H24V0h-7.7v12.6Z"
      />
    </svg>
  );
}
