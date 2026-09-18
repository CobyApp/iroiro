import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const create = vi.fn();
const findFirst = vi.fn();
const updateMany = vi.fn();

// 공통 tx mock — update/delete(Task 8)와 사진 생성(Task 11)이 같은 객체를 공유한다.
const txQueryRaw = vi.fn();
const txCommentCount = vi.fn();
const txPostUpdate = vi.fn();
const txPostUpdateMany = vi.fn();
const txPhotoUpdateMany = vi.fn();
const txPostCreate = vi.fn(); // 사진 있는 생성은 tx 경로(Task 11)
const txPhotoCreateMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    post: { count, create, findFirst, updateMany },
    $transaction: transaction,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// redirect는 실제 Next처럼 흐름을 중단(throw)해야 가드 이후 코드가 실행되지 않는다.
// (tests/modules/auth/actions.test.ts 선례)
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

// requireAccount가 자체 세션(DAL) 기반 실검증이므로 로그인 세션을 스텁한다.
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
  create.mockReset().mockResolvedValue({ publicCode: "new-code" });
  findFirst.mockReset().mockResolvedValue({ publicCode: "existing-code", hiddenAt: null });
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  txQueryRaw.mockReset().mockResolvedValue([
    { public_code: "existing-code", topic: "community", title: "제목", body: "본문", hidden_at: null },
  ]);
  txCommentCount.mockReset().mockResolvedValue(0);
  txPostUpdate.mockReset().mockResolvedValue({});
  txPostUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txPhotoUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  txPostCreate.mockReset().mockResolvedValue({ id: 10n, publicCode: "new-code" });
  txPhotoCreateMany.mockReset().mockResolvedValue({ count: 1 });
  transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txQueryRaw,
      post: { create: txPostCreate, update: txPostUpdate, updateMany: txPostUpdateMany },
      postComment: { count: txCommentCount },
      postPhoto: { createMany: txPhotoCreateMany, updateMany: txPhotoUpdateMany },
    }),
  );
});

describe("createPost 액션", () => {
  const input = { topic: "community" as const, title: "제목", body: "본문" };

  it("happy — 세션 계정 id로 mutation에 위임하고 글 목록·상세를 revalidate한다", async () => {
    const { createPost } = await import("@/modules/posts/actions/post");
    const { revalidatePath } = await import("next/cache");
    const result = await createPost(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "new-code" } });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
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
    const { createPost } = await import("@/modules/posts/actions/post");
    await expect(createPost(input)).rejects.toThrow("REDIRECT:/login");
    expect(create).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(공백 제목) — mutation은 호출되지 않는다", async () => {
    const { createPost } = await import("@/modules/posts/actions/post");
    const result = await createPost({ ...input, title: "   " });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(create).not.toHaveBeenCalled();
  });

  it("createPost 입력의 photos가 zod를 통과해 mutation까지 전달된다", async () => {
    const consume = vi
      .fn()
      .mockResolvedValue([
        { id: 3n, r2Key: "posts/tmp/c.jpg", contentType: "image/jpeg", sizeBytes: 10 },
      ]);
    vi.doMock("@/modules/posts/lib/pending-photo", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/modules/posts/lib/pending-photo")>()),
      consumePendingPhotos: consume,
      finalizePendingPhotos: vi.fn().mockResolvedValue(["posts/c.jpg"]),
      cleanupTmpObjects: vi.fn().mockResolvedValue(undefined),
      compensateFinalObjects: vi.fn().mockResolvedValue(undefined),
    }));
    const { createPost } = await import("@/modules/posts/actions/post");

    const result = await createPost({ ...input, photos: [{ pendingPhotoId: 3 }] });

    expect(result).toEqual({ ok: true, data: { postPublicCode: "new-code" } });
    // pendingPhotoId 목록이 세션 계정(UUID fixture)과 함께 그대로 전달된다.
    expect(consume).toHaveBeenCalledWith(ACCOUNT.id, [3], expect.anything());
    // 사진이 있으면 tx 경로로 들어가 post+photo가 함께 INSERT된다.
    expect(txPhotoCreateMany).toHaveBeenCalledTimes(1);
    expect(txPhotoCreateMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ r2Key: "posts/c.jpg", displayOrder: 0, isThumbnail: true }),
    ]);
  });

  it("photos pendingPhotoId가 중복이면 invalid_input으로 거부한다", async () => {
    const { createPost } = await import("@/modules/posts/actions/post");
    const result = await createPost({ ...input, photos: [{ pendingPhotoId: 3 }, { pendingPhotoId: 3 }] });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
  });
});

describe("updatePost 액션", () => {
  const input = { id: 1, topic: "community" as const, title: "수정", body: "본문수정" };

  it("happy — mutation에 위임하고 글 목록·상세를 revalidate한다", async () => {
    const { updatePost } = await import("@/modules/posts/actions/post");
    const { revalidatePath } = await import("next/cache");
    const result = await updatePost(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "existing-code" } });
    expect(txPostUpdate).toHaveBeenCalledTimes(1); // write는 tx 안으로 이동(§11)
    expect(revalidatePath).toHaveBeenCalledWith("/posts");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/my");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/existing-code");
  });

  it("비로그인 — /login으로 리다이렉트하고 mutation은 호출되지 않는다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { updatePost } = await import("@/modules/posts/actions/post");
    await expect(updatePost(input)).rejects.toThrow("REDIRECT:/login");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(id 0) — mutation은 호출되지 않는다", async () => {
    const { updatePost } = await import("@/modules/posts/actions/post");
    const result = await updatePost({ ...input, id: 0 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("deletePost 액션", () => {
  it("happy — mutation에 위임하고 글 목록·상세를 revalidate한다", async () => {
    const { deletePost } = await import("@/modules/posts/actions/post");
    const { revalidatePath } = await import("next/cache");
    await deletePost(1);

    expect(txPostUpdateMany).toHaveBeenCalledTimes(1);
    expect(txPhotoUpdateMany).toHaveBeenCalledTimes(1); // 사진 동반 soft delete(P1-5)
    expect(revalidatePath).toHaveBeenCalledWith("/posts");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/my");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/existing-code");
  });

  it("비로그인 — /login으로 리다이렉트하고 mutation은 호출되지 않는다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { deletePost } = await import("@/modules/posts/actions/post");
    await expect(deletePost(1)).rejects.toThrow("REDIRECT:/login");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("zod 검증 실패(id 0) — mutation은 호출되지 않는다", async () => {
    const { deletePost } = await import("@/modules/posts/actions/post");
    const result = await deletePost(0);
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
