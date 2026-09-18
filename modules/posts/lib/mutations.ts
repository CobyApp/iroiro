import "server-only";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { generatePublicCode } from "@/lib/public-code";
import {
  cleanupTmpObjects,
  compensateFinalObjects,
  consumePendingPhotos,
  finalizePendingPhotos,
} from "./pending-photo";
import { assertWithinRateLimit } from "./rate-limit";
import { RATE_LIMITS } from "./schema";

type Db = typeof defaultDb;
const MAX_CODE_RETRY = 3;

// 사전 조회 — 친화적 에러 메시지 용도(인가 근거 아님). 미존재·타인·삭제를 같은 에러로.
async function requireOwnedPost(
  db: Db, accountId: string, id: bigint,
): Promise<{ publicCode: string; hiddenAt: Date | null }> {
  const post = await db.post.findFirst({
    where: { id, accountId, deletedAt: null },
    select: { publicCode: true, hiddenAt: true },
  });
  if (!post) throw new DomainError("글을 찾을 수 없습니다");
  return post;
}

// 커뮤니티 허브 메타(최애 태그·링크·이벤트·토레카) — create/update 공용 매핑.
export type PostMetaInput = {
  teamId?: number | null;
  memberId?: number | null;
  cardId?: number | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
  eventPlace?: string | null;
};

function metaData(input: PostMetaInput) {
  return {
    teamId: input.teamId != null ? BigInt(input.teamId) : null,
    memberId: input.memberId != null ? BigInt(input.memberId) : null,
    cardId: input.cardId != null ? BigInt(input.cardId) : null,
    linkUrl: input.linkUrl ?? null,
    // 링크 없으면 라벨도 버린다(빈 링크에 라벨 노출 방지).
    linkLabel: input.linkUrl ? (input.linkLabel ?? null) : null,
    eventStartsAt: input.eventStartsAt ? new Date(input.eventStartsAt) : null,
    eventEndsAt: input.eventEndsAt ? new Date(input.eventEndsAt) : null,
    eventPlace: input.eventPlace ?? null,
  };
}

export async function createPost(
  accountId: string,
  input: {
    topic: string;
    title: string;
    body: string;
    photos?: { pendingPhotoId: number }[];
  } & PostMetaInput,
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  await assertWithinRateLimit(RATE_LIMITS.post, (since) =>
    db.post.count({ where: { accountId, createdAt: { gte: since } } }),
  );

  const pendingPhotoIds = (input.photos ?? []).map((p) => p.pendingPhotoId);
  // 사진: ① 대기 사진 원자 소비(짧은 tx) → ② tx 밖 R2 검증·복사(§결정 8 — I/O 동안 DB tx 미유지).
  const consumed = pendingPhotoIds.length ? await consumePendingPhotos(accountId, pendingPhotoIds, db) : [];
  const finalKeys = consumed.length ? await finalizePendingPhotos(consumed) : [];

  // 작성자 표시는 account 라이브 조회로 일원화 — 행에 이름 스냅샷을 두지 않는다(스펙 §닉네임).
  const baseData = () => ({
    accountId,
    publicCode: generatePublicCode(),
    topic: input.topic,
    title: input.title,
    body: input.body,
    ...metaData(input),
  });

  // ③ 최종 DB 반영 — 코드 충돌 재시도까지 포함해 "커밋까지"만 담당한다.
  //    정리·보상을 이 안에 넣지 않는 이유는 아래 ⑤ 참조(P2-1).
  const insertPost = async (): Promise<{ publicCode: string }> => {
    for (let attempt = 0; ; attempt++) {
      try {
        if (finalKeys.length === 0) {
          // 사진 없음 — 기존 경로 유지(단일 INSERT, tx 불필요).
          return await db.post.create({ data: baseData(), select: { publicCode: true } });
        }
        return await db.$transaction(async (tx) => {
          const post = await tx.post.create({
            data: baseData(),
            select: { id: true, publicCode: true },
          });
          await tx.postPhoto.createMany({
            data: finalKeys.map((r2Key, index) => ({
              postId: post.id,
              r2Key,
              displayOrder: index,
              isThumbnail: index === 0,
            })),
          });
          return { publicCode: post.publicCode };
        });
      } catch (error) {
        if (isUniqueViolationOn(error, "public_code") && attempt < MAX_CODE_RETRY - 1) continue;
        throw error;
      }
    }
  };

  let created: { publicCode: string };
  try {
    created = await insertPost();
  } catch (error) {
    // ④ DB 반영 실패에 한해 누적 최종 객체 전체 보상 삭제(P1-7). 소비된 대기 사진은 미복구(새 업로드 요구).
    await compensateFinalObjects(finalKeys);
    throw error;
  }

  // ⑤ 커밋 성공 이후 단계는 보상 catch 밖에 둔다(P2-1) — 임시 객체 정리에서 무슨 일이 생겨도
  //    이미 글이 참조하는 최종 객체를 삭제하는 경로로 새어 나가면 안 된다.
  await cleanupTmpObjects(consumed.map((c) => c.r2Key));
  return { postPublicCode: created.publicCode };
}

