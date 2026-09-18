import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import {
  createPostReport, createCommentReport,
  hidePost, unhidePost, hideComment, unhideComment, dismissReport,
} from "@/modules/posts/lib/mutations";
import { postReportSnapshotV2, commentReportSnapshotV1 } from "@/modules/posts/lib/schema";

const REPORTER = "22222222-2222-2222-2222-222222222222";
const OWNER = "11111111-1111-1111-1111-111111111111";
const ADMIN = { id: "33333333-3333-3333-3333-333333333333" };

// rate limit 합산 counter — post_report·post_comment_report 양쪽 count.
const postReportCount = vi.fn();
const postCommentReportCount = vi.fn();

// createPostReport/createCommentReport — tx + FOR UPDATE.
const transaction = vi.fn();
const queryRaw = vi.fn();
const txPostReportCreate = vi.fn();
const txCommentReportCreate = vi.fn();
// postComment.findFirst — createCommentReport의 ref 조회 + hideComment/unhideComment의 존재 확인 공용.
const commentFindFirst = vi.fn();

// hide/unhide/dismiss — 원자적 조건부 updateMany.
const postFindFirst = vi.fn();
const postUpdateMany = vi.fn();
// 신고 스냅샷 v2 — 신고 시점 사진 동결(P1-5).
const txPhotoFindMany = vi.fn();
const postReportUpdateMany = vi.fn();
const commentUpdateMany = vi.fn();
const postCommentReportUpdateMany = vi.fn();

// FOR UPDATE 잠금 자체는 실제 Postgres 없이는 재현할 수 없다. db.$transaction을 콜백을
// 실제로 실행하는 fake tx로 대체하고, tx.$queryRaw(잠금 쿼리)가 반환하는 행을 케이스별로
// 주입해 "잠금 재검증 결과가 비어있으면 거부"하는 상위 계약을 검증한다(mutations.comment.test.ts 선례).
function fakeTx() {
  return {
    $queryRaw: queryRaw,
    postComment: { findFirst: commentFindFirst, updateMany: commentUpdateMany },
    postReport: { create: txPostReportCreate, updateMany: postReportUpdateMany },
    postCommentReport: { create: txCommentReportCreate, updateMany: postCommentReportUpdateMany },
    post: { findFirst: postFindFirst, updateMany: postUpdateMany },
    postPhoto: { findMany: txPhotoFindMany },
  };
}

function makeDb() {
  return {
    postReport: { count: postReportCount, updateMany: postReportUpdateMany },
    postCommentReport: { count: postCommentReportCount, updateMany: postCommentReportUpdateMany },
    postComment: { findFirst: commentFindFirst, updateMany: commentUpdateMany },
    post: { findFirst: postFindFirst, updateMany: postUpdateMany },
    $transaction: transaction,
  };
}

// Prisma 7 + adapter-pg 실측 P2002 구조(meta.target 없음) — tests/modules/posts/lib/mutations.post.test.ts 선례.
function p2002(fields: string[]) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "PostReport",
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
  postReportCount.mockReset().mockResolvedValue(0);
  postCommentReportCount.mockReset().mockResolvedValue(0);
  queryRaw.mockReset();
  txPostReportCreate.mockReset().mockResolvedValue({});
  txCommentReportCreate.mockReset().mockResolvedValue({});
  commentFindFirst.mockReset().mockResolvedValue({ postId: 10n });
  postFindFirst.mockReset().mockResolvedValue({ publicCode: "existing-code" });
  postUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  postReportUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  commentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  postCommentReportUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txPhotoFindMany.mockReset().mockResolvedValue([]);
  transaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx()));
});

