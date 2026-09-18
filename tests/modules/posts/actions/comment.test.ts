import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const queryRaw = vi.fn();
const txCreate = vi.fn();
const transaction = vi.fn();
const commentFindFirst = vi.fn();
const commentUpdateMany = vi.fn();
const postFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    postComment: { count, findFirst: commentFindFirst, updateMany: commentUpdateMany },
    post: { findFirst: postFindFirst },
    $transaction: transaction,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// redirect는 실제 Next처럼 흐름을 중단(throw)해야 가드 이후 코드가 실행되지 않는다.
// (tests/modules/auth/actions.test.ts 선례, actions/post.test.ts와 동일 패턴)
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

beforeEach(() => {
  vi.resetModules();
  redirectMock.mockClear();
  mockGetCurrentAccount.mockReset().mockResolvedValue(ACCOUNT);
  count.mockReset().mockResolvedValue(0);
  queryRaw.mockReset().mockResolvedValue([{ public_code: "new-code" }]);
  txCreate.mockReset().mockResolvedValue({});
  transaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ $queryRaw: queryRaw, postComment: { create: txCreate } }),
  );
  commentFindFirst.mockReset().mockResolvedValue({ postId: 1n, hiddenAt: null });
  commentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  postFindFirst.mockReset().mockResolvedValue({ publicCode: "existing-code" });
});

describe("createComment 액션", () => {
  const input = { postId: 1, body: "댓글 본문" };

  it("happy — 세션 계정 id로 mutation에 위임하고 글 목록·상세를 revalidate한다", async () => {
    const { createComment } = await import("@/modules/posts/actions/comment");
    const { revalidatePath } = await import("next/cache");
    const result = await createComment(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "new-code" } });
    expect(txCreate).toHaveBeenCalledTimes(1);
    const data = txCreate.mock.calls[0][0].data;
    expect(data.accountId).toBe(ACCOUNT.id);
    // 이름 스냅샷은 기록하지 않는다 — 작성자 표시는 account 라이브 조회.
    expect(data).not.toHaveProperty("authorName");
    expect(data).not.toHaveProperty("authorCode");
    expect(revalidatePath).toHaveBeenCalledWith("/posts");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/my");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/new-code");
  });

  it("비로그인 — /login으로 리다이렉트하고 mutation은 호출되지 않는다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { createComment } = await import("@/modules/posts/actions/comment");
    await expect(createComment(input)).rejects.toThrow("REDIRECT:/login");
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(공백 본문) — mutation은 호출되지 않는다", async () => {
    const { createComment } = await import("@/modules/posts/actions/comment");
    const result = await createComment({ ...input, body: "   " });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(txCreate).not.toHaveBeenCalled();
  });
});

describe("updateComment 액션", () => {
  const input = { id: 1, body: "수정된 댓글" };

  it("happy — mutation에 위임하고 글 목록·상세를 revalidate한다", async () => {
    const { updateComment } = await import("@/modules/posts/actions/comment");
    const { revalidatePath } = await import("next/cache");
    const result = await updateComment(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "existing-code" } });
    expect(commentUpdateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/posts");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/my");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/existing-code");
  });

  it("비로그인 — /login으로 리다이렉트하고 mutation은 호출되지 않는다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { updateComment } = await import("@/modules/posts/actions/comment");
    await expect(updateComment(input)).rejects.toThrow("REDIRECT:/login");
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(id 0) — mutation은 호출되지 않는다", async () => {
    const { updateComment } = await import("@/modules/posts/actions/comment");
    const result = await updateComment({ ...input, id: 0 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });
});

describe("deleteComment 액션", () => {
  it("happy — mutation에 위임하고 글 목록·상세를 revalidate한다", async () => {
    const { deleteComment } = await import("@/modules/posts/actions/comment");
    const { revalidatePath } = await import("next/cache");
    await deleteComment(1);

    expect(commentUpdateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/posts");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/my");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/existing-code");
  });

  it("비로그인 — /login으로 리다이렉트하고 mutation은 호출되지 않는다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { deleteComment } = await import("@/modules/posts/actions/comment");
    await expect(deleteComment(1)).rejects.toThrow("REDIRECT:/login");
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(id 0) — mutation은 호출되지 않는다", async () => {
    const { deleteComment } = await import("@/modules/posts/actions/comment");
    const result = await deleteComment(0);
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });
});
