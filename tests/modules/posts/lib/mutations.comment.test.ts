import { beforeEach, describe, expect, it, vi } from "vitest";

import { createComment, updateComment, deleteComment } from "@/modules/posts/lib/mutations";
import { RATE_LIMITS } from "@/modules/posts/lib/schema";

const OWNER = "11111111-1111-1111-1111-111111111111";
const POST_ID = 10;

const count = vi.fn();
const queryRaw = vi.fn();
const txCreate = vi.fn();
const transaction = vi.fn();
const commentFindFirst = vi.fn();
const commentUpdateMany = vi.fn();
const postFindFirst = vi.fn();

// FOR UPDATE 잠금 자체는 실제 Postgres 없이는 재현할 수 없다. 대신 db.$transaction을
// 콜백을 실제로 실행하는 fake tx로 대체하고, tx.$queryRaw(잠금 쿼리)가 반환하는 행을
// 케이스별로 주입해 "잠금 재검증 결과가 비어있으면 거부"하는 상위 계약을 검증한다.
function makeDb() {
  return {
    postComment: {
      count,
      findFirst: commentFindFirst,
      updateMany: commentUpdateMany,
    },
    post: { findFirst: postFindFirst },
    $transaction: transaction,
  };
}


beforeEach(() => {
  count.mockReset().mockResolvedValue(0);
  queryRaw.mockReset();
  txCreate.mockReset().mockResolvedValue({});
  transaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ $queryRaw: queryRaw, postComment: { create: txCreate } }),
  );
  commentFindFirst.mockReset().mockResolvedValue({ postId: 1n, hiddenAt: null, body: "원래 댓글" });
  commentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  postFindFirst.mockReset().mockResolvedValue({ publicCode: "existing-code" });
});

