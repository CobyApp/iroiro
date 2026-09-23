import { beforeEach, describe, expect, it, vi } from "vitest";

const { commentFindMany, accountFindMany, commentCount } = vi.hoisted(() => ({
  commentFindMany: vi.fn(),
  accountFindMany: vi.fn(),
  commentCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usedListingComment: { findMany: commentFindMany, count: commentCount },
    account: { findMany: accountFindMany },
  },
}));

import { countUsedComments, listUsedComments } from "@/modules/used/lib/comments";

const t = (over: Record<string, unknown>) => ({
  id: 1n,
  listingId: 10n,
  accountId: "a",
  parentId: null,
  body: "body",
  deletedAt: null,
  editedAt: null,
  createdAt: new Date("2026-09-23T00:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  accountFindMany.mockResolvedValue([
    { id: "a", displayName: "에이" },
    { id: "b", displayName: "비" },
  ]);
});

describe("listUsedComments", () => {
  it("최상위 댓글과 대댓글을 1단계 스레드로 묶는다", async () => {
    commentFindMany.mockResolvedValue([
      t({ id: 1n, accountId: "a", parentId: null }),
      t({ id: 2n, accountId: "b", parentId: 1n, body: "답글" }),
    ]);
    const nodes = await listUsedComments(10);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe(1);
    expect(nodes[0].authorName).toBe("에이");
    expect(nodes[0].replies).toHaveLength(1);
    expect(nodes[0].replies[0].id).toBe(2);
    expect(nodes[0].replies[0].authorName).toBe("비");
  });

  it("삭제된 최상위 댓글에 살아있는 대댓글이 있으면 마스킹해 남긴다", async () => {
    commentFindMany.mockResolvedValue([
      t({ id: 1n, parentId: null, deletedAt: new Date() }),
      t({ id: 2n, parentId: 1n, body: "답글" }),
    ]);
    const nodes = await listUsedComments(10);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].deleted).toBe(true);
    expect(nodes[0].body).toBe("삭제된 댓글입니다");
    expect(nodes[0].replies).toHaveLength(1);
  });

  it("삭제된 최상위 댓글이고 대댓글이 없으면 제외한다", async () => {
    commentFindMany.mockResolvedValue([
      t({ id: 1n, parentId: null, deletedAt: new Date() }),
    ]);
    const nodes = await listUsedComments(10);
    expect(nodes).toHaveLength(0);
  });

  it("삭제된 대댓글은 숨긴다", async () => {
    commentFindMany.mockResolvedValue([
      t({ id: 1n, parentId: null }),
      t({ id: 2n, parentId: 1n, deletedAt: new Date() }),
    ]);
    const nodes = await listUsedComments(10);
    expect(nodes[0].replies).toHaveLength(0);
  });

  it("댓글이 없으면 빈 배열", async () => {
    commentFindMany.mockResolvedValue([]);
    const nodes = await listUsedComments(10);
    expect(nodes).toEqual([]);
    expect(accountFindMany).not.toHaveBeenCalled();
  });
});

describe("countUsedComments", () => {
  it("삭제 제외 카운트를 위임한다", async () => {
    commentCount.mockResolvedValue(4);
    const n = await countUsedComments(10);
    expect(n).toBe(4);
    expect(commentCount.mock.calls[0][0].where.deletedAt).toBeNull();
  });
});