// §11 동시성 계약: ① tx → ② post FOR UPDATE → ③ 소유·숨김·삭제 재검증 → ④ 미삭제 댓글 확인
// → ⑤ 무변경 no-op / 변경 갱신 → ⑥ edited_at·updated_at 동시 커밋.
// createComment도 post를 먼저 잠그므로 update 선행/comment 선행 양방향이 직렬화된다.
export async function updatePost(
  accountId: string,
  input: { id: number; topic: string; title: string; body: string } & PostMetaInput,
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.id);
  return db.$transaction(async (tx) => {
    // FOR UPDATE 잠금 — 콘텐츠·메타 비교값을 한 조회에서 함께 읽는다(추가 조회 없음).
    const rows = await tx.$queryRaw<
      {
        public_code: string;
        hidden_at: Date | null;
        topic: string;
        title: string;
        body: string;
        team_id: bigint | null;
        member_id: bigint | null;
        card_id: bigint | null;
        link_url: string | null;
        link_label: string | null;
        event_starts_at: Date | null;
        event_ends_at: Date | null;
        event_place: string | null;
      }[]
    >`
      SELECT public_code, hidden_at, topic, title, body,
             team_id, member_id, card_id, link_url, link_label,
             event_starts_at, event_ends_at, event_place
      FROM post
      WHERE id = ${id} AND account_id = ${accountId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    const post = rows[0];
    if (!post) throw new DomainError("글을 찾을 수 없습니다"); // 미존재·타인·삭제 동일
    // 우선순위: moderation 먼저(§11 lockedReason — capability·getEditablePost·PostForm과 동일).
    if (post.hidden_at) throw new DomainError("운영 검토 중인 글은 수정할 수 없습니다");
    // 미삭제 댓글(숨김 포함) 존재 → 잠금. FOR UPDATE 잠금 하의 카운트라 createComment와 직렬화.
    const commentCount = await tx.postComment.count({ where: { postId: id, deletedAt: null } });
    if (commentCount > 0) throw new DomainError("댓글이 작성된 글은 수정할 수 없습니다");

    const meta = metaData(input);
    const asId = (v: bigint | null | undefined) => (v != null ? v.toString() : null);
    const asTime = (v: Date | null | undefined) => (v ? v.getTime() : null);
    // 실제 변경 시에만 edited_at 갱신(P2-2) — 무변경 저장은 성공 no-op.
    const changed =
      post.topic !== input.topic ||
      post.title !== input.title ||
      post.body !== input.body ||
      asId(post.team_id) !== asId(meta.teamId) ||
      asId(post.member_id) !== asId(meta.memberId) ||
      asId(post.card_id) !== asId(meta.cardId) ||
      (post.link_url ?? null) !== meta.linkUrl ||
      (post.link_label ?? null) !== meta.linkLabel ||
      asTime(post.event_starts_at) !== asTime(meta.eventStartsAt) ||
      asTime(post.event_ends_at) !== asTime(meta.eventEndsAt) ||
      (post.event_place ?? null) !== meta.eventPlace;
    if (changed) {
      const now = new Date();
      await tx.post.update({
        where: { id },
        data: {
          topic: input.topic,
          title: input.title,
          body: input.body,
          ...meta,
          editedAt: now,
          updatedAt: now,
        },
      });
    }
    return { postPublicCode: post.public_code };
  });
}

export async function deletePost(
  accountId: string, postId: number, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(postId);
  const post = await requireOwnedPost(db, accountId, id); // 숨김 글도 삭제 허용(§ 삭제만)
  return db.$transaction(async (tx) => {
    const now = new Date();
    const result = await tx.post.updateMany({
      where: { id, accountId, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
    if (result.count === 0) throw new DomainError("글을 찾을 수 없습니다");
    // 활성 사진도 같은 tx에서 soft delete(P1-5) — R2 객체는 비삭제(§결정 8), 공개 signer가 차단.
    await tx.postPhoto.updateMany({
      where: { postId: id, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
    return { postPublicCode: post.publicCode };
  });
}

// 게시판 관리자(admin/moderator)의 타인 글 삭제 — 소유권 무시, 소프트 삭제.
// 인가는 액션 계층 requireBoardManager가 담당(여기선 대상 존재만 확인).
export async function moderatorDeletePost(
  postId: number,
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(postId);
  return db.$transaction(async (tx) => {
    const post = await tx.post.findFirst({
      where: { id, deletedAt: null },
      select: { publicCode: true },
    });
    if (!post) throw new DomainError("글을 찾을 수 없습니다");
    const now = new Date();
    await tx.post.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
    await tx.postPhoto.updateMany({
      where: { postId: id, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
    return { postPublicCode: post.publicCode };
  });
}

export async function createComment(
  accountId: string,
  input: { postId: number; parentId?: number; body: string },
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const postId = BigInt(input.postId);
  await assertWithinRateLimit(RATE_LIMITS.comment, (since) =>
    db.postComment.count({ where: { accountId, createdAt: { gte: since } } }),
  );
  return db.$transaction(async (tx) => {
    // ① 글 행 잠금 + 노출 재검증 — 숨김/삭제 tx(updateMany 행 잠금)와 직렬화되어
    //    "숨김 확정 후 댓글 삽입" 경쟁을 차단한다. 잠금 순서 규약: post 먼저.
    const posts = await tx.$queryRaw<{ public_code: string }[]>`
      SELECT public_code FROM post
      WHERE id = ${postId} AND hidden_at IS NULL AND deleted_at IS NULL
      FOR UPDATE`;
    const post = posts[0];
    if (!post) throw new DomainError("댓글을 달 수 없습니다");

    // ② 답글이면 부모 잠금 + 불변식: 같은 글 소속 · 최상위 · 노출 상태.
    if (input.parentId !== undefined) {
      const parents = await tx.$queryRaw<{ parent_id: bigint | null }[]>`
        SELECT parent_id FROM post_comment
        WHERE id = ${BigInt(input.parentId)} AND post_id = ${postId}
          AND hidden_at IS NULL AND deleted_at IS NULL
        FOR UPDATE`;
      const parent = parents[0];
      if (!parent || parent.parent_id !== null) {
        throw new DomainError("답글을 달 수 없는 댓글입니다");
      }
    }

    await tx.postComment.create({
      data: {
        postId,
        accountId,
        parentId: input.parentId !== undefined ? BigInt(input.parentId) : null,
        body: input.body,
      },
    });
    return { postPublicCode: post.public_code };
  });
}

async function postCodeOf(db: Db, postId: bigint): Promise<string> {
  const post = await db.post.findFirst({ where: { id: postId }, select: { publicCode: true } });
  // FK 없는 스키마에서 소속 글 부재 = 데이터 무결성 위반 — 조용히 넘기지 않는다.
  // (DomainError 아님 — 사용자에게 보일 예상 오류가 아니라 버그이므로 error boundary로 보낸다.)
  if (!post) throw new Error(`데이터 무결성 오류: 댓글의 소속 글(${postId})이 없습니다`);
  return post.publicCode;
}

export async function updateComment(
  accountId: string, input: { id: number; body: string }, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.id);
  const existing = await db.postComment.findFirst({
    where: { id, accountId, deletedAt: null },
    select: { postId: true, hiddenAt: true, body: true },
  });
  if (!existing) throw new DomainError("댓글을 찾을 수 없습니다");
  if (existing.hiddenAt) throw new DomainError("운영 검토 중인 댓글은 수정할 수 없습니다");
  // 실제 변경 시에만 edited_at 갱신 — 무변경 저장은 성공 no-op(글 updatePost와 동일 계약).
  // 저장만 눌러도 '수정됨'이 붙으면 표기가 신뢰를 잃는다.
  if (existing.body !== input.body) {
    const now = new Date();
    const updated = await db.postComment.updateMany({
      where: { id, accountId, deletedAt: null, hiddenAt: null }, // TOCTOU 차단
      data: { body: input.body, editedAt: now, updatedAt: now },
    });
    if (updated.count === 0) throw new DomainError("댓글을 수정할 수 없습니다");
  }
  return { postPublicCode: await postCodeOf(db, existing.postId) };
}

export async function deleteComment(
  accountId: string, commentId: number, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(commentId);
  const existing = await db.postComment.findFirst({
    where: { id, accountId, deletedAt: null },
    select: { postId: true },
  });
  if (!existing) throw new DomainError("댓글을 찾을 수 없습니다");
  const updated = await db.postComment.updateMany({
    where: { id, accountId, deletedAt: null }, // 숨김 댓글도 삭제 허용
    data: { deletedAt: new Date(), updatedAt: new Date() },
  });
  if (updated.count === 0) throw new DomainError("댓글을 삭제할 수 없습니다");
  return { postPublicCode: await postCodeOf(db, existing.postId) };
}

type Admin = { id: string };

// 글·댓글 신고 합산 counter (스펙 §9 — 유형 분리 아님)
const reportCounter = (db: Db, accountId: string) => async (since: Date) => {
  const [posts, comments] = await Promise.all([
    db.postReport.count({ where: { reporterAccountId: accountId, createdAt: { gte: since } } }),
    db.postCommentReport.count({ where: { reporterAccountId: accountId, createdAt: { gte: since } } }),
  ]);
  return posts + comments;
};

export async function createPostReport(
  reporterAccountId: string,
  input: { targetId: number; reason: string; detail?: string },
  db: Db = defaultDb,
): Promise<void> {
  const postId = BigInt(input.targetId);
  await assertWithinRateLimit(RATE_LIMITS.report, reportCounter(db, reporterAccountId));
  try {
    await db.$transaction(async (tx) => {
      // 대상 잠금 + 노출 재검증(숨김·삭제 대상 신고 불가) — hide tx와 직렬화.
      // 작성자 이름은 account 라이브 조회 — 표시가 라이브이므로 "신고자가 화면에서 본 이름"이
      // 곧 신고 시점 이름이고, 그 값을 스냅샷에 동결한다(이후 닉네임 변경과 무관하게 증거 보존).
      // LEFT JOIN + FOR UPDATE OF p: 잠그는 건 post 행뿐 — account 행까지 잠그면 같은 작성자에
      // 대한 동시 신고·프로필 수정이 불필요하게 직렬화된다(outer join의 nullable 쪽은 잠글 수 없음).
      const rows = await tx.$queryRaw<{
        account_id: string; title: string; body: string;
        author_name: string; author_code: string; updated_at: Date;
      }[]>`
        SELECT p.account_id, p.title, p.body,
               COALESCE(a.display_name, '(알 수 없음)') AS author_name,
               COALESCE(a.public_code, '-')            AS author_code,
               p.updated_at
        FROM post p
        LEFT JOIN account a ON a.id = p.account_id
        WHERE p.id = ${postId} AND p.hidden_at IS NULL AND p.deleted_at IS NULL
        FOR UPDATE OF p`;
      const post = rows[0];
      if (!post) throw new DomainError("신고할 수 없습니다");
      if (post.account_id === reporterAccountId) throw new DomainError("본인 글은 신고할 수 없습니다");
      // 신고 시점 사진 동결(P1-5) — post FOR UPDATE 잠금 하에서 본문·사진을 함께 스냅샷.
      const photos = await tx.postPhoto.findMany({
        where: { postId, deletedAt: null },
        orderBy: { displayOrder: "asc" },
        select: { r2Key: true, displayOrder: true },
      });
      await tx.postReport.create({
        data: {
          postId, reporterAccountId,
          reason: input.reason, detail: input.detail ?? null,
          snapshot: {
            version: 2, title: post.title, body: post.body,
            authorName: post.author_name, authorCode: post.author_code,
            updatedAt: post.updated_at.toISOString(),
            photos: photos.map((p) => ({ r2Key: p.r2Key, displayOrder: p.displayOrder })),
          },
        },
      });
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "post_id")) throw new DomainError("이미 신고한 글입니다");
    throw error;
  }
}

// 댓글 신고 — 잠금 순서 규약(post → post_comment) 준수: 상위 글을 먼저 잠가 hidePost와
// 직렬화한다(숨김 글 아래 새 미처리 댓글 신고 생성 차단). 그다음 댓글을 잠가 hideComment와 직렬화.
export async function createCommentReport(
  reporterAccountId: string,
  input: { targetId: number; reason: string; detail?: string },
  db: Db = defaultDb,
): Promise<void> {
  const commentId = BigInt(input.targetId);
  await assertWithinRateLimit(RATE_LIMITS.report, reportCounter(db, reporterAccountId));
  try {
    await db.$transaction(async (tx) => {
      // ① 댓글의 소속 글 확인(비잠금 읽기 — 잠금은 post부터).
      const ref = await tx.postComment.findFirst({
        where: { id: commentId },
        select: { postId: true },
      });
      if (!ref) throw new DomainError("신고할 수 없습니다");
      // ② 상위 post 선잠금 + 노출 재검증 — hidePost와 직렬화.
      const posts = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM post
        WHERE id = ${ref.postId} AND hidden_at IS NULL AND deleted_at IS NULL
        FOR UPDATE`;
      if (!posts[0]) throw new DomainError("신고할 수 없습니다");
      // ③ 댓글 잠금 + 소속·노출·작성자 재검증 — hideComment와 직렬화.
      // 작성자 이름은 account 라이브 조회로 동결(글 신고와 동일 — FOR UPDATE OF c로 댓글 행만 잠금).
      const comments = await tx.$queryRaw<{
        account_id: string; body: string;
        author_name: string; author_code: string; updated_at: Date;
      }[]>`
        SELECT c.account_id, c.body,
               COALESCE(a.display_name, '(알 수 없음)') AS author_name,
               COALESCE(a.public_code, '-')            AS author_code,
               c.updated_at
        FROM post_comment c
        LEFT JOIN account a ON a.id = c.account_id
        WHERE c.id = ${commentId} AND c.post_id = ${ref.postId}
          AND c.hidden_at IS NULL AND c.deleted_at IS NULL
        FOR UPDATE OF c`;
      const comment = comments[0];
      if (!comment) throw new DomainError("신고할 수 없습니다");
      if (comment.account_id === reporterAccountId) {
        throw new DomainError("본인 댓글은 신고할 수 없습니다");
      }
      // ④ INSERT — 스냅샷 동결(version 1).
      await tx.postCommentReport.create({
        data: {
          commentId, reporterAccountId,
          reason: input.reason, detail: input.detail ?? null,
          snapshot: {
            version: 1, body: comment.body,
            authorName: comment.author_name, authorCode: comment.author_code,
            updatedAt: comment.updated_at.toISOString(),
          },
        },
      });
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "comment_id")) throw new DomainError("이미 신고한 댓글입니다");
    throw error;
  }
}