describe("createComment", () => {
  const input = { postId: POST_ID, body: "댓글 본문" };

  it("분당 상한(첫 윈도)에 도달하면 rate limit 에러 — 트랜잭션은 시작되지 않는다", async () => {
    count.mockResolvedValueOnce(RATE_LIMITS.comment[0].max);
    const db = makeDb();
    await expect(createComment(OWNER, input, db as never)).rejects.toThrow(/너무 잦습니다/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("시간당 상한(둘째 윈도)에 도달하면 rate limit 에러 — 트랜잭션은 시작되지 않는다", async () => {
    count.mockResolvedValueOnce(0).mockResolvedValueOnce(RATE_LIMITS.comment[1].max);
    const db = makeDb();
    await expect(createComment(OWNER, input, db as never)).rejects.toThrow(/너무 잦습니다/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("① 정상 최상위 댓글 — 글 잠금만 재검증하고 생성 후 postPublicCode를 반환한다", async () => {
    queryRaw.mockResolvedValueOnce([{ public_code: "POST0001" }]);
    const db = makeDb();
    const result = await createComment(OWNER, input, db as never);

    expect(result).toEqual({ postPublicCode: "POST0001" });
    expect(queryRaw).toHaveBeenCalledTimes(1); // parentId 없음 — 부모 잠금 쿼리는 실행되지 않는다
    expect(txCreate).toHaveBeenCalledTimes(1);
    // 이름 스냅샷 없이 accountId만 — 작성자 표시는 account 라이브 조회(toEqual이 부재까지 잠근다).
    expect(txCreate.mock.calls[0][0].data).toEqual({
      postId: BigInt(POST_ID),
      accountId: OWNER,
      parentId: null,
      body: input.body,
    });
  });

  it("② 정상 1단 답글 — 부모(최상위) 잠금까지 통과하면 parentId를 채워 생성한다(잠금 순서 post→post_comment)", async () => {
    queryRaw
      .mockResolvedValueOnce([{ public_code: "POST0001" }]) // ① post 잠금
      .mockResolvedValueOnce([{ parent_id: null }]); // ② 부모 잠금 — 최상위(parent_id null)
    const db = makeDb();
    const result = await createComment(OWNER, { ...input, parentId: 5 }, db as never);

    expect(result).toEqual({ postPublicCode: "POST0001" });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    // 잠금 순서 불변식: 첫 잠금 쿼리는 post만 대상으로 하고, 두 번째 쿼리에서 post_comment가 등장한다.
    expect(queryRaw.mock.calls[0][0].join("")).not.toMatch(/post_comment/);
    expect(queryRaw.mock.calls[1][0].join("")).toMatch(/post_comment/);
    expect(txCreate.mock.calls[0][0].data.parentId).toBe(5n);
  });

  it("③ 부재 부모 — parentId가 존재하지 않으면 답글을 거부하고 생성하지 않는다", async () => {
    queryRaw.mockResolvedValueOnce([{ public_code: "POST0001" }]).mockResolvedValueOnce([]);
    const db = makeDb();
    await expect(createComment(OWNER, { ...input, parentId: 999 }, db as never)).rejects.toThrow(
      /답글을 달 수 없는 댓글입니다/,
    );
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("④ 타 글 부모 — 부모 잠금 쿼리가 postId로 스코프되어 다른 글 소속 댓글은 조회되지 않는다", async () => {
    queryRaw.mockResolvedValueOnce([{ public_code: "POST0001" }]).mockResolvedValueOnce([]); // 실제 DB라면 post_id 불일치로 빈 결과
    const db = makeDb();
    await expect(createComment(OWNER, { ...input, parentId: 7 }, db as never)).rejects.toThrow(
      /답글을 달 수 없는 댓글입니다/,
    );
    // 부모 잠금 쿼리 파라미터가 (parentId, postId) 순으로 전달됨을 확인 — 이 postId 스코프가
    // 실제 Postgres에서 "타 글 소속 부모"를 걸러내는 근거(WHERE post_id = $2).
    expect(queryRaw.mock.calls[1][1]).toBe(7n);
    expect(queryRaw.mock.calls[1][2]).toBe(BigInt(POST_ID));
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("⑤ 답글에 답글 — 지정한 parentId 자체가 답글(parent_id 있음)이면 1단 규칙 위반으로 거부한다", async () => {
    queryRaw
      .mockResolvedValueOnce([{ public_code: "POST0001" }])
      .mockResolvedValueOnce([{ parent_id: 3n }]); // 부모의 parent_id가 null이 아님 = 그 자체가 답글
    const db = makeDb();
    await expect(createComment(OWNER, { ...input, parentId: 8 }, db as never)).rejects.toThrow(
      /답글을 달 수 없는 댓글입니다/,
    );
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("⑥ 삭제 부모 — 부모가 삭제됐으면 잠금 쿼리(deleted_at IS NULL)가 빈 배열을 반환해 거부한다", async () => {
    queryRaw.mockResolvedValueOnce([{ public_code: "POST0001" }]).mockResolvedValueOnce([]); // deleted_at IS NULL 조건에 걸려 미조회
    const db = makeDb();
    await expect(createComment(OWNER, { ...input, parentId: 9 }, db as never)).rejects.toThrow(
      /답글을 달 수 없는 댓글입니다/,
    );
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("⑦ 숨김 부모 — 부모가 숨김 처리됐으면 잠금 쿼리(hidden_at IS NULL)가 빈 배열을 반환해 거부한다", async () => {
    queryRaw.mockResolvedValueOnce([{ public_code: "POST0001" }]).mockResolvedValueOnce([]); // hidden_at IS NULL 조건에 걸려 미조회
    const db = makeDb();
    await expect(createComment(OWNER, { ...input, parentId: 11 }, db as never)).rejects.toThrow(
      /답글을 달 수 없는 댓글입니다/,
    );
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("⑧ 숨김 글 — 글이 숨김 상태면 잠금 쿼리가 빈 배열을 반환해 거부하고, 부모 잠금은 시도되지 않는다", async () => {
    queryRaw.mockResolvedValueOnce([]); // hidden_at IS NULL 조건에 걸려 미조회
    const db = makeDb();
    await expect(createComment(OWNER, { ...input, parentId: 1 }, db as never)).rejects.toThrow(
      /댓글을 달 수 없습니다/,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1); // 글 잠금에서 즉시 중단 — 부모 잠금 쿼리 미실행
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("⑨ 삭제 글 — 글이 삭제 상태면 잠금 쿼리가 빈 배열을 반환해 거부한다", async () => {
    queryRaw.mockResolvedValueOnce([]); // deleted_at IS NULL 조건에 걸려 미조회
    const db = makeDb();
    await expect(createComment(OWNER, input, db as never)).rejects.toThrow(/댓글을 달 수 없습니다/);
    expect(txCreate).not.toHaveBeenCalled();
  });
});

describe("updateComment", () => {
  const input = { id: 1, body: "수정된 댓글" };

  it("존재하지 않거나 타인 댓글이거나 삭제된 댓글은 동일 에러 — updateMany는 호출되지 않는다", async () => {
    commentFindFirst.mockResolvedValue(null);
    const db = makeDb();
    await expect(updateComment(OWNER, input, db as never)).rejects.toThrow(/댓글을 찾을 수 없습니다/);
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("숨김 중인 댓글은 수정 잠금 에러 — updateMany 호출 전에 막는다", async () => {
    commentFindFirst.mockResolvedValue({ postId: 1n, hiddenAt: new Date(), body: "원래 댓글" });
    const db = makeDb();
    await expect(updateComment(OWNER, input, db as never)).rejects.toThrow(
      /운영 검토 중인 댓글은 수정할 수 없습니다/,
    );
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("⑩ 수정 TOCTOU — 사전 조회 통과 후에도 updateMany가 0행이면 에러(동시 숨김·삭제 경쟁 차단)", async () => {
    commentFindFirst.mockResolvedValue({ postId: 1n, hiddenAt: null, body: "원래 댓글" }); // 조회 시점엔 정상
    commentUpdateMany.mockResolvedValue({ count: 0 }); // 그 사이 동시 숨김·삭제로 조건 불일치
    const db = makeDb();
    await expect(updateComment(OWNER, input, db as never)).rejects.toThrow(/댓글을 수정할 수 없습니다/);
    // 사전 조회를 통과해 실제로 원자적 UPDATE 시도까지 도달했음을 함께 증명한다.
    expect(commentUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("조건부 UPDATE where에 deletedAt:null·hiddenAt:null을 포함한다(TOCTOU 차단 조건)", async () => {
    const db = makeDb();
    await updateComment(OWNER, input, db as never);
    expect(commentUpdateMany.mock.calls[0][0].where).toEqual({
      id: 1n,
      accountId: OWNER,
      deletedAt: null,
      hiddenAt: null,
    });
  });

  it("본문이 바뀌면 edited_at을 갱신한다 — '수정됨' 표시의 근거", async () => {
    const db = makeDb();
    await updateComment(OWNER, input, db as never);
    const data = commentUpdateMany.mock.calls[0][0].data;
    expect(data.body).toBe("수정된 댓글");
    expect(data.editedAt).toBeInstanceOf(Date);
    // updated_at은 숨김·해제로도 바뀌므로, 표시용 시각은 edited_at으로 분리한다.
    expect(data.editedAt).toEqual(data.updatedAt);
  });

  it("본문이 같으면 UPDATE 자체를 하지 않는다 — 저장만 눌러도 '수정됨'이 붙으면 안 된다", async () => {
    commentFindFirst.mockResolvedValue({ postId: 7n, hiddenAt: null, body: "그대로" });
    postFindFirst.mockResolvedValue({ publicCode: "code-7" });
    const db = makeDb();

    const result = await updateComment(OWNER, { id: 1, body: "그대로" }, db as never);

    expect(commentUpdateMany).not.toHaveBeenCalled(); // no-op
    expect(result).toEqual({ postPublicCode: "code-7" }); // 성공으로 반환
  });

  it("무변경 판정은 숨김 검사보다 뒤 — 숨김 중이면 본문이 같아도 거부한다", async () => {
    commentFindFirst.mockResolvedValue({
      postId: 1n, hiddenAt: new Date(), body: "그대로",
    });
    const db = makeDb();
    await expect(
      updateComment(OWNER, { id: 1, body: "그대로" }, db as never),
    ).rejects.toThrow(/운영 검토 중인 댓글은 수정할 수 없습니다/);
  });

  it("⑪ 소속 글 부재 — postCodeOf가 데이터 무결성 오류를 던진다(FK 없는 스키마 방어)", async () => {
    postFindFirst.mockResolvedValue(null);
    const db = makeDb();
    await expect(updateComment(OWNER, input, db as never)).rejects.toThrow(
      /데이터 무결성 오류: 댓글의 소속 글\(1\)이 없습니다/,
    );
  });

  it("성공 시 소속 글의 postPublicCode를 반환한다", async () => {
    commentFindFirst.mockResolvedValue({ postId: 42n, hiddenAt: null, body: "원래 댓글" });
    postFindFirst.mockResolvedValue({ publicCode: "post-code-42" });
    const db = makeDb();
    const result = await updateComment(OWNER, input, db as never);
    expect(result).toEqual({ postPublicCode: "post-code-42" });
    expect(postFindFirst.mock.calls[0][0].where).toEqual({ id: 42n });
  });
});

describe("deleteComment", () => {
  it("존재하지 않거나 타인 댓글이거나 이미 삭제된 댓글은 동일 에러 — updateMany는 호출되지 않는다", async () => {
    commentFindFirst.mockResolvedValue(null);
    const db = makeDb();
    await expect(deleteComment(OWNER, 1, db as never)).rejects.toThrow(/댓글을 찾을 수 없습니다/);
    expect(commentUpdateMany).not.toHaveBeenCalled();
  });

  it("숨김 댓글도 삭제를 허용한다(§ 삭제만) — where에 hiddenAt 조건이 없다", async () => {
    commentFindFirst.mockResolvedValue({ postId: 1n }); // select에 hiddenAt 없음 — 존재 확인만
    const db = makeDb();
    const result = await deleteComment(OWNER, 1, db as never);
    expect(commentUpdateMany).toHaveBeenCalledTimes(1);
    expect(commentUpdateMany.mock.calls[0][0].where).toEqual({
      id: 1n,
      accountId: OWNER,
      deletedAt: null,
    });
    expect(result).toEqual({ postPublicCode: "existing-code" });
  });

  it("TOCTOU — 사전 조회 통과 후에도 updateMany가 0행이면 에러", async () => {
    commentUpdateMany.mockResolvedValue({ count: 0 }); // 조회 후 동시 삭제 등으로 조건 불일치
    const db = makeDb();
    await expect(deleteComment(OWNER, 1, db as never)).rejects.toThrow(/댓글을 삭제할 수 없습니다/);
    expect(commentUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("소속 글 부재 — postCodeOf가 데이터 무결성 오류를 던진다", async () => {
    commentFindFirst.mockResolvedValue({ postId: 7n });
    postFindFirst.mockResolvedValue(null);
    const db = makeDb();
    await expect(deleteComment(OWNER, 1, db as never)).rejects.toThrow(
      /데이터 무결성 오류: 댓글의 소속 글\(7\)이 없습니다/,
    );
  });

  it("성공 시 postPublicCode를 반환한다", async () => {
    commentFindFirst.mockResolvedValue({ postId: 3n });
    postFindFirst.mockResolvedValue({ publicCode: "del-code" });
    const db = makeDb();
    const result = await deleteComment(OWNER, 1, db as never);
    expect(result).toEqual({ postPublicCode: "del-code" });
  });
});
