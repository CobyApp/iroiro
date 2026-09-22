"use server";

import { revalidatePath } from "next/cache";
import { replaceFavorites } from "@/modules/favorites/lib/queries";
import { grantWelcomeBenefits } from "@/modules/points/lib/grant";
import { applyReferral, REFERRAL_COOKIE } from "@/modules/referral/lib/apply";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { v7 as uuidv7 } from "uuid";

import { getSignedUploadUrl } from "@/lib/r2/presign";
import { getCurrentAccount } from "./dal";
import {
  createAccountFromSignup,
  findAccountByIdentity,
  softDeleteAccount,
  updateAccountAvatar,
  updateAccountDisplayName,
} from "./lib/account";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  readSessionToken,
  sessionCookieOptions,
} from "./lib/cookies";
import { parseNickname } from "./lib/nickname";
import {
  clearPendingAccountCookie,
  consumePendingAccount,
  readPendingAccountByToken,
  readPendingAccountToken,
} from "./lib/pending-account";
import { createSession, invalidateSession } from "./lib/session";

// 로그아웃 — 세션 행 즉시 폐기 + 쿠키 제거. Server Action.
export async function logout(): Promise<void> {
  const token = await readSessionToken();
  if (token) await invalidateSession(token);
  await clearSessionCookie();
  redirect("/");
}

// 가입 완료 — pending-account 검증 → 닉네임 검증 → account 원자 생성 + 세션 발급.
// deferred creation: 여기서 처음으로 account가 INSERT된다(닉네임 필수).
export async function completeSignupAction(formData: FormData): Promise<void> {
  const pendingToken = await readPendingAccountToken();
  const claims = pendingToken
    ? await readPendingAccountByToken(pendingToken)
    : null;
  if (!pendingToken || !claims) {
    redirect("/login?error=signup_expired");
  }

  // 필수 약관 동의 — 클라이언트 required의 백스톱(서버 검증).
  if (formData.get("agree_terms") !== "on" || formData.get("agree_privacy") !== "on") {
    redirect("/signup?error=consent_required");
  }

  let nickname: string;
  try {
    nickname = parseNickname(String(formData.get("nickname") ?? ""));
  } catch {
    redirect("/signup?error=invalid_nickname");
  }

  // 중복 제출 방어 — 같은 신원이 이미 생성됐으면 그 계정으로 로그인.
  let account = await findAccountByIdentity(
    claims.provider,
    claims.providerUserId,
  );
  if (!account) {
    account = await createAccountFromSignup({
      provider: claims.provider,
      providerUserId: claims.providerUserId,
      email: claims.email,
      displayName: nickname,
    });
    // 웰컴 포인트·쿠폰 — 실패해도 가입을 막지 않는다(유니크 백스톱으로 멱등).
    await grantWelcomeBenefits(account.id).catch((error) =>
      console.error("[signup] 웰컴 혜택 지급 실패", error),
    );
    // 리퍼럴 귀속 — 초대 링크로 들어와 심긴 쿠키가 있으면 양쪽 보상(멱등).
    const refStore = await cookies();
    const refCode = refStore.get(REFERRAL_COOKIE)?.value;
    if (refCode) {
      await applyReferral(account.id, refCode).catch((error) =>
        console.error("[signup] 리퍼럴 귀속 실패", error),
      );
      refStore.delete(REFERRAL_COOKIE);
    }
  }

  // 최애 선택(선택 사항) — 실패해도 가입을 막지 않는다.
  const favTeamIds = formData
    .getAll("favTeam")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const favMemberIds = formData
    .getAll("favMember")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (favTeamIds.length > 0 || favMemberIds.length > 0) {
    await replaceFavorites(account.id, {
      teamIds: favTeamIds.slice(0, 50),
      memberIds: favMemberIds.slice(0, 50),
    }).catch((error) => console.error("[signup] 최애 저장 실패", error));
  }

  const { token, expiresAt } = await createSession(account.id);
  await consumePendingAccount(pendingToken);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
  await clearPendingAccountCookie();

  // TODO(온보딩): 전화 인증 단계(/onboarding/phone)로. 지금은 홈으로.
  redirect("/");
}

// 회원정보 변경 — 현재 세션 계정의 닉네임을 갱신. Server Action.
export async function updateProfile(input: {
  displayName: string;
}): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  const nickname = parseNickname(input.displayName);
  await updateAccountDisplayName(account.id, nickname);
  revalidatePath("/mypage");
}

// 허용 이미지 MIME → 확장자.
const AVATAR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// 아바타 업로드용 presigned URL 발급 — 이미지 MIME만 허용. Server Action.
export async function presignAvatar(input: {
  contentType: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  const ext = AVATAR_MIME[input.contentType];
  if (!ext) throw new Error("이미지 파일만 업로드할 수 있습니다.");
  const key = `avatars/${uuidv7()}.${ext}`;
  const uploadUrl = await getSignedUploadUrl(key, input.contentType);
  return { uploadUrl, key };
}

// 업로드 완료된 아바타 키를 계정에 저장. Server Action.
export async function updateAvatar(input: { key: string }): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  if (!input.key.startsWith("avatars/")) throw new Error("잘못된 키입니다.");
  await updateAccountAvatar(account.id, input.key);
  revalidatePath("/mypage");
}

// 회원 탈퇴 — 소프트 삭제(비활성화) + 세션 폐기 + 쿠키 제거. Server Action.
export async function deleteAccount(): Promise<void> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");
  await softDeleteAccount(account.id);
  await clearSessionCookie();
  redirect("/");
}
