import { beforeEach, describe, expect, it, vi } from "vitest";

// requireAdmin은 세션 DAL 기반 — 액션 경계(허용/거부) + 호출 순서만 검증하도록 스텁한다.
// (tests/modules/products/actions.test.ts 선례)
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/modules/admin/lib/requireBoardManager", () => ({ requireBoardManager: mockRequireAdmin }));

const postFindFirst = vi.fn();
const postUpdateMany = vi.fn();
const postReportUpdateMany = vi.fn();
const commentFindFirst = vi.fn();
const commentUpdateMany = vi.fn();
const postCommentReportUpdateMany = vi.fn();
const transaction = vi.fn();
const queryRaw = vi.fn();

function fakeTx() {
  return {
    $queryRaw: queryRaw,
    post: { findFirst: postFindFirst, updateMany: postUpdateMany },
    postReport: { updateMany: postReportUpdateMany },
    postComment: { findFirst: commentFindFirst, updateMany: commentUpdateMany },
    postCommentReport: { updateMany: postCommentReportUpdateMany },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    post: { findFirst: postFindFirst, updateMany: postUpdateMany },
    postReport: { updateMany: postReportUpdateMany },
    postComment: { findFirst: commentFindFirst, updateMany: commentUpdateMany },
    postCommentReport: { updateMany: postCommentReportUpdateMany },
    $transaction: transaction,
  },
}));

// revalidatePath 호출 이력은 파일 전체에서 누적되므로(vitest 기본 clearMocks:false),
// dismissReport의 "/posts는 대상 아님" 부정 단언을 위해 매 테스트마다 명시적으로 비운다.
const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const ADMIN = { id: "33333333-3333-3333-3333-333333333333", isAdmin: true };

beforeEach(() => {
  vi.resetModules();
  revalidatePathMock.mockClear();
  mockRequireAdmin.mockReset().mockResolvedValue(ADMIN);
  postFindFirst.mockReset().mockResolvedValue({ publicCode: "post-code" });
  postUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  postReportUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  commentFindFirst.mockReset().mockResolvedValue({ postId: 7n });
  queryRaw.mockReset().mockResolvedValue([{ public_code: "post-code" }]);
  commentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  postCommentReportUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  transaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx()));
});

