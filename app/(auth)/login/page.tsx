import { BrandMark } from "@/modules/ui/components/BrandMark";
import { KakaoLoginButton } from "@/modules/auth/components/KakaoLoginButton";

// 로그인 화면 — 카카오 소셜 로그인. 자체 인증(DB 세션). shop 레이아웃 안에 있어 상단 헤더·하단 탭을 공유한다.
// 버튼은 <a>로 OAuth 시작 라우트(GET /api/auth/kakao)에 직접 이동 → 제공자로 302.
const ERROR_MESSAGES: Record<string, string> = {
  denied: "로그인이 취소되었습니다.",
  invalid_request: "잘못된 요청입니다. 다시 시도해 주세요.",
  state_mismatch: "보안 검증에 실패했습니다. 다시 시도해 주세요.",
  provider_unavailable: "현재 이 로그인 수단을 사용할 수 없습니다.",
  oauth_failed:
    "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

const BENEFITS = [
  { icon: "🛍️", label: "구매한 굿즈를 컬렉션으로" },
  { icon: "❤️", label: "찜한 상품 기기 상관없이 저장" },
  { icon: "🔔", label: "주문·경매 알림 받기" },
];

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
    <div className="mx-auto flex w-full max-w-sm flex-col items-center pt-6 sm:pt-12">
      {/* 히어로 — 하트 마크 + 환영 카피 */}
      <div className="text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15">
          <BrandMark className="h-12 w-12" preload />
        </div>
        <h1 className="mt-5 font-display text-[26px] leading-tight text-foreground">
          이로이로에 오신 걸 환영해요
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          카카오로 3초 만에 시작하고
          <br className="sm:hidden" /> 좋아하는 굿즈를 만나보세요
        </p>
      </div>

      {/* 혜택 미리보기 */}
      <ul className="mt-7 w-full space-y-2">
        {BENEFITS.map((b) => (
          <li
            key={b.label}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3"
          >
            <span aria-hidden="true" className="text-lg">
              {b.icon}
            </span>
            <span className="text-sm font-medium text-foreground">{b.label}</span>
          </li>
        ))}
      </ul>

      {message && (
        <p
          role="alert"
          className="mt-6 w-full rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
        >
          {message}
        </p>
      )}

      {/* 카카오 로그인 — 일반 브라우저는 전체 이동, iOS 홈앱은 페어링 플로우(KakaoLoginButton 내부 판단). */}
      <div className="mt-7 w-full">
        <KakaoLoginButton
          href={`/api/auth/kakao${q}`}
          returnTo={safeReturn}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] text-[15px] font-semibold text-[#191600] shadow-card transition-[transform,background-color] hover:bg-[#f8e200] active:scale-[.98]"
        >
          <KakaoMark />
          카카오로 시작하기
        </KakaoLoginButton>
      </div>

      <p className="mt-5 max-w-xs text-center text-xs leading-relaxed text-muted-foreground">
        로그인 시{" "}
        <a href="/terms" className="underline underline-offset-2">
          이용약관
        </a>{" "}
        및{" "}
        <a href="/privacy" className="underline underline-offset-2">
          개인정보처리방침
        </a>
        에 동의하게 됩니다.
      </p>
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