describe("createPostReport", () => {
  const input = { targetId: 100, reason: "spam" };

  it("합산 rate limit(글 3+댓글 2 신고 후 6번째) 도달 시 거부 — 트랜잭션은 시작되지 않는다", async () => {
    postReportCount.mockResolvedValueOnce(3);
    postCommentReportCount.mockResolvedValueOnce(2);
    const db = makeDb();
    await expect(createPostReport(REPORTER, input, db as never)).rejects.toThrow(/너무 잦습니다/);
    expect(transaction).not.toHaveBeenCalled();
    // 두 테이블 COUNT를 모두 같은 스코프(reporterAccountId)로 합산했음을 근거로 확인.
    expect(postReportCount).toHaveBeenCalledWith({
      where: { reporterAccountId: REPORTER, createdAt: { gte: expect.any(Date) } },
    });
    expect(postCommentReportCount).toHaveBeenCalledWith({
      where: { reporterAccountId: REPORTER, createdAt: { gte: expect.any(Date) } },
    });
  });

  it("잠금 재검증 — 숨김·삭제된 글은 빈 배열로 거부되어 생성되지 않는다", async () => {
    queryRaw.mockResolvedValueOnce([]);
    const db = makeDb();
    await expect(createPostReport(REPORTER, input, db as never)).rejects.toThrow(/신고할 수 없습니다/);
    expect(txPostReportCreate).not.toHaveBeenCalled();
  });

  it("본인 글은 신고할 수 없다", async () => {
    queryRaw.mockResolvedValueOnce([{
      account_id: REPORTER, title: "제목", body: "본문",
      author_name: "작성자", author_code: "AUTH0001",
      updated_at: new Date("2026-07-20T00:00:00Z"),
    }]);
    const db = makeDb();
    await expect(createPostReport(REPORTER, input, db as never)).rejects.toThrow(/본인 글은 신고할 수 없습니다/);
    expect(txPostReportCreate).not.toHaveBeenCalled();
  });

  // Plan 3부터 글 신고는 항상 v2로 동결한다(P1-5). v1은 기존 신고 읽기 호환으로만 남는다.
  const lockedPostRow = () =>
    queryRaw.mockResolvedValueOnce([
      {
        account_id: OWNER,
        title: "제목",
        body: "본문",
        author_name: "작성자",
        author_code: "AUTH0001",
        updated_at: new Date("2026-07-20T00:00:00Z"),
      },
    ]);

  it("정상 신고 — snapshot을 version 2로 동결해 생성한다(postReportSnapshotV2 통과)", async () => {
    lockedPostRow();
    const db = makeDb();
    await createPostReport(REPORTER, input, db as never);

    expect(txPostReportCreate).toHaveBeenCalledTimes(1);
    const data = txPostReportCreate.mock.calls[0][0].data;
    expect(data.postId).toBe(100n);
    expect(data.reporterAccountId).toBe(REPORTER);
    expect(data.reason).toBe("spam");
    expect(() => postReportSnapshotV2.parse(data.snapshot)).not.toThrow();
    expect(data.snapshot).toEqual({
      version: 2, title: "제목", body: "본문",
      authorName: "작성자", authorCode: "AUTH0001",
      updatedAt: "2026-07-20T00:00:00.000Z",
      photos: [],
    });
  });

  it("글 신고 스냅샷은 v2 — 사진 키·표시 순서 동결(post 잠금 하)", async () => {
    lockedPostRow();
    txPhotoFindMany.mockResolvedValue([
      { r2Key: "posts/a.jpg", displayOrder: 0 },
      { r2Key: "posts/b.jpg", displayOrder: 1 },
    ]);
    const db = makeDb();
    await createPostReport(REPORTER, input, db as never);

    const snapshot = txPostReportCreate.mock.calls[0][0].data.snapshot;
    expect(snapshot.version).toBe(2);
    expect(snapshot.photos).toEqual([
      { r2Key: "posts/a.jpg", displayOrder: 0 },
      { r2Key: "posts/b.jpg", displayOrder: 1 },
    ]);
    expect(txPhotoFindMany.mock.calls[0][0].where).toEqual({ postId: 100n, deletedAt: null });
  });

  it("사진 없는 글도 항상 v2·photos:[] (P1-5 — 신규 신고는 v1로 저장하지 않는다)", async () => {
    lockedPostRow();
    txPhotoFindMany.mockResolvedValue([]);
    const db = makeDb();
    await createPostReport(REPORTER, input, db as never);
    expect(txPostReportCreate.mock.calls[0][0].data.snapshot).toMatchObject({
      version: 2,
      photos: [],
    });
  });

  it("중복 신고(P2002 post_id)는 '이미 신고한 글입니다'로 변환한다", async () => {
    transaction.mockRejectedValueOnce(p2002(["post_id"]));
    const db = makeDb();
    await expect(createPostReport(REPORTER, input, db as never)).rejects.toThrow(/이미 신고한 글입니다/);
  });

  it("post_id 외 컬럼의 P2002는 원본 에러를 그대로 전파한다", async () => {
    transaction.mockRejectedValueOnce(p2002(["title"]));
    const db = makeDb();
    await expect(createPostReport(REPORTER, input, db as never)).rejects.not.toThrow(/이미 신고한 글입니다/);
  });
});

