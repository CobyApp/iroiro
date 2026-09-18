import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { createPost, updatePost, deletePost } from "@/modules/posts/lib/mutations";
import { RATE_LIMITS } from "@/modules/posts/lib/schema";

const { pendingPhoto } = vi.hoisted(() => ({
  pendingPhoto: {
    consumePendingPhotos: vi.fn(),
    finalizePendingPhotos: vi.fn(),
    compensateFinalObjects: vi.fn(),
    cleanupTmpObjects: vi.fn(),
  },
}));
vi.mock("@/modules/posts/lib/pending-photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/posts/lib/pending-photo")>();
  return { ...actual, ...pendingPhoto };
});

const OWNER = "11111111-1111-1111-1111-111111111111";

const count = vi.fn();
const create = vi.fn();
const findFirst = vi.fn();
const updateMany = vi.fn();

// 사진 경로는 tx 안에서 post+photo를 함께 넣는다 — 기존 케이스와 공존하도록 tx를 노출한다.
const txPostCreate = vi.fn();
const txPhotoCreateMany = vi.fn();
const transaction = vi.fn();
const tx = {
  post: { create: txPostCreate },
  postPhoto: { createMany: txPhotoCreateMany },
};

function makeDb() {
  return { tx, post: { count, create, findFirst, updateMany }, $transaction: transaction };
}

const createInput = { topic: "talk" as const, title: "제목", body: "본문" };

