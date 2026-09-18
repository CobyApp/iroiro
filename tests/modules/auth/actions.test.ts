import { beforeEach, describe, expect, it, vi } from "vitest";

// redirect는 실제 Next처럼 흐름을 중단(throw)해야 가드 이후 코드가 실행되지 않는다.
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
const cookieSet = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    get: () => undefined,
    delete: () => {},
  })),
}));

const account = vi.hoisted(() => ({
  findAccountByIdentity: vi.fn(),
  createAccountFromSignup: vi.fn(),
  updateAccountDisplayName: vi.fn(),
  updateAccountAvatar: vi.fn(),
  softDeleteAccount: vi.fn(),
}));
vi.mock("@/modules/auth/lib/account", () => account);

const r2presign = vi.hoisted(() => ({
  getSignedUploadUrl: vi.fn(async () => "https://r2/upload"),
  getPublicUrl: vi.fn((k: string) => `https://pub/${k}`),
}));
vi.mock("@/lib/r2/presign", () => r2presign);

const cookiesLib = vi.hoisted(() => ({
  SESSION_COOKIE_NAME: "session",
  clearSessionCookie: vi.fn(),
  readSessionToken: vi.fn(),
  sessionCookieOptions: vi.fn(() => ({ __opts: true })),
}));
vi.mock("@/modules/auth/lib/cookies", () => cookiesLib);

const nickname = vi.hoisted(() => ({ parseNickname: vi.fn() }));
vi.mock("@/modules/auth/lib/nickname", () => nickname);

const pending = vi.hoisted(() => ({
  clearPendingAccountCookie: vi.fn(),
  consumePendingAccount: vi.fn(),
  readPendingAccountByToken: vi.fn(),
  readPendingAccountToken: vi.fn(),
}));
vi.mock("@/modules/auth/lib/pending-account", () => pending);

const session = vi.hoisted(() => ({
  createSession: vi.fn(),
  invalidateSession: vi.fn(),
}));
vi.mock("@/modules/auth/lib/session", () => session);

const dal = vi.hoisted(() => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/modules/auth/dal", () => dal);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  completeSignupAction,
  deleteAccount,
  logout,
  presignAvatar,
  updateAvatar,
  updateProfile,
} from "@/modules/auth/actions";

// clearAllMocks는 호출 기록만 비우고 구현(redirect throw 등)은 유지한다.
beforeEach(() => vi.clearAllMocks());

describe("logout", () => {
  it("세션이 있으면 폐기·쿠키 제거 후 홈으로", async () => {
    cookiesLib.readSessionToken.mockResolvedValue("tok-1");

    await expect(logout()).rejects.toThrow("REDIRECT:/");

    expect(session.invalidateSession).toHaveBeenCalledWith("tok-1");
    expect(cookiesLib.clearSessionCookie).toHaveBeenCalled();
  });

  it("세션이 없으면 폐기 호출 없이 쿠키만 제거", async () => {
    cookiesLib.readSessionToken.mockResolvedValue(null);

    await expect(logout()).rejects.toThrow("REDIRECT:/");

    expect(session.invalidateSession).not.toHaveBeenCalled();
    expect(cookiesLib.clearSessionCookie).toHaveBeenCalled();
  });
});