describe("createCommentReport", () => {
  const input = { targetId: 200, reason: "abuse" };

  it("합산 rate limit(글 3+댓글 2 신고 후 6번째) 도달 시 거부 — 트랜잭션은 시작되지 않는다", async () => {
    postReportCount.mockResolvedValueOnce(3);
    postCommentReportCount.mockResolvedValueOnce(2);
    const db = makeDb();
    await expect(createCommentReport(REPORTER, input, db as never)).rejects.toThrow(/너무 잦습니다/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("댓글이 존재하지 않으면 잠금 없이 즉시 거부한다", async () => {
    commentFindFirst.mockResolvedValueOnce(null);
    const db = makeDb();
    await expect(createCommentReport(REPORTER, input, db as never)).rejects.toThrow(/신고할 수 없습니다/);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(txCommentReportCreate).not.toHaveBeenCalled();
  });

  it("상위 글이 숨김·삭제면 거부한다 — post 선잠금 재검증 실패 시 댓글 잠금은 시도되지 않는다", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 10n });
    queryRaw.mockResolvedValueOnce([]); // post 잠금 재검증 실패(숨김/삭제) — 댓글이 visible이어도 거부
    const db = makeDb();
    await expect(createCommentReport(REPORTER, input, db as never)).rejects.toThrow(/신고할 수 없습니다/);
    expect(queryRaw).toHaveBeenCalledTimes(1); // 댓글 잠금 쿼리(2번째)는 실행되지 않는다
    expect(txCommentReportCreate).not.toHaveBeenCalled();
  });

  it("본인 댓글은 신고할 수 없다", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 10n });
    queryRaw
      .mockResolvedValueOnce([{ id: 10n }]) // post 잠금 통과
      .mockResolvedValueOnce([{
        account_id: REPORTER, body: "댓글", author_name: "작성자",
        author_code: "AUTH0001", updated_at: new Date("2026-07-20T00:00:00Z"),
      }]);
    const db = makeDb();
    await expect(createCommentReport(REPORTER, input, db as never)).rejects.toThrow(/본인 댓글은 신고할 수 없습니다/);
    expect(txCommentReportCreate).not.toHaveBeenCalled();
  });

  it("정상 신고 — snapshot v1 동결 + 잠금 순서(post 먼저, post_comment 다음)를 지킨다", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 10n });
    queryRaw
      .mockResolvedValueOnce([{ id: 10n }])
      .mockResolvedValueOnce([{
        account_id: OWNER, body: "댓글", author_name: "작성자",
        author_code: "AUTH0001", updated_at: new Date("2026-07-20T00:00:00Z"),
      }]);
    const db = makeDb();
    await createCommentReport(REPORTER, input, db as never);

    expect(txCommentReportCreate).toHaveBeenCalledTimes(1);
    const data = txCommentReportCreate.mock.calls[0][0].data;
    expect(data.commentId).toBe(200n);
    expect(data.reporterAccountId).toBe(REPORTER);
    expect(() => commentReportSnapshotV1.parse(data.snapshot)).not.toThrow();
    expect(data.snapshot).toEqual({
      version: 1, body: "댓글", authorName: "작성자", authorCode: "AUTH0001",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
    // 잠금 순서 불변식: 첫 잠금 쿼리는 post만, 두 번째는 post_comment를 포함한다.
    expect(queryRaw.mock.calls[0][0].join("")).not.toMatch(/post_comment/);
    expect(queryRaw.mock.calls[1][0].join("")).toMatch(/post_comment/);
  });

  it("중복 신고(P2002 comment_id)는 '이미 신고한 댓글입니다'로 변환한다", async () => {
    transaction.mockRejectedValueOnce(p2002(["comment_id"]));
    const db = makeDb();
    await expect(createCommentReport(REPORTER, input, db as never)).rejects.toThrow(/이미 신고한 댓글입니다/);
  });
});