// 숨김 = 대상 hidden_* 스탬프 + 그 시점의 미처리 신고 일괄 actioned(동일 tx).
// updateMany의 행 잠금이 createComment/createReport의 FOR UPDATE와 직렬화된다.
export async function hidePost(
  admin: Admin, input: { targetId: number; reason: string }, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.targetId);
  return db.$transaction(async (tx) => {
    const post = await tx.post.findFirst({ where: { id }, select: { publicCode: true } });
    if (!post) throw new DomainError("글을 찾을 수 없습니다");
    const now = new Date();
    const updated = await tx.post.updateMany({
      where: { id, deletedAt: null, hiddenAt: null },
      data: { hiddenAt: now, hiddenReason: input.reason, hiddenBy: admin.id, updatedAt: now },
    });
    if (updated.count === 0) throw new DomainError("숨길 수 없는 글입니다");
    await tx.postReport.updateMany({
      where: { postId: id, resolvedAt: null },
      data: { resolution: "actioned", resolvedBy: admin.id, resolvedAt: now, updatedAt: now },
    });
    return { postPublicCode: post.publicCode };
  });
}

// admin 인자는 hidePost와의 호출부 대칭(액션 계층 일관성)을 위해 받는다 — unhide는
// hidden_by 상당의 "누가 해제했는지" 컬럼이 없어 실제로 사용하지 않는다(브리프 시그니처 그대로).
export async function unhidePost(
  _admin: Admin, targetId: number, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(targetId);
  const post = await db.post.findFirst({ where: { id }, select: { publicCode: true } });
  if (!post) throw new DomainError("글을 찾을 수 없습니다");
  const updated = await db.post.updateMany({
    where: { id, deletedAt: null, hiddenAt: { not: null } },
    data: { hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: new Date() },
  });
  if (updated.count === 0) throw new DomainError("해제할 수 없는 글입니다");
  return { postPublicCode: post.publicCode };
}

