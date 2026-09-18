import { beforeEach, describe, expect, it, vi } from "vitest";

const postReportCount = vi.fn();
const postCommentReportCount = vi.fn();
const queryRaw = vi.fn();
const commentFindFirst = vi.fn();
const txPostReportCreate = vi.fn();
const txCommentReportCreate = vi.fn();
const txPhotoFindMany = vi.fn().mockResolvedValue([]); // 신고 스냅샷 v2 사진 동결(P1-5)
const transaction = vi.fn();

function fakeTx() {
  return {
    $queryRaw: queryRaw,
    postComment: { findFirst: commentFindFirst },
    postReport: { create: txPostReportCreate },
    postCommentReport: { create: txCommentReportCreate },
    postPhoto: { findMany: txPhotoFindMany },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    postReport: { count: postReportCount },
    postCommentReport: { count: postCommentReportCount },
    $transaction: transaction,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// redirect는 실제 Next처럼 흐름을 중단(throw)해야 가드 이후 코드가 실행되지 않는다.
// (tests/modules/posts/actions/post.test.ts 선례)
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

const ACCOUNT = {
  id: "11111111-1111-1111-1111-111111111111",
  displayName: "작성자",
  publicCode: "AUTH0001",
};
const OWNER = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  vi.resetModules();
  redirectMock.mockClear();
  mockGetCurrentAccount.mockReset().mockResolvedValue(ACCOUNT);
  postReportCount.mockReset().mockResolvedValue(0);
  postCommentReportCount.mockReset().mockResolvedValue(0);
  queryRaw.mockReset();
  commentFindFirst.mockReset().mockResolvedValue({ postId: 10n });
  txPostReportCreate.mockReset().mockResolvedValue({});
  txCommentReportCreate.mockReset().mockResolvedValue({});
  transaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx()));
});

describe("reportPost 액션", () => {
  const input = { targetId: 1, reason: "spam" };

  it("happy — 세션 계정으로 신고를 생성하고 admin 신고 큐를 revalidate한다", async () => {
    queryRaw.mockResolvedValueOnce([{
      account_id: OWNER, title: "제목", body: "본문",
      author_name: "글쓴이", author_code: "OWN00001",
      updated_at: new Date("2026-07-20T00:00:00Z"),
    }]);
    const { reportPost } = await import("@/modules/posts/actions/report");
    const { revalidatePath } = await import("next/cache");
    await reportPost(input);

    expect(txPostReportCreate).toHaveBeenCalledTimes(1);
    expect(txPostReportCreate.mock.calls[0][0].data.reporterAccountId).toBe(ACCOUNT.id);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/posts");
  });

  it("비로그인 — /login으로 리다이렉트하고 mutation은 호출되지 않는다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { reportPost } = await import("@/modules/posts/actions/report");
    await expect(reportPost(input)).rejects.toThrow("REDIRECT:/login");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(잘못된 reason) — mutation은 호출되지 않는다", async () => {
    const { reportPost } = await import("@/modules/posts/actions/report");
    const result = await reportPost({ ...input, reason: "bogus" });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("reportComment 액션", () => {
  const input = { targetId: 2, reason: "abuse" };

  it("happy — 세션 계정으로 신고를 생성하고 admin 신고 큐를 revalidate한다", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: 10n }]) // post 선잠금 통과
      .mockResolvedValueOnce([{
        account_id: OWNER, body: "댓글", author_name: "글쓴이",
        author_code: "OWN00001", updated_at: new Date("2026-07-20T00:00:00Z"),
      }]);
    const { reportComment } = await import("@/modules/posts/actions/report");
    const { revalidatePath } = await import("next/cache");
    await reportComment(input);

    expect(txCommentReportCreate).toHaveBeenCalledTimes(1);
    expect(txCommentReportCreate.mock.calls[0][0].data.reporterAccountId).toBe(ACCOUNT.id);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/posts");
  });

  it("비로그인 — /login으로 리다이렉트하고 mutation은 호출되지 않는다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { reportComment } = await import("@/modules/posts/actions/report");
    await expect(reportComment(input)).rejects.toThrow("REDIRECT:/login");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(targetId 0) — mutation은 호출되지 않는다", async () => {
    const { reportComment } = await import("@/modules/posts/actions/report");
    const result = await reportComment({ ...input, targetId: 0 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