describe("hidePost", () => {
  const input = { targetId: 1, reason: "스팸 도배" };

  it("존재하지 않는 글은 에러 — updateMany는 호출되지 않는다", async () => {
    postFindFirst.mockResolvedValueOnce(null);
    const db = makeDb();
    await expect(hidePost(ADMIN, input, db as never)).rejects.toThrow(/글을 찾을 수 없습니다/);
    expect(postUpdateMany).not.toHaveBeenCalled();
  });

  it("이미 숨김·삭제 상태면 조건부 UPDATE가 0행 — '숨길 수 없는 글입니다', 신고 일괄처리는 시도되지 않는다(원자적 short-circuit)", async () => {
    postUpdateMany.mockResolvedValueOnce({ count: 0 });
    const db = makeDb();
    await expect(hidePost(ADMIN, input, db as never)).rejects.toThrow(/숨길 수 없는 글입니다/);
    expect(postReportUpdateMany).not.toHaveBeenCalled();
  });

  it("정상 숨김 — post 스탬프와 미처리 신고 일괄 actioned 처리가 같은 tx 안에서 함께 일어난다", async () => {
    postFindFirst.mockResolvedValueOnce({ publicCode: "post-code-1" });
    const db = makeDb();
    const result = await hidePost(ADMIN, input, db as never);

    expect(result).toEqual({ postPublicCode: "post-code-1" });
    expect(postUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 1n, deletedAt: null, hiddenAt: null },
      data: {
        hiddenAt: expect.any(Date), hiddenReason: "스팸 도배",
        hiddenBy: ADMIN.id, updatedAt: expect.any(Date),
      },
    });
    expect(postReportUpdateMany).toHaveBeenCalledTimes(1);
    expect(postReportUpdateMany.mock.calls[0][0]).toEqual({
      where: { postId: 1n, resolvedAt: null },
      data: {
        resolution: "actioned", resolvedBy: ADMIN.id,
        resolvedAt: expect.any(Date), updatedAt: expect.any(Date),
      },
    });
  });
});

describe("unhidePost", () => {
  it("존재하지 않는 글은 에러 — updateMany는 호출되지 않는다", async () => {
    postFindFirst.mockResolvedValueOnce(null);
    const db = makeDb();
    await expect(unhidePost(ADMIN, 1, db as never)).rejects.toThrow(/글을 찾을 수 없습니다/);
    expect(postUpdateMany).not.toHaveBeenCalled();
  });

  it("숨김 상태가 아니면 조건부 UPDATE가 0행 — '해제할 수 없는 글입니다'", async () => {
    postUpdateMany.mockResolvedValueOnce({ count: 0 });
    const db = makeDb();
    await expect(unhidePost(ADMIN, 1, db as never)).rejects.toThrow(/해제할 수 없는 글입니다/);
  });

  it("정상 해제 — hidden_* 필드를 모두 null로 되돌리고 postPublicCode를 반환한다", async () => {
    postFindFirst.mockResolvedValueOnce({ publicCode: "post-code-2" });
    const db = makeDb();
    const result = await unhidePost(ADMIN, 1, db as never);

    expect(result).toEqual({ postPublicCode: "post-code-2" });
    expect(postUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 1n, deletedAt: null, hiddenAt: { not: null } },
      data: { hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: expect.any(Date) },
    });
  });
});