// hideComment/unhideComment — hidePost/unhidePost와 동일 구조(대상 post_comment +
// post_comment_report resolve). post_comment는 자체 publicCode가 없어 postCodeOf로 조회
// (postCodeOf는 데이터 무결성 에러도 함께 던진다 — updateComment/deleteComment와 동일 계약).
export async function hideComment(
  admin: Admin, input: { targetId: number; reason: string }, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.targetId);
  const postId = await db.$transaction(async (tx) => {
    const comment = await tx.postComment.findFirst({ where: { id }, select: { postId: true } });
    if (!comment) throw new DomainError("댓글을 찾을 수 없습니다");
    const now = new Date();
    const updated = await tx.postComment.updateMany({
      where: { id, deletedAt: null, hiddenAt: null },
      data: { hiddenAt: now, hiddenReason: input.reason, hiddenBy: admin.id, updatedAt: now },
    });
    if (updated.count === 0) throw new DomainError("숨길 수 없는 댓글입니다");
    await tx.postCommentReport.updateMany({
      where: { commentId: id, resolvedAt: null },
      data: { resolution: "actioned", resolvedBy: admin.id, resolvedAt: now, updatedAt: now },
    });
    return comment.postId;
  });
  return { postPublicCode: await postCodeOf(db, postId) };
}