describe("completeSignupAction", () => {
  const form = (nick: string) => {
    const fd = new FormData();
    fd.set("nickname", nick);
    return fd;
  };
  const claims = {
    provider: "kakao",
    providerUserId: "k-1",
    email: "a@b.com",
    displayName: "철수",
  };

  it("pending 토큰이 없으면 signup_expired로 리다이렉트", async () => {
    pending.readPendingAccountToken.mockResolvedValue(null);

    await expect(completeSignupAction(form("민수"))).rejects.toThrow(
      "REDIRECT:/login?error=signup_expired",
    );
    expect(account.findAccountByIdentity).not.toHaveBeenCalled();
  });

  it("pending claims가 만료/없으면 signup_expired로", async () => {
    pending.readPendingAccountToken.mockResolvedValue("pt");
    pending.readPendingAccountByToken.mockResolvedValue(null);

    await expect(completeSignupAction(form("민수"))).rejects.toThrow(
      "REDIRECT:/login?error=signup_expired",
    );
  });

  it("닉네임 검증 실패면 invalid_nickname로 (account 생성 없음)", async () => {
    pending.readPendingAccountToken.mockResolvedValue("pt");
    pending.readPendingAccountByToken.mockResolvedValue(claims);
    nickname.parseNickname.mockImplementation(() => {
      throw new Error("invalid");
    });

    await expect(completeSignupAction(form(""))).rejects.toThrow(
      "REDIRECT:/signup?error=invalid_nickname",
    );
    expect(account.createAccountFromSignup).not.toHaveBeenCalled();
  });

  it("happy: 신규 account 생성→세션 발급→pending 소비→홈으로", async () => {
    pending.readPendingAccountToken.mockResolvedValue("pt");
    pending.readPendingAccountByToken.mockResolvedValue(claims);
    nickname.parseNickname.mockReturnValue("민수");
    account.findAccountByIdentity.mockResolvedValue(null);
    account.createAccountFromSignup.mockResolvedValue({ id: "acc-1" });
    const expiresAt = new Date("2030-01-01");
    session.createSession.mockResolvedValue({ token: "st", expiresAt });

    await expect(completeSignupAction(form("민수"))).rejects.toThrow(
      "REDIRECT:/",
    );

    expect(account.createAccountFromSignup).toHaveBeenCalledWith({
      provider: "kakao",
      providerUserId: "k-1",
      email: "a@b.com",
      displayName: "민수",
    });
    expect(session.createSession).toHaveBeenCalledWith("acc-1");
    expect(cookieSet).toHaveBeenCalledWith("session", "st", { __opts: true });
    expect(pending.consumePendingAccount).toHaveBeenCalledWith("pt");
    expect(pending.clearPendingAccountCookie).toHaveBeenCalled();
  });

  it("중복 제출: 이미 가입된 신원이면 createAccount 없이 그 계정으로 로그인", async () => {
    pending.readPendingAccountToken.mockResolvedValue("pt");
    pending.readPendingAccountByToken.mockResolvedValue(claims);
    nickname.parseNickname.mockReturnValue("민수");
    account.findAccountByIdentity.mockResolvedValue({ id: "acc-existing" });
    session.createSession.mockResolvedValue({
      token: "st2",
      expiresAt: new Date("2030-01-01"),
    });

    await expect(completeSignupAction(form("민수"))).rejects.toThrow(
      "REDIRECT:/",
    );

    expect(account.createAccountFromSignup).not.toHaveBeenCalled();
    expect(session.createSession).toHaveBeenCalledWith("acc-existing");
  });
});

describe("updateProfile", () => {
  it("비로그인이면 에러 — 업데이트 안 함", async () => {
    dal.getCurrentAccount.mockResolvedValue(null);
    await expect(updateProfile({ displayName: "민수" })).rejects.toThrow();
    expect(account.updateAccountDisplayName).not.toHaveBeenCalled();
  });

  it("닉네임 검증 실패면 업데이트 안 함", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    nickname.parseNickname.mockImplementation(() => {
      throw new Error("invalid");
    });
    await expect(updateProfile({ displayName: "" })).rejects.toThrow();
    expect(account.updateAccountDisplayName).not.toHaveBeenCalled();
  });

  it("유효하면 현재 계정 id로 닉네임 갱신", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    nickname.parseNickname.mockReturnValue("민수");
    await updateProfile({ displayName: "  민수  " });
    expect(account.updateAccountDisplayName).toHaveBeenCalledWith(
      "acc-1",
      "민수",
    );
  });
});

describe("presignAvatar", () => {
  it("비이미지 MIME 거부", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    await expect(
      presignAvatar({ contentType: "application/pdf" }),
    ).rejects.toThrow();
  });
  it("이미지면 avatars/ 키 + uploadUrl 반환", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    const r = await presignAvatar({ contentType: "image/png" });
    expect(r.key.startsWith("avatars/")).toBe(true);
    expect(r.uploadUrl).toBe("https://r2/upload");
  });
});

describe("updateAvatar", () => {
  it("비로그인 throw", async () => {
    dal.getCurrentAccount.mockResolvedValue(null);
    await expect(updateAvatar({ key: "avatars/x.png" })).rejects.toThrow();
  });
  it("avatars/ 아닌 키 거부", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    await expect(updateAvatar({ key: "hack/x.png" })).rejects.toThrow();
    expect(account.updateAccountAvatar).not.toHaveBeenCalled();
  });
  it("유효 키면 저장", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    await updateAvatar({ key: "avatars/x.png" });
    expect(account.updateAccountAvatar).toHaveBeenCalledWith(
      "acc-1",
      "avatars/x.png",
    );
  });
});

describe("deleteAccount", () => {
  it("비로그인이면 소프트삭제 안 함", async () => {
    dal.getCurrentAccount.mockResolvedValue(null);
    await expect(deleteAccount()).rejects.toThrow();
    expect(account.softDeleteAccount).not.toHaveBeenCalled();
  });
  it("로그인 시 소프트삭제+쿠키제거+홈 리다이렉트", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    await expect(deleteAccount()).rejects.toThrow("REDIRECT:/");
    expect(account.softDeleteAccount).toHaveBeenCalledWith("acc-1");
    expect(cookiesLib.clearSessionCookie).toHaveBeenCalled();
  });
});