describe("hideComment", () => {
  const input = { targetId: 5, reason: "욕설" };

  it("존재하지 않는 댓글은 에러 — updateMany는 호출되지 않는다", async () => {
    commentFindFirst.mockResolvedValueOnce(null);
    const db = makeDb();
    await expect(hideComment(ADMIN, input, db as never)).rejects.toThrow(/댓글을 찾을 수 없습니다/);
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("이미 숨김·삭제 상태면 조건부 UPDATE가 0행 — '숨길 수 없는 댓글입니다', 신고 일괄처리는 시도되지 않는다", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 10n });
    commentUpdateMany.mockResolvedValueOnce({ count: 0 });
    const db = makeDb();
    await expect(hideComment(ADMIN, input, db as never)).rejects.toThrow(/숨길 수 없는 댓글입니다/);
    expect(postCommentReportUpdateMany).not.toHaveBeenCalled();
  });

  it("정상 숨김 — post_comment 스탬프와 미처리 신고 일괄 actioned 처리가 같은 tx 안에서 함께 일어나고, postCodeOf로 postPublicCode를 반환한다", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 42n });
    postFindFirst.mockResolvedValueOnce({ publicCode: "post-code-42" });
    const db = makeDb();
    const result = await hideComment(ADMIN, input, db as never);

    expect(result).toEqual({ postPublicCode: "post-code-42" });
    expect(commentUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 5n, deletedAt: null, hiddenAt: null },
      data: {
        hiddenAt: expect.any(Date), hiddenReason: "욕설",
        hiddenBy: ADMIN.id, updatedAt: expect.any(Date),
      },
    });
    expect(postCommentReportUpdateMany).toHaveBeenCalledTimes(1);
    expect(postCommentReportUpdateMany.mock.calls[0][0]).toEqual({
      where: { commentId: 5n, resolvedAt: null },
      data: {
        resolution: "actioned", resolvedBy: ADMIN.id,
        resolvedAt: expect.any(Date), updatedAt: expect.any(Date),
      },
    });
    expect(postFindFirst).toHaveBeenCalledWith({ where: { id: 42n }, select: { publicCode: true } });
  });

  it("소속 글 부재 — postCodeOf가 데이터 무결성 오류를 던진다(FK 없는 스키마 방어)", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 99n });
    postFindFirst.mockResolvedValueOnce(null);
    const db = makeDb();
    await expect(hideComment(ADMIN, input, db as never)).rejects.toThrow(
      /데이터 무결성 오류: 댓글의 소속 글\(99\)이 없습니다/,
    );
  });
});

describe("unhideComment", () => {
  it("존재하지 않는 댓글은 에러", async () => {
    commentFindFirst.mockResolvedValueOnce(null);
    const db = makeDb();
    await expect(unhideComment(ADMIN, 5, db as never)).rejects.toThrow(/댓글을 찾을 수 없습니다/);
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("상위 글이 삭제됐으면 해제 거부 — 같은 tx에서 잠금 재검증이 0행이라 updateMany는 호출되지 않는다(부분성공 차단)", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 42n });
    queryRaw.mockResolvedValueOnce([]); // 상위 글 잠금 재검증: 삭제된 글 → 0행
    const db = makeDb();
    await expect(unhideComment(ADMIN, 5, db as never)).rejects.toThrow(
      /상위 글이 삭제되어 댓글을 해제할 수 없습니다/,
    );
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("숨김 상태가 아니면 조건부 UPDATE가 0행 — '해제할 수 없는 댓글입니다'", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 42n });
    queryRaw.mockResolvedValueOnce([{ public_code: "post-code-42" }]);
    commentUpdateMany.mockResolvedValueOnce({ count: 0 });
    const db = makeDb();
    await expect(unhideComment(ADMIN, 5, db as never)).rejects.toThrow(/해제할 수 없는 댓글입니다/);
  });

  it("정상 해제 — 상위 글 잠금 조회의 public_code를 반환한다", async () => {
    commentFindFirst.mockResolvedValueOnce({ postId: 42n });
    queryRaw.mockResolvedValueOnce([{ public_code: "post-code-42" }]);
    const db = makeDb();
    const result = await unhideComment(ADMIN, 5, db as never);

    expect(result).toEqual({ postPublicCode: "post-code-42" });
    expect(commentUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 5n, deletedAt: null, hiddenAt: { not: null } },
      data: { hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: expect.any(Date) },
    });
  });
});

