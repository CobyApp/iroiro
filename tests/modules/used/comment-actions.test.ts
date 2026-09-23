import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentAccount,
  listingFindUnique,
  commentFindUnique,
  commentCreate,
  commentUpdateMany,
} = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  listingFindUnique: vi.fn(),
  commentFindUnique: vi.fn(),
  commentCreate: vi.fn(),
  commentUpdateMany: vi.fn(),
}));

vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    usedListing: { findUnique: listingFindUnique },
    usedListingComment: {
      findUnique: commentFindUnique,
      create: commentCreate,
      updateMany: commentUpdateMany,
    },
  },
}));

import {
  createUsedComment,
  deleteUsedComment,
} from "@/modules/used/comment-actions";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentAccount.mockResolvedValue({ id: "me" });
  listingFindUnique.mockResolvedValue({ id: 1n });
  commentCreate.mockResolvedValue({ id: 5n });
});

describe("createUsedComment", () => {
  it("로그인 회원이 최상위 댓글을 작성한다", async () => {
    const res = await createUsedComment({ listingId: 1, body: "안녕하세요" });
    expect(res.ok).toBe(true);
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingId: 1n,
          accountId: "me",
          parentId: null,
          body: "안녕하세요",
        }),
      }),
    );
  });

  it("비로그인은 거부", async () => {
    getCurrentAccount.mockResolvedValue(null);
    const res = await createUsedComment({ listingId: 1, body: "x" });
    expect(res.ok).toBe(false);
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("빈 내용은 거부", async () => {
    const res = await createUsedComment({ listingId: 1, body: "   " });
    expect(res.ok).toBe(false);
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("없는 매물이면 거부", async () => {
    listingFindUnique.mockResolvedValue(null);
    const res = await createUsedComment({ listingId: 99, body: "x" });
    expect(res.ok).toBe(false);
  });

  it("대댓글은 같은 매물의 최상위 댓글에만 — 대댓글의 대댓글 거부", async () => {
    commentFindUnique.mockResolvedValue({
      listingId: 1n,
      parentId: 2n, // 이미 대댓글
      deletedAt: null,
    });
    const res = await createUsedComment({ listingId: 1, parentId: 3, body: "x" });
    expect(res.ok).toBe(false);
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("다른 매물의 댓글에 답글 시도 거부", async () => {
    commentFindUnique.mockResolvedValue({
      listingId: 2n,
      parentId: null,
      deletedAt: null,
    });
    const res = await createUsedComment({ listingId: 1, parentId: 3, body: "x" });
    expect(res.ok).toBe(false);
  });

  it("정상 대댓글 작성", async () => {
    commentFindUnique.mockResolvedValue({
      listingId: 1n,
      parentId: null,
      deletedAt: null,
    });
    const res = await createUsedComment({ listingId: 1, parentId: 3, body: "답글" });
    expect(res.ok).toBe(true);
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 3n }),
      }),
    );
  });
});

describe("deleteUsedComment", () => {
  it("본인 댓글만 삭제(소프트)", async () => {
    commentFindUnique.mockResolvedValue({
      accountId: "me",
      listingId: 1n,
      deletedAt: null,
    });
    commentUpdateMany.mockResolvedValue({ count: 1 });
    const res = await deleteUsedComment(5);
    expect(res.ok).toBe(true);
    expect(commentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: "me" }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it("남의 댓글 삭제 거부", async () => {
    commentFindUnique.mockResolvedValue({
      accountId: "other",
      listingId: 1n,
      deletedAt: null,
    });
    const res = await deleteUsedComment(5);
    expect(res.ok).toBe(false);
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("이미 삭제된 댓글 거부", async () => {
    commentFindUnique.mockResolvedValue({
      accountId: "me",
      listingId: 1n,
      deletedAt: new Date(),
    });
    const res = await deleteUsedComment(5);
    expect(res.ok).toBe(false);
  });
});
