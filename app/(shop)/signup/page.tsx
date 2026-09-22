// 가입 닉네임 화면 — OAuth 신규 신원만 도달(pending-account 쿠키 보유). 제출 시 account 최초 생성.
import { redirect } from "next/navigation";

import { PageBack } from "@/components/PageBack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/modules/ui/components/BrandMark";
import { completeSignupAction } from "@/modules/auth/actions";
import { FavoriteCheckboxGrid } from "@/modules/favorites/components/FavoriteCheckboxGrid";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { NICKNAME_MAX_LENGTH } from "@/modules/auth/lib/nickname";
import {
  readPendingAccountByToken,
  readPendingAccountToken,
} from "@/modules/auth/lib/pending-account";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_nickname: `닉네임을 확인해 주세요. (1–${NICKNAME_MAX_LENGTH}자)`,
  consent_required: "필수 약관에 동의해 주세요.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const token = await readPendingAccountToken();
  const claims = token ? await readPendingAccountByToken(token) : null;
  // 가입 대기가 없거나 만료 → 로그인부터 다시.
  if (!claims) redirect("/login?error=signup_expired");

  const { error } = await searchParams;
  const message = error ? (ERROR_MESSAGES[error] ?? null) : null;
  const [teams, members] = await Promise.all([listTeams(), listMembers()]);

  return (
    <div className="space-y-3">
      {/* 뒤로가기 — 다른 계정으로 다시 로그인하러 갈 수 있게. */}
      <div className="flex items-center gap-2">
        <PageBack fallbackHref="/login" />
        <span className="text-sm text-muted-foreground">로그인으로 돌아가기</span>
      </div>

      <div className="rounded-md border border-border bg-card p-8 shadow-card">
        <div className="mb-8 text-center">
          <BrandMark className="mx-auto mb-4 h-14 w-14" preload />
          <h1 className="font-display text-2xl text-foreground">
            거의 다 왔어요!
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            서비스에서 사용할 닉네임을 입력해 주세요.
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

      <form action={completeSignupAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="nickname"
            className="text-sm font-medium text-foreground"
          >
            닉네임
          </label>
          <Input
            id="nickname"
            name="nickname"
            type="text"
            required
            maxLength={NICKNAME_MAX_LENGTH}
            defaultValue={claims.displayName ?? ""}
            autoComplete="nickname"
            placeholder="닉네임"
          />
        </div>
        {/* 최애 선택(선택 사항) — 홈 추천에 사용. 네이티브 체크박스라 JS 불필요. */}
        {(teams.length > 0 || members.length > 0) && (
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <FavoriteCheckboxGrid
              teams={teams.map((t) => ({ id: t.id, name: t.name }))}
              members={members.map((m) => ({
                id: m.id,
                name: m.name,
                teamIds: m.teamIds,
                displayOrderByTeam: m.displayOrderByTeam,
              }))}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              선택하면 홈에서 최애 위주로 추천해 드려요. 나중에 회원정보에서
              바꿀 수 있어요.
            </p>
          </div>
        )}
        {/* 약관 동의 — 필수 2개(이용약관·개인정보), 선택 1개(마케팅 수신). 네이티브 required로 강제. */}
        <fieldset className="space-y-2 rounded-md border border-border bg-muted/20 p-4">
          <legend className="px-1 text-sm font-medium text-foreground">약관 동의</legend>
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="agree_terms"
              required
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span>
              <span className="text-destructive">[필수]</span>{" "}
              <a href="/terms" target="_blank" className="text-primary underline underline-offset-2">
                이용약관
              </a>
              에 동의합니다.
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="agree_privacy"
              required
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span>
              <span className="text-destructive">[필수]</span>{" "}
              <a href="/privacy" target="_blank" className="text-primary underline underline-offset-2">
                개인정보 수집·이용
              </a>
              에 동의합니다.
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="agree_marketing"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span>[선택] 이벤트·혜택 소식 알림 수신에 동의합니다.</span>
          </label>
        </fieldset>
        <Button type="submit" size="lg">
          시작하기
        </Button>
        </form>
      </div>
    </div>
  );
}