describe("dismissReport", () => {
  // 두 신고 테이블은 ID가 독립적이라 같은 숫자값(1)이 동시에 존재할 수 있다 —
  // target 판별자가 실제로 지정한 테이블만 건드리는지가 핵심 불변식이다.
  it("target='post' — postReport만 갱신하고 postCommentReport는 건드리지 않는다(동일 ID 공존 시나리오)", async () => {
    const db = makeDb();
    await dismissReport(ADMIN, { target: "post", reportId: 1 }, db as never);

    expect(postReportUpdateMany).toHaveBeenCalledTimes(1);
    expect(postReportUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 1n, resolvedAt: null },
      data: {
        resolution: "dismissed", resolvedBy: ADMIN.id, resolutionNote: null,
        resolvedAt: expect.any(Date), updatedAt: expect.any(Date),
      },
    });
    expect(postCommentReportUpdateMany).not.toHaveBeenCalled();
  });

  it("target='comment' — postCommentReport만 갱신하고 postReport는 건드리지 않는다(동일 ID 공존 시나리오)", async () => {
    const db = makeDb();
    await dismissReport(ADMIN, { target: "comment", reportId: 1, note: "확인함" }, db as never);

    expect(postCommentReportUpdateMany).toHaveBeenCalledTimes(1);
    expect(postCommentReportUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 1n, resolvedAt: null },
      data: {
        resolution: "dismissed", resolvedBy: ADMIN.id, resolutionNote: "확인함",
        resolvedAt: expect.any(Date), updatedAt: expect.any(Date),
      },
    });
    expect(postReportUpdateMany).not.toHaveBeenCalled();
  });

  it("이미 처리된 신고면 조건부 UPDATE가 0행 — '이미 처리된 신고입니다'", async () => {
    postReportUpdateMany.mockResolvedValueOnce({ count: 0 });
    const db = makeDb();
    await expect(
      dismissReport(ADMIN, { target: "post", reportId: 1 }, db as never),
    ).rejects.toThrow(/이미 처리된 신고입니다/);
  });

  it("resolution은 항상 'dismissed'다 — actioned는 숨김 tx에서만 세팅된다(단독 resolve 의미론)", async () => {
    const db = makeDb();
    await dismissReport(ADMIN, { target: "post", reportId: 2 }, db as never);
    expect(postReportUpdateMany.mock.calls[0][0].data.resolution).toBe("dismissed");
  });

  it("dismiss는 대상 콘텐츠(post·post_comment)를 변경하지 않는다 — content 테이블 접근 자체가 없다", async () => {
    // post·postComment 키를 아예 제공하지 않는 fake db — 구현이 이를 건드리려 하면 즉시 TypeError로 드러난다.
    const contentFreeDb = {
      postReport: { updateMany: postReportUpdateMany },
      postCommentReport: { updateMany: postCommentReportUpdateMany },
    };
    await expect(
      dismissReport(ADMIN, { target: "post", reportId: 3 }, contentFreeDb as never),
    ).resolves.toBeUndefined();
  });
});
