import { describe, expect, it } from "vitest";
import type { Post as PrismaPost, PostComment as PrismaComment } from "@prisma/client";

import { toPost, buildCommentTree } from "@/modules/posts/lib/transform";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

// 작성자 표시는 account 라이브 조회 결과(authors 맵)에서 온다 — 행에는 스냅샷 컬럼이 없다.
const AUTHORS = new Map([
  [OWNER, { name: "작성자", code: "AUTH01" }],
  [OTHER, { name: "타인", code: "OTHER1" }],
]);

const BASE_TIME = new Date("2026-07-01T00:00:00Z").getTime();
const offset = (n: number) => new Date(BASE_TIME + n * 1000);

function mkPost(overrides: Partial<PrismaPost> = {}): PrismaPost {
  return {
    id: 1n,
    accountId: OWNER,
    publicCode: "AbCdEfGh1234",
    topic: "community",
    title: "제목",
    body: "본문",
    teamId: null,
    memberId: null,
    cardId: null,
    linkUrl: null,
    linkLabel: null,
    eventStartsAt: null,
    eventEndsAt: null,
    eventPlace: null,
    editedAt: null,
    hiddenAt: null,
    hiddenReason: null,
    hiddenBy: null,
    deletedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

type CommentOverrides = {
  id: number;
  parentId?: number | null;
  accountId?: string;
  body?: string;
  hiddenAt?: Date | null;
  hiddenReason?: string | null;
  deletedAt?: Date | null;
  editedAt?: Date | null;
  createdAt?: Date;
};

// 기본값: 최상위(parentId null)·visible·OWNER 작성. createdAt은 id초 간격(정렬 테스트 편의).
function mkComment(o: CommentOverrides): PrismaComment {
  const createdAt = o.createdAt ?? offset(o.id);
  return {
    id: BigInt(o.id),
    postId: 1n,
    accountId: o.accountId ?? OWNER,
    parentId: o.parentId == null ? null : BigInt(o.parentId),
    body: o.body ?? `본문-${o.id}`,
    hiddenAt: o.hiddenAt ?? null,
    hiddenReason: o.hiddenReason ?? null,
    hiddenBy: null,
    deletedAt: o.deletedAt ?? null,
    editedAt: o.editedAt ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("toPost", () => {
  it("Prisma row를 DTO로 변환한다 (BigInt→number, Date→ISO, topic 캐스팅, commentCount 전달)", () => {
    const row = mkPost({ id: 7n, topic: "community", body: "안녕" });
    expect(toPost(row, AUTHORS, 3)).toEqual({
      id: 7,
      publicCode: "AbCdEfGh1234",
      topic: "community",
      title: "제목",
      body: "안녕",
      authorName: "작성자",
      authorCode: "AUTH01",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      editedAt: null,
      photoCount: 0,
      commentCount: 3,
      tag: { teamId: null, teamName: null, memberId: null, memberName: null },
      event: null,
      link: null,
      card: null,
      thumbnailUrl: null,
    });
  });

  it("editedAt·photoCount — 편집 전 null, 전달 시 ISO·개수 반영", () => {
    const edited = toPost(mkPost({ editedAt: new Date("2026-07-26T01:00:00Z") }), AUTHORS, 0, {
      photoCount: 3,
    });
    expect(edited.editedAt).toBe("2026-07-26T01:00:00.000Z");
    expect(edited.photoCount).toBe(3);

    const plain = toPost(mkPost(), AUTHORS, 0);
    expect(plain.editedAt).toBeNull();
    expect(plain.photoCount).toBe(0); // 기본값 — 사진 없는 글
  });

  it("작성자 표시는 accountId 키로 authors 맵에서 온다 — 미존재 계정은 표시 폴백", () => {
    const other = toPost(mkPost({ accountId: OTHER }), AUTHORS, 0);
    expect(other.authorName).toBe("타인");
    expect(other.authorCode).toBe("OTHER1");

    // FK 없는 스키마의 참조 깨짐 — 화면이 죽는 대신 폴백을 그린다.
    const unknown = toPost(mkPost({ accountId: "33333333-3333-3333-3333-333333333333" }), AUTHORS, 0);
    expect(unknown.authorName).toBe("(알 수 없음)");
    expect(unknown.authorCode).toBe("-");
  });
});

describe("buildCommentTree — 마스킹", () => {
  it("editedAt은 ISO 문자열로, 없으면 null로 노출된다", () => {
    const edited = new Date("2026-08-01T12:00:00Z");
    const [tree] = buildCommentTree([mkComment({ id: 1, editedAt: edited })], OWNER, AUTHORS);
    expect(tree.editedAt).toBe(edited.toISOString());

    const [plain] = buildCommentTree([mkComment({ id: 2 })], OWNER, AUTHORS);
    expect(plain.editedAt).toBeNull();
  });

  it("① visible 댓글은 본문을 그대로 노출한다", () => {
    const [root] = buildCommentTree([mkComment({ id: 1 })], null, AUTHORS);
    expect(root.status).toBe("visible");
    expect(root.body).toBe("본문-1");
    expect(root.hiddenReason).toBeNull();
  });

  it("② deleted는 본인이어도 body null — hidden 동시 설정(삭제+숨김 조합)도 body null", () => {
    const deletedOnly = mkComment({ id: 1, deletedAt: offset(100) });
    const replyToKeepRoot1 = mkComment({ id: 2, parentId: 1, createdAt: offset(101) });
    const treeOwner = buildCommentTree([deletedOnly, replyToKeepRoot1], OWNER, AUTHORS);
    expect(treeOwner[0].status).toBe("deleted");
    expect(treeOwner[0].body).toBeNull();
    expect(treeOwner[0].hiddenReason).toBeNull();

    const deletedAndHidden = mkComment({
      id: 3,
      deletedAt: offset(100),
      hiddenAt: offset(100),
      hiddenReason: "사유",
    });
    const replyToKeepRoot3 = mkComment({ id: 4, parentId: 3, createdAt: offset(101) });
    const treeCombo = buildCommentTree([deletedAndHidden, replyToKeepRoot3], OWNER, AUTHORS);
    expect(treeCombo[0].status).toBe("deleted"); // deleted가 hidden보다 우선
    expect(treeCombo[0].body).toBeNull();
    expect(treeCombo[0].hiddenReason).toBeNull();
  });

  it("③ hidden(타인)은 body·hiddenReason 모두 null", () => {
    const hiddenOther = mkComment({ id: 1, accountId: OWNER, hiddenAt: offset(100), hiddenReason: "사유" });
    const reply = mkComment({ id: 2, parentId: 1, createdAt: offset(101) });
    const [root] = buildCommentTree([hiddenOther, reply], OTHER, AUTHORS); // viewer=타인
    expect(root.status).toBe("hidden");
    expect(root.body).toBeNull();
    expect(root.hiddenReason).toBeNull();
  });

  it("④ hidden(본인)은 body+hiddenReason 노출 — 답글 없이 단독이어도 유지", () => {
    const hiddenOwn = mkComment({
      id: 1,
      accountId: OWNER,
      hiddenAt: offset(100),
      hiddenReason: "욕설 신고 누적",
    });
    const [root] = buildCommentTree([hiddenOwn], OWNER, AUTHORS);
    expect(root.status).toBe("hidden");
    expect(root.body).toBe("본문-1");
    expect(root.hiddenReason).toBe("욕설 신고 누적");
  });
});

describe("buildCommentTree — capability 매트릭스", () => {
  const H = offset(100);
  type Case = {
    label: string;
    viewer: string | null;
    hiddenAt: Date | null;
    deletedAt: Date | null;
    status: "visible" | "hidden" | "deleted";
    canEdit: boolean;
    canDelete: boolean;
    canReply: boolean;
    canReport: boolean;
  };
  const cases: Case[] = [
    { label: "본인·visible", viewer: OWNER, hiddenAt: null, deletedAt: null, status: "visible", canEdit: true, canDelete: true, canReply: true, canReport: false },
    { label: "타인·visible", viewer: OTHER, hiddenAt: null, deletedAt: null, status: "visible", canEdit: false, canDelete: false, canReply: true, canReport: true },
    { label: "익명(비로그인)·visible", viewer: null, hiddenAt: null, deletedAt: null, status: "visible", canEdit: false, canDelete: false, canReply: false, canReport: false },
    { label: "본인·hidden", viewer: OWNER, hiddenAt: H, deletedAt: null, status: "hidden", canEdit: false, canDelete: true, canReply: false, canReport: false },
    { label: "타인·hidden", viewer: OTHER, hiddenAt: H, deletedAt: null, status: "hidden", canEdit: false, canDelete: false, canReply: false, canReport: false },
    { label: "본인·deleted", viewer: OWNER, hiddenAt: null, deletedAt: H, status: "deleted", canEdit: false, canDelete: false, canReply: false, canReport: false },
    { label: "타인·deleted", viewer: OTHER, hiddenAt: null, deletedAt: H, status: "deleted", canEdit: false, canDelete: false, canReply: false, canReport: false },
  ];

  it.each(cases)(
    "$label → status=$status canEdit=$canEdit canDelete=$canDelete canReply=$canReply canReport=$canReport",
    ({ viewer, hiddenAt, deletedAt, status, canEdit, canDelete, canReply, canReport }) => {
      const root = mkComment({ id: 1, accountId: OWNER, hiddenAt, deletedAt, hiddenReason: hiddenAt ? "사유" : null });
      // 항상 visible인 답글을 하나 붙여 root가 리프 필터로 제거되지 않도록 보장한다
      // (canEdit/canDelete/canReply/canReport 확인이 목적이므로 root 자체 생존 여부는 별도 테스트에서 다룸).
      const filler = mkComment({ id: 2, parentId: 1, accountId: OTHER, createdAt: offset(101) });
      const [root0] = buildCommentTree([root, filler], viewer, AUTHORS);
      expect(root0.status).toBe(status);
      expect(root0.canEdit).toBe(canEdit);
      expect(root0.canDelete).toBe(canDelete);
      expect(root0.canReply).toBe(canReply);
      expect(root0.canReport).toBe(canReport);
    },
  );

  it("답글 위치(parentId 존재)는 visible이어도 canReply는 false(최상위 전용)", () => {
    const root = mkComment({ id: 1 });
    const reply = mkComment({ id: 2, parentId: 1, accountId: OTHER, createdAt: offset(2) });
    const [root0] = buildCommentTree([root, reply], OTHER, AUTHORS);
    expect(root0.replies[0].canReply).toBe(false);
  });
});

describe("buildCommentTree — 조립 순서(tiebreaker)", () => {
  it("createdAt asc 정렬, 동시각은 id asc로 tiebreak(루트·답글 모두)하고 입력 순서와 무관하다", () => {
    const T = BASE_TIME + 1_000_000;
    const early = mkComment({ id: 1, createdAt: new Date(T - 5000) });
    const rootA = mkComment({ id: 10, createdAt: new Date(T) });
    const rootB = mkComment({ id: 9, createdAt: new Date(T) }); // rootA와 동시각, id는 더 작음
    const replyLater = mkComment({ id: 12, parentId: 9, createdAt: new Date(T + 1000) });
    const replyEarlierId = mkComment({ id: 11, parentId: 9, createdAt: new Date(T + 1000) }); // 동시각, id 더 작음

    const shuffled = [replyLater, rootA, replyEarlierId, early, rootB];
    const roots = buildCommentTree(shuffled, null, AUTHORS);

    expect(roots.map((r) => r.id)).toEqual([1, 9, 10]);
    expect(roots.find((r) => r.id === 9)!.replies.map((r) => r.id)).toEqual([11, 12]);
  });
});

describe("buildCommentTree — 리프 필터", () => {
  it("답글 중 삭제·타인 숨김은 제거되고, 본인 숨김 답글은 유지된다(본문도 노출)", () => {
    const root = mkComment({ id: 1, accountId: OWNER });
    const deletedReply = mkComment({ id: 2, parentId: 1, accountId: OTHER, deletedAt: offset(100), createdAt: offset(2) });
    const hiddenOtherReply = mkComment({ id: 3, parentId: 1, accountId: OTHER, hiddenAt: offset(100), hiddenReason: "사유", createdAt: offset(3) });
    const hiddenOwnReply = mkComment({ id: 4, parentId: 1, accountId: OWNER, hiddenAt: offset(100), hiddenReason: "자기신고", createdAt: offset(4) });
    const visibleReply = mkComment({ id: 5, parentId: 1, accountId: OTHER, createdAt: offset(5) });

    const [rootDto] = buildCommentTree(
      [root, deletedReply, hiddenOtherReply, hiddenOwnReply, visibleReply],
      OWNER, // 댓글1·댓글4 작성자 시점
      AUTHORS,
    );

    expect(rootDto.replies.map((r) => r.id)).toEqual([4, 5]); // 2, 3 제거
    const ownHiddenDto = rootDto.replies.find((r) => r.id === 4);
    expect(ownHiddenDto?.status).toBe("hidden");
    expect(ownHiddenDto?.body).toBe("본문-4");
    expect(ownHiddenDto?.hiddenReason).toBe("자기신고");
  });

  it("답글이 남아 있으면 숨김·삭제 최상위는 플레이스홀더로 유지된다(본문은 비노출)", () => {
    const hiddenRoot = mkComment({ id: 1, accountId: OWNER, hiddenAt: offset(100), hiddenReason: "사유" });
    const survivingReply = mkComment({ id: 2, parentId: 1, accountId: OTHER, createdAt: offset(2) });
    const [rootDto] = buildCommentTree([hiddenRoot, survivingReply], OTHER, AUTHORS); // 타인 시점 → root 자체는 keep=false
    expect(rootDto.id).toBe(1);
    expect(rootDto.status).toBe("hidden");
    expect(rootDto.body).toBeNull();
    expect(rootDto.replies.map((r) => r.id)).toEqual([2]);

    const deletedRoot = mkComment({ id: 3, accountId: OWNER, deletedAt: offset(100) });
    const survivingReply2 = mkComment({ id: 4, parentId: 3, accountId: OTHER, createdAt: offset(4) });
    const [rootDto2] = buildCommentTree([deletedRoot, survivingReply2], OWNER, AUTHORS); // 본인이어도 deleted는 무조건 body null
    expect(rootDto2.status).toBe("deleted");
    expect(rootDto2.body).toBeNull();
    expect(rootDto2.replies.map((r) => r.id)).toEqual([4]);
  });

  it("답글이 없거나 답글까지 전부 리프 필터로 제거되면 숨김·삭제 최상위는 트리에서 사라진다", () => {
    const hiddenRootNoReply = mkComment({ id: 1, accountId: OWNER, hiddenAt: offset(100), hiddenReason: "사유" });
    expect(buildCommentTree([hiddenRootNoReply], OTHER, AUTHORS)).toEqual([]);

    const deletedRootNoReply = mkComment({ id: 2, accountId: OWNER, deletedAt: offset(100) });
    expect(buildCommentTree([deletedRootNoReply], OWNER, AUTHORS)).toEqual([]);

    // 답글이 있었지만 그 답글도 리프 필터로 제거되는 경우(연쇄 제거)
    const hiddenRoot = mkComment({ id: 3, accountId: OWNER, hiddenAt: offset(100), hiddenReason: "사유" });
    const deletedReply = mkComment({ id: 4, parentId: 3, accountId: OTHER, deletedAt: offset(100), createdAt: offset(4) });
    expect(buildCommentTree([hiddenRoot, deletedReply], OTHER, AUTHORS)).toEqual([]);
  });
});