// admin 인자는 hideComment와의 호출부 대칭을 위해 받는다 — unhidePost와 동일한 이유로 미사용.
// 상위 글 검증·해제를 한 트랜잭션에 묶는다: 삭제된 글의 댓글을 해제하면 공개될 수 없어(무의미한
// 부분성공) 이를 막고, publicCode도 같은 잠금 조회에서 얻어 postCodeOf 분리 조회를 없앤다.
export async function unhideComment(
  _admin: Admin, targetId: number, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(targetId);
  return db.$transaction(async (tx) => {
    const existing = await tx.postComment.findFirst({ where: { id }, select: { postId: true } });
    if (!existing) throw new DomainError("댓글을 찾을 수 없습니다");
    // 상위 글 잠금 + 노출 재검증 — deletePost(updateMany 행 잠금)와 직렬화해 해제와의 경쟁을 막는다.
    // 삭제된 글은 거부(해제해도 공개 불가). 단순 hidden 상태 글은 허용(§ 댓글 독립 해제).
    const posts = await tx.$queryRaw<{ public_code: string }[]>`
      SELECT public_code FROM post
      WHERE id = ${existing.postId} AND deleted_at IS NULL
      FOR UPDATE`;
    const post = posts[0];
    if (!post) throw new DomainError("상위 글이 삭제되어 댓글을 해제할 수 없습니다");
    const updated = await tx.postComment.updateMany({
      where: { id, deletedAt: null, hiddenAt: { not: null } },
      data: { hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: new Date() },
    });
    if (updated.count === 0) throw new DomainError("해제할 수 없는 댓글입니다");
    return { postPublicCode: post.public_code };
  });
}

// 단독 resolve = dismissed 전용 — actioned는 숨김 tx에서만(§Global Constraints).
export async function dismissReport(
  admin: Admin,
  input: { target: "post" | "comment"; reportId: number; note?: string },
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(input.reportId);
  const now = new Date();
  const data = {
    resolution: "dismissed", resolvedBy: admin.id,
    resolutionNote: input.note ?? null, resolvedAt: now, updatedAt: now,
  };
  const updated = input.target === "post"
    ? await db.postReport.updateMany({ where: { id, resolvedAt: null }, data })
    : await db.postCommentReport.updateMany({ where: { id, resolvedAt: null }, data });
  if (updated.count === 0) throw new DomainError("이미 처리된 신고입니다");
}