describe("hidePost 액션", () => {
  const input = { targetId: 1, reason: "스팸 도배" };

  it("happy — mutation에 위임하고 목록·상세·admin 큐를 revalidate한다", async () => {
    const { hidePost } = await import("@/modules/posts/actions/moderation");
    const result = await hidePost(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "post-code" } });
    expect(postUpdateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts/post-code");
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts/my");
    expect(revalidatePathMock).toHaveBeenCalledWith("/board/posts");
  });

  it("도메인 오류 — 숨길 수 없는 글은 throw가 아니라 ok:false 결과로 반환(프로덕션 메시지 보존)", async () => {
    postUpdateMany.mockResolvedValue({ count: 0 }); // 조건부 UPDATE 0행 = 이미 숨김/삭제됨
    const { hidePost } = await import("@/modules/posts/actions/moderation");
    const result = await hidePost(input);
    expect(result).toEqual({ ok: false, message: "숨길 수 없는 글입니다", code: undefined });
  });

  it("권한 거부 — admin이 아니면 mutation 전에 거부된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { hidePost } = await import("@/modules/posts/actions/moderation");
    await expect(hidePost(input)).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(postUpdateMany).not.toHaveBeenCalled();
  });

  it("입력 검증 실패(사유 누락) — mutation은 호출되지 않는다", async () => {
    const { hidePost } = await import("@/modules/posts/actions/moderation");
    const result = await hidePost({ targetId: 1 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(postUpdateMany).not.toHaveBeenCalled();
  });

  it("requireAdmin이 parse보다 먼저 실행된다 — 잘못된 입력이어도 인가 에러가 우선한다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { hidePost } = await import("@/modules/posts/actions/moderation");
    // targetId·reason 모두 없는 입력 — parse가 먼저였다면 ZodError가 발생했을 것이다.
    await expect(hidePost({})).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("unhidePost 액션", () => {
  const input = { targetId: 1 };

  it("happy — mutation에 위임하고 목록·상세·admin 큐를 revalidate한다", async () => {
    const { unhidePost } = await import("@/modules/posts/actions/moderation");
    const result = await unhidePost(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "post-code" } });
    expect(postUpdateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts/post-code");
    expect(revalidatePathMock).toHaveBeenCalledWith("/board/posts");
  });

  it("권한 거부 — admin이 아니면 mutation 전에 거부된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { unhidePost } = await import("@/modules/posts/actions/moderation");
    await expect(unhidePost(input)).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(postUpdateMany).not.toHaveBeenCalled();
  });

  it("입력 검증 실패(targetId 0) — mutation은 호출되지 않는다", async () => {
    const { unhidePost } = await import("@/modules/posts/actions/moderation");
    const result = await unhidePost({ targetId: 0 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(postUpdateMany).not.toHaveBeenCalled();
  });

  it("requireAdmin이 parse보다 먼저 실행된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { unhidePost } = await import("@/modules/posts/actions/moderation");
    await expect(unhidePost({})).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("hideComment 액션", () => {
  const input = { targetId: 5, reason: "욕설" };

  it("happy — mutation에 위임하고 목록·상세·admin 큐를 revalidate한다(postCodeOf로 상세 코드 조회)", async () => {
    const { hideComment } = await import("@/modules/posts/actions/moderation");
    const result = await hideComment(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "post-code" } });
    expect(commentUpdateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts/post-code");
    expect(revalidatePathMock).toHaveBeenCalledWith("/board/posts");
  });

  it("권한 거부 — admin이 아니면 mutation 전에 거부된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { hideComment } = await import("@/modules/posts/actions/moderation");
    await expect(hideComment(input)).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("입력 검증 실패(사유 누락) — mutation은 호출되지 않는다", async () => {
    const { hideComment } = await import("@/modules/posts/actions/moderation");
    const result = await hideComment({ targetId: 5 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("requireAdmin이 parse보다 먼저 실행된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { hideComment } = await import("@/modules/posts/actions/moderation");
    await expect(hideComment({})).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("unhideComment 액션", () => {
  const input = { targetId: 5 };

  it("happy — mutation에 위임하고 목록·상세·admin 큐를 revalidate한다", async () => {
    const { unhideComment } = await import("@/modules/posts/actions/moderation");
    const result = await unhideComment(input);

    expect(result).toEqual({ ok: true, data: { postPublicCode: "post-code" } });
    expect(commentUpdateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith("/posts/post-code");
    expect(revalidatePathMock).toHaveBeenCalledWith("/board/posts");
  });

  it("권한 거부 — admin이 아니면 mutation 전에 거부된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { unhideComment } = await import("@/modules/posts/actions/moderation");
    await expect(unhideComment(input)).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("입력 검증 실패(targetId 0) — mutation은 호출되지 않는다", async () => {
    const { unhideComment } = await import("@/modules/posts/actions/moderation");
    const result = await unhideComment({ targetId: 0 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("requireAdmin이 parse보다 먼저 실행된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { unhideComment } = await import("@/modules/posts/actions/moderation");
    await expect(unhideComment({})).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("dismissReport 액션", () => {
  const input = { target: "post" as const, reportId: 1 };

  it("happy — mutation에 위임하고 admin 신고 큐만 revalidate한다(콘텐츠 미변경이라 /posts는 대상 아님)", async () => {
    const { dismissReport } = await import("@/modules/posts/actions/moderation");
    await dismissReport(input);

    expect(postReportUpdateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/board/posts");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/posts");
  });

  it("권한 거부 — admin이 아니면 mutation 전에 거부된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { dismissReport } = await import("@/modules/posts/actions/moderation");
    await expect(dismissReport(input)).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(postReportUpdateMany).not.toHaveBeenCalled();
  });

  it("입력 검증 실패(target 누락) — mutation은 호출되지 않는다", async () => {
    const { dismissReport } = await import("@/modules/posts/actions/moderation");
    const result = await dismissReport({ reportId: 1 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(postReportUpdateMany).not.toHaveBeenCalled();
  });

  it("requireAdmin이 parse보다 먼저 실행된다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { dismissReport } = await import("@/modules/posts/actions/moderation");
    await expect(dismissReport({})).rejects.toThrow(/관리자 권한이 필요합니다/);
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
  });
});