// Prisma 7 + adapter-pg 실측 P2002 구조(meta.target 없음) — tests/modules/notices/actions.test.ts 선례.
function p2002(fields: string[]) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "Post",
      driverAdapterError: {
        cause: {
          originalCode: "23505",
          originalMessage: "duplicate key value violates unique constraint",
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}

beforeEach(() => {
  count.mockReset().mockResolvedValue(0);
  create.mockReset().mockResolvedValue({ publicCode: "new-code" });
  findFirst.mockReset().mockResolvedValue({ publicCode: "existing-code", hiddenAt: null });
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  txPostCreate.mockReset().mockResolvedValue({ id: 10n, publicCode: "new-code" });
  txPhotoCreateMany.mockReset().mockResolvedValue({ count: 0 });
  transaction.mockReset().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  for (const fn of Object.values(pendingPhoto)) fn.mockReset();
  pendingPhoto.compensateFinalObjects.mockResolvedValue(undefined);
  pendingPhoto.cleanupTmpObjects.mockResolvedValue(undefined);
});

describe("createPost", () => {
  it("시간당 상한(첫 윈도)에 도달하면 rate limit 에러 — create는 호출되지 않는다", async () => {
    count.mockResolvedValueOnce(RATE_LIMITS.post[0].max);
    const db = makeDb();
    await expect(createPost(OWNER, createInput, db as never)).rejects.toThrow(/너무 잦습니다/);
    expect(create).not.toHaveBeenCalled();
  });

  it("일일 상한(둘째 윈도)에 도달하면 rate limit 에러 — create는 호출되지 않는다", async () => {
    count
      .mockResolvedValueOnce(0) // 1시간 윈도는 통과
      .mockResolvedValueOnce(RATE_LIMITS.post[1].max); // 1일 윈도에서 상한 도달
    const db = makeDb();
    await expect(createPost(OWNER, createInput, db as never)).rejects.toThrow(/너무 잦습니다/);
    expect(create).not.toHaveBeenCalled();
  });

  it("두 윈도 모두 통과하면 생성하고 postPublicCode를 반환한다", async () => {
    const db = makeDb();
    const result = await createPost(OWNER, createInput, db as never);
    expect(result).toEqual({ postPublicCode: "new-code" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("행에는 accountId만 기록한다 — 이름 스냅샷 없음(작성자 표시는 account 라이브 조회)", async () => {
    const db = makeDb();
    await createPost(OWNER, createInput, db as never);
    const data = create.mock.calls[0][0].data;
    expect(data.accountId).toBe(OWNER);
    expect(data).not.toHaveProperty("authorName");
    expect(data).not.toHaveProperty("authorCode");
    expect(data.topic).toBe(createInput.topic);
    expect(data.title).toBe(createInput.title);
    expect(data.body).toBe(createInput.body);
  });

  it("public_code 충돌(P2002)이면 재생성 재시도한다", async () => {
    create
      .mockRejectedValueOnce(p2002(["public_code"]))
      .mockResolvedValueOnce({ publicCode: "retried-code" });
    const db = makeDb();
    const result = await createPost(OWNER, createInput, db as never);
    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ postPublicCode: "retried-code" });

    const first = create.mock.calls[0][0].data.publicCode;
    const second = create.mock.calls[1][0].data.publicCode;
    expect(first).not.toBe(second);
  });

  it("충돌이 재시도 상한(3회)까지 이어지면 에러를 전파한다", async () => {
    create.mockRejectedValue(p2002(["public_code"]));
    const db = makeDb();
    await expect(createPost(OWNER, createInput, db as never)).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("public_code 외 컬럼의 unique 위반은 재시도 없이 전파한다", async () => {
    create.mockRejectedValue(p2002(["title"]));
    const db = makeDb();
    await expect(createPost(OWNER, createInput, db as never)).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

// §11이 계약 자체를 바꿨다 — requireOwnedPost·최상위 updateMany 기반 기존 케이스를 대체한다.
function makeUpdateDb(
  row: {
    public_code?: string;
    topic?: string;
    title?: string;
    body?: string;
    hidden_at?: Date | null;
  } | null,
  commentCount = 0,
) {
  const utx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue(
        row === null
          ? []
          : [{ public_code: "code-1", topic: "talk", title: "t", body: "b", hidden_at: null, ...row }],
      ),
    postComment: { count: vi.fn().mockResolvedValue(commentCount) },
    post: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    postPhoto: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return {
    tx: utx,
    post: { findFirst: vi.fn().mockResolvedValue({ publicCode: "code-1", hiddenAt: null }) },
    $transaction: vi.fn(async (fn: (t: typeof utx) => Promise<unknown>) => fn(utx)),
  };
}

const editInput = { id: 1, topic: "talk" as const, title: "t2", body: "b2" };

describe("updatePost — §11 잠금 계약", () => {
  it("미존재·타인·삭제(FOR UPDATE 0행)는 같은 not-found 에러", async () => {
    const db = makeUpdateDb(null);
    await expect(updatePost("acc-1", editInput, db as never)).rejects.toThrow(
      "글을 찾을 수 없습니다",
    );
  });

  it("운영 숨김은 moderation 에러 — 댓글이 있어도 moderation 우선", async () => {
    const db = makeUpdateDb({ hidden_at: new Date() }, 3);
    await expect(updatePost("acc-1", editInput, db as never)).rejects.toThrow(
      "운영 검토 중인 글은 수정할 수 없습니다",
    );
  });

  it("미삭제 댓글 1개↑면 has_comments 에러(숨김 댓글도 카운트 — deletedAt null 조건만)", async () => {
    const db = makeUpdateDb({}, 1);
    await expect(updatePost("acc-1", editInput, db as never)).rejects.toThrow(
      "댓글이 작성된 글은 수정할 수 없습니다",
    );
    expect(db.tx.postComment.count.mock.calls[0][0].where).toEqual({ postId: 1n, deletedAt: null });
  });

  it("변경 시 edited_at·updated_at을 같은 now로 갱신(P2-1)", async () => {
    const db = makeUpdateDb({});
    await updatePost("acc-1", { ...editInput, topic: "info" }, db as never);
    const data = db.tx.post.update.mock.calls[0][0].data;
    expect(data.editedAt).toBeInstanceOf(Date);
    expect(data.updatedAt).toBe(data.editedAt); // 같은 Date 인스턴스
  });

  it("무변경 저장은 성공 no-op — update 미호출·edited_at 미갱신(P2-2)", async () => {
    const db = makeUpdateDb({ topic: "talk", title: "t", body: "b" });
    const result = await updatePost(
      "acc-1",
      { id: 1, topic: "talk", title: "t", body: "b" },
      db as never,
    );
    expect(result).toEqual({ postPublicCode: "code-1" });
    expect(db.tx.post.update).not.toHaveBeenCalled();
  });
});

describe("deletePost", () => {
  it("존재하지 않거나 타인 글이거나 이미 삭제된 글은 동일 에러 — tx는 시작되지 않는다", async () => {
    findFirst.mockResolvedValue(null);
    const db = makeDb();
    await expect(deletePost(OWNER, 1, db as never)).rejects.toThrow(/글을 찾을 수 없습니다/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("숨김 글도 삭제를 허용한다(§ 삭제만)", async () => {
    findFirst.mockResolvedValue({ publicCode: "hidden-code", hiddenAt: new Date() });
    const db = makeUpdateDb({});
    db.post.findFirst.mockResolvedValue({ publicCode: "hidden-code", hiddenAt: new Date() });
    const result = await deletePost(OWNER, 1, db as never);
    expect(db.tx.post.updateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ postPublicCode: "hidden-code" });
  });

  it("조건부 UPDATE where는 hiddenAt 조건 없이 accountId·deletedAt:null만 포함한다", async () => {
    const db = makeUpdateDb({});
    await deletePost(OWNER, 1, db as never);
    const call = db.tx.post.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 1n, accountId: OWNER, deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it("TOCTOU — 사전 조회 통과 후에도 updateMany가 0행이면 에러", async () => {
    const db = makeUpdateDb({});
    db.tx.post.updateMany.mockResolvedValue({ count: 0 });
    await expect(deletePost(OWNER, 1, db as never)).rejects.toThrow(/글을 찾을 수 없습니다/);
    expect(db.tx.post.updateMany).toHaveBeenCalledTimes(1);
  });

  it("성공 시 postPublicCode를 반환한다", async () => {
    const db = makeUpdateDb({});
    db.post.findFirst.mockResolvedValue({ publicCode: "del-code", hiddenAt: null });
    const result = await deletePost(OWNER, 1, db as never);
    expect(result).toEqual({ postPublicCode: "del-code" });
  });
});

describe("deletePost — 사진 동반 soft delete(P1-5)", () => {
  it("같은 tx에서 활성 사진을 soft delete하고 updated_at도 갱신", async () => {
    const db = makeUpdateDb({});
    await deletePost("acc-1", 1, db as never);
    expect(db.$transaction).toHaveBeenCalled();
    const photoCall = db.tx.postPhoto.updateMany.mock.calls[0][0];
    expect(photoCall.where).toEqual({ postId: 1n, deletedAt: null });
    expect(photoCall.data.deletedAt).toBeInstanceOf(Date);
    expect(photoCall.data.updatedAt).toBe(photoCall.data.deletedAt);
  });
});

describe("createPost — 사진(§결정 8·P1-7)", () => {
  const photoInput = {
    topic: "talk" as const,
    title: "t",
    body: "b",
    photos: [{ pendingPhotoId: 1 }, { pendingPhotoId: 2 }],
  };

  beforeEach(() => {
    pendingPhoto.consumePendingPhotos.mockResolvedValue([
      { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      { id: 2n, r2Key: "posts/tmp/b.jpg", contentType: "image/jpeg", sizeBytes: 14 },
    ]);
    pendingPhoto.finalizePendingPhotos.mockResolvedValue(["posts/a.jpg", "posts/b.jpg"]);
  });

  it("사진 없으면 기존 경로(plain create) — 소비·tx 미호출", async () => {
    const db = makeDb();
    await createPost(OWNER, createInput, db as never);
    expect(pendingPhoto.consumePendingPhotos).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("소비 → 검증·복사 → tx에서 post+photo INSERT(순서·썸네일=첫 장) → 임시 삭제", async () => {
    const db = makeDb();
    await createPost(OWNER, photoInput, db as never);

    expect(pendingPhoto.consumePendingPhotos).toHaveBeenCalledWith(OWNER, [1, 2], db);
    const created = txPhotoCreateMany.mock.calls[0][0].data;
    expect(created).toEqual([
      expect.objectContaining({ r2Key: "posts/a.jpg", displayOrder: 0, isThumbnail: true }),
      expect.objectContaining({ r2Key: "posts/b.jpg", displayOrder: 1, isThumbnail: false }),
    ]);
    expect(pendingPhoto.cleanupTmpObjects).toHaveBeenCalledWith([
      "posts/tmp/a.jpg",
      "posts/tmp/b.jpg",
    ]);
    expect(pendingPhoto.compensateFinalObjects).not.toHaveBeenCalled();
  });

  it("최종 tx 실패(코드 재시도 소진 포함) 시 최종 객체 전체 보상 삭제 후 rethrow(P1-7)", async () => {
    const db = makeDb();
    txPostCreate.mockRejectedValue(new Error("insert fail"));
    await expect(createPost(OWNER, photoInput, db as never)).rejects.toThrow("insert fail");
    expect(pendingPhoto.compensateFinalObjects).toHaveBeenCalledWith(["posts/a.jpg", "posts/b.jpg"]);
    expect(pendingPhoto.cleanupTmpObjects).not.toHaveBeenCalled();
  });

  it("커밋 후 임시 정리가 실패해도 등록된 최종 객체는 보상 삭제하지 않는다(P2-1)", async () => {
    const db = makeDb();
    pendingPhoto.cleanupTmpObjects.mockRejectedValue(new Error("cleanup boom"));
    await expect(createPost(OWNER, photoInput, db as never)).rejects.toThrow("cleanup boom");
    expect(pendingPhoto.compensateFinalObjects).not.toHaveBeenCalled(); // 최종 객체는 보존
  });
});
