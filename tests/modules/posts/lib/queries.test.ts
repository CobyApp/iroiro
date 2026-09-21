import { beforeEach, describe, expect, it, vi } from "vitest";

// 서명 URL 발급은 결정적 문자열로 대체 — 발급 여부·대상 키가 검증 대상이다.
vi.mock("@/lib/r2/ugc", () => ({
  getSignedUgcGetUrl: vi.fn(async (key: string) => `signed:${key}`),
  UGC_GET_TTL_SECONDS: 900,
}));

// 태그명(그룹/멤버)·첨부 카드는 카탈로그 DB에서 배치 조회 — 이 픽스처엔 태그·카드가 없어 빈 배열.
vi.mock("@/lib/catalog-db", () => ({
  catalogDb: {
    team: { findMany: vi.fn(async () => []) },
    member: { findMany: vi.fn(async () => []) },
    card: { findMany: vi.fn(async () => []) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import {
  listPosts,
  getPostByPublicCode,
  getEditablePost,
  getReportEvidencePhotoUrl,
  listMyPosts,
  listReportQueue,
  listAdminPosts,
  listHiddenComments,
} from "@/modules/posts/lib/queries";
import { POST_PAGE_SIZE } from "@/modules/posts/lib/schema";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

// ── 인메모리 fake db — where/orderBy/skip/take/select를 실제로 적용해
// "호출 인자만 확인"이 아니라 실제 필터·정렬·페이지네이션 동작을 검증한다. ──

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type OrderBy = Array<Record<string, "asc" | "desc">>;

type PostRow = {
  id: bigint;
  accountId: string;
  publicCode: string;
  topic: string;
  title: string;
  body: string;
  teamId: bigint | null;
  memberId: bigint | null;
  cardId: bigint | null;
  linkUrl: string | null;
  linkLabel: string | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  eventPlace: string | null;
  editedAt: Date | null;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  hiddenBy: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type CommentRow = {
  id: bigint;
  postId: bigint;
  accountId: string;
  parentId: bigint | null;
  body: string;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  hiddenBy: string | null;
  deletedAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type PostReportRow = {
  id: bigint;
  postId: bigint;
  reporterAccountId: string;
  reason: string;
  detail: string | null;
  snapshot: unknown;
  resolution: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type CommentReportRow = {
  id: bigint;
  commentId: bigint;
  reporterAccountId: string;
  reason: string;
  detail: string | null;
  snapshot: unknown;
  resolution: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function matches(where: Where, row: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value === null;
    if (cond !== null && typeof cond === "object") {
      const c = cond as { in?: unknown[]; not?: unknown; contains?: string; mode?: string };
      if (c.in !== undefined) return c.in.some((v) => v === value);
      if ("not" in c) return value !== c.not;
      if (c.contains !== undefined) {
        const hay = String(value ?? "");
        return c.mode === "insensitive"
          ? hay.toLowerCase().includes(c.contains.toLowerCase())
          : hay.includes(c.contains);
      }
      return true;
    }
    return value === cond;
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function applyOrderBy<T extends Row>(rows: T[], orderBy?: OrderBy): T[] {
  if (!orderBy || orderBy.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const ob of orderBy) {
      const [key, dir] = Object.entries(ob)[0] as [string, "asc" | "desc"];
      const cmp = compareValues(a[key], b[key]);
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function applySelect<T extends Row>(rows: T[], select?: Record<string, boolean>): T[] {
  if (!select) return rows;
  const keys = Object.keys(select).filter((k) => select[k]);
  return rows.map((r) => {
    const out: Row = {};
    for (const k of keys) out[k] = r[k];
    return out as T;
  });
}

type FindManyArgs = {
  where?: Where;
  orderBy?: OrderBy;
  skip?: number;
  take?: number;
  select?: Record<string, boolean>;
};

function findManyGeneric<T extends Row>(rows: T[], args: FindManyArgs = {}): T[] {
  let result = rows.filter((r) => matches(args.where ?? {}, r));
  result = applyOrderBy(result, args.orderBy);
  if (args.skip) result = result.slice(args.skip);
  if (args.take !== undefined) result = result.slice(0, args.take);
  return applySelect(result, args.select);
}

type AccountRow = { id: string; displayName: string; publicCode: string };
// 작성자 표시의 라이브 조회 대상 — 행 스냅샷이 사라졌으므로 fake db에도 account가 필요하다.
const DEFAULT_ACCOUNTS: AccountRow[] = [
  { id: OWNER, displayName: "작성자", publicCode: "AUTH01" },
  { id: OTHER, displayName: "타인", publicCode: "OTHER1" },
];

function makeDb(seed: {
  posts?: PostRow[];
  comments?: CommentRow[];
  postReports?: PostReportRow[];
  commentReports?: CommentReportRow[];
  accounts?: AccountRow[];
}) {
  const posts = seed.posts ?? [];
  const comments = seed.comments ?? [];
  const postReports = seed.postReports ?? [];
  const commentReports = seed.commentReports ?? [];
  const accounts = seed.accounts ?? DEFAULT_ACCOUNTS;

  return {
    account: {
      findMany: async (args: FindManyArgs = {}) => findManyGeneric(accounts, args),
    },
    post: {
      findMany: async (args: FindManyArgs = {}) => findManyGeneric(posts, args),
      count: async (args: { where?: Where } = {}) =>
        posts.filter((r) => matches(args.where ?? {}, r)).length,
      findFirst: async (args: { where?: Where } = {}) =>
        posts.find((r) => matches(args.where ?? {}, r)) ?? null,
    },
    postComment: {
      findMany: async (args: FindManyArgs = {}) => findManyGeneric(comments, args),
      count: async (args: { where?: Where } = {}) =>
        comments.filter((r) => matches(args.where ?? {}, r)).length,
      groupBy: async (args: { by: string[]; where?: Where }) => {
        const filtered = comments.filter((r) => matches(args.where ?? {}, r));
        const groups = new Map<string, { postId: bigint; count: number }>();
        for (const r of filtered) {
          const k = r.postId.toString();
          const g = groups.get(k);
          if (g) g.count += 1;
          else groups.set(k, { postId: r.postId, count: 1 });
        }
        return [...groups.values()].map((g) => ({ postId: g.postId, _count: { _all: g.count } }));
      },
    },
    // 기존 픽스처에는 사진이 없다 — 사진 경로는 아래 makeQueriesDb 전용 케이스에서 검증한다.
    postPhoto: { groupBy: async () => [], findMany: async () => [] },
    // 커뮤니티 허브 enrich 배치 조회 대상 — 기존 픽스처엔 태그·카드가 없어 빈 배열.
    team: { findMany: async () => [] },
    member: { findMany: async () => [] },
    card: { findMany: async () => [] },
    $queryRaw: async () => [],
    postReport: {
      findMany: async (args: { where?: Where } = {}) => findManyGeneric(postReports, args),
      findFirst: async (args: { where?: Where } = {}) =>
        postReports.find((r) => matches(args.where ?? {}, r)) ?? null,
    },
    postCommentReport: {
      findMany: async (args: { where?: Where } = {}) => findManyGeneric(commentReports, args),
    },
  };
}

function mkPost(o: Partial<PostRow> & { id: bigint }): PostRow {
  return {
    accountId: OWNER,
    publicCode: `code-${o.id}`,
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
    ...o,
  };
}

function mkComment(o: Partial<CommentRow> & { id: bigint; postId: bigint }): CommentRow {
  return {
    accountId: OWNER,
    parentId: null,
    body: "댓글",
    hiddenAt: null,
    hiddenReason: null,
    hiddenBy: null,
    deletedAt: null,
    editedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...o,
  };
}

function mkPostReport(o: Partial<PostReportRow> & { id: bigint; postId: bigint }): PostReportRow {
  return {
    reporterAccountId: OTHER,
    reason: "spam",
    detail: null,
    snapshot: { version: 1 },
    resolution: null,
    resolvedBy: null,
    resolutionNote: null,
    resolvedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...o,
  };
}

function mkCommentReport(
  o: Partial<CommentReportRow> & { id: bigint; commentId: bigint },
): CommentReportRow {
  return {
    reporterAccountId: OTHER,
    reason: "abuse",
    detail: null,
    snapshot: { version: 1 },
    resolution: null,
    resolvedBy: null,
    resolutionNote: null,
    resolvedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...o,
  };
}

describe("listPosts", () => {
  it("숨김·삭제 글은 제외한다(VISIBLE 필터)", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n, title: "보임" }),
        mkPost({ id: 2n, title: "숨김", hiddenAt: new Date() }),
        mkPost({ id: 3n, title: "삭제", deletedAt: new Date() }),
      ],
    });
    const result = await listPosts({}, db as never);
    expect(result.items.map((p) => p.id)).toEqual([1]);
    expect(result.total).toBe(1);
  });

  it("topic 필터 — 지정 시 해당 주제만, 미지정 시 전체", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n, topic: "community" }), mkPost({ id: 2n, topic: "event", eventStartsAt: new Date("2026-09-01T00:00:00Z") })],
    });
    const communityOnly = await listPosts({ topic: "community" }, db as never);
    expect(communityOnly.items.map((p) => p.id)).toEqual([1]);

    const all = await listPosts({}, db as never);
    expect(all.items.map((p) => p.id).sort()).toEqual([1, 2]);
  });

  it("q 검색 — 제목 부분일치·대소문자 무시", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n, title: "Hello World" }), mkPost({ id: 2n, title: "다른 글" })],
    });
    const result = await listPosts({ q: "hello" }, db as never);
    expect(result.items.map((p) => p.id)).toEqual([1]);
  });

  it("createdAt desc·id desc로 정렬하고 POST_PAGE_SIZE 단위로 자른다(22건 중 1·2페이지)", async () => {
    const base = new Date("2026-07-01T00:00:00Z").getTime();
    const posts = Array.from({ length: 22 }, (_, i) =>
      mkPost({
        id: BigInt(i + 1),
        title: `글${i + 1}`,
        createdAt: new Date(base + i * 1000),
        updatedAt: new Date(base + i * 1000),
      }),
    );
    const db = makeDb({ posts });

    const page1 = await listPosts({}, db as never);
    expect(page1.total).toBe(22);
    expect(page1.pageSize).toBe(POST_PAGE_SIZE);
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].id).toBe(22); // 최신(가장 큰 createdAt·id)이 먼저
    expect(page1.items[19].id).toBe(3);

    const page2 = await listPosts({ page: 2 }, db as never);
    expect(page2.items.map((p) => p.id)).toEqual([2, 1]);
  });

  it("댓글수는 post별 VISIBLE 댓글만 집계하고, 매칭 글이 없으면 groupBy 없이 빈 결과", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n }), mkPost({ id: 2n })],
      comments: [
        mkComment({ id: 100n, postId: 1n }), // visible
        mkComment({ id: 101n, postId: 1n, hiddenAt: new Date() }), // hidden 제외
        mkComment({ id: 102n, postId: 1n, deletedAt: new Date() }), // deleted 제외
        mkComment({ id: 103n, postId: 2n }), // visible, post2에만 집계
      ],
    });
    const result = await listPosts({}, db as never);
    expect(result.items.find((p) => p.id === 1)?.commentCount).toBe(1);
    expect(result.items.find((p) => p.id === 2)?.commentCount).toBe(1);

    const empty = await listPosts({ q: "존재안함" }, db as never);
    expect(empty.items).toEqual([]);
    expect(empty.total).toBe(0);
  });
});

describe("getPostByPublicCode", () => {
  it("존재하지 않음·숨김·삭제는 모두 null(동일 404 응답)", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n, publicCode: "hidden-code", hiddenAt: new Date() }),
        mkPost({ id: 2n, publicCode: "deleted-code", deletedAt: new Date() }),
      ],
    });
    expect(await getPostByPublicCode("no-such-code", null, db as never)).toBeNull();
    expect(await getPostByPublicCode("hidden-code", null, db as never)).toBeNull();
    expect(await getPostByPublicCode("deleted-code", null, db as never)).toBeNull();
  });

  it("capability — 본인/타인/비로그인에 따라 canEdit·canDelete·canReport을 계산한다", async () => {
    const db = makeDb({ posts: [mkPost({ id: 1n, publicCode: "pub", accountId: OWNER })] });

    const anon = await getPostByPublicCode("pub", null, db as never);
    expect(anon?.capabilities).toEqual({ canEdit: false, canDelete: false, canReport: false, canModerate: false, canMessageAuthor: true });

    const owner = await getPostByPublicCode("pub", OWNER, db as never);
    expect(owner?.capabilities).toEqual({ canEdit: true, canDelete: true, canReport: false, canModerate: false, canMessageAuthor: false });

    const other = await getPostByPublicCode("pub", OTHER, db as never);
    expect(other?.capabilities).toEqual({ canEdit: false, canDelete: false, canReport: true, canModerate: false, canMessageAuthor: true });

    // 관리자(타인 글) — canModerate true.
    const mod = await getPostByPublicCode("pub", OTHER, db as never, true);
    expect(mod?.capabilities.canModerate).toBe(true);
  });

  it("댓글은 숨김·삭제 필터 없이 postId 조건만으로 전체 로드한다(숨김 최상위도 답글 트리 유지를 위해 조회되어야 함)", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n, publicCode: "pub" })],
      comments: [
        mkComment({ id: 10n, postId: 1n, hiddenAt: new Date(), hiddenReason: "사유" }), // 숨김 최상위
        mkComment({ id: 11n, postId: 1n, parentId: 10n, createdAt: new Date("2026-07-01T00:00:01Z") }), // 그 아래 생존 답글
      ],
    });
    const detail = await getPostByPublicCode("pub", null, db as never);
    // fetch가 hiddenAt:null 등으로 필터링됐다면 숨김 루트(10)가 조회되지 않아
    // 답글(11)의 parent를 찾지 못해 트리에서 통째로 유실된다 — 정상 동작은 플레이스홀더 유지.
    expect(detail?.comments).toHaveLength(1);
    expect(detail?.comments[0].id).toBe(10);
    expect(detail?.comments[0].status).toBe("hidden");
    expect(detail?.comments[0].replies.map((r) => r.id)).toEqual([11]);
  });

  it("commentCount는 트리 형태와 무관하게 원본 rows 기준 VISIBLE(비숨김·비삭제) 개수다", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n, publicCode: "pub" })],
      comments: [
        mkComment({ id: 10n, postId: 1n }), // visible
        mkComment({ id: 11n, postId: 1n, hiddenAt: new Date() }), // hidden
        mkComment({ id: 12n, postId: 1n, deletedAt: new Date() }), // deleted
      ],
    });
    const detail = await getPostByPublicCode("pub", null, db as never);
    expect(detail?.post.commentCount).toBe(1);
  });
});

describe("getEditablePost", () => {
  it("타인 글이거나 삭제된 내 글은 null", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n, publicCode: "mine", accountId: OWNER }),
        mkPost({ id: 2n, publicCode: "mine-deleted", accountId: OWNER, deletedAt: new Date() }),
      ],
    });
    expect(await getEditablePost("mine", OTHER, db as never)).toBeNull(); // 타인 글
    expect(await getEditablePost("mine-deleted", OWNER, db as never)).toBeNull(); // 본인이지만 삭제됨
    expect(await getEditablePost("no-code", OWNER, db as never)).toBeNull();
  });

  it("숨김 글은 lockedReason='moderation', 정상 글은 null(§11)", async () => {
    const db = makeDb({
      posts: [
        mkPost({
          id: 1n,
          publicCode: "hidden-mine",
          accountId: OWNER,
          hiddenAt: new Date(),
          hiddenReason: "사유",
        }),
        mkPost({ id: 2n, publicCode: "visible-mine", accountId: OWNER }),
      ],
    });
    const hidden = await getEditablePost("hidden-mine", OWNER, db as never);
    expect(hidden?.post.id).toBe(1);
    expect(hidden?.lockedReason).toBe("moderation");

    const visible = await getEditablePost("visible-mine", OWNER, db as never);
    expect(visible?.lockedReason).toBeNull();
    expect(visible?.post.commentCount).toBe(0);
  });
});

describe("listMyPosts", () => {
  it("본인 글만(삭제 제외), 숨김은 포함하고 status·hiddenReason을 매핑한다", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n, accountId: OWNER, createdAt: new Date("2026-07-03T00:00:00Z") }), // visible
        mkPost({
          id: 2n,
          accountId: OWNER,
          hiddenAt: new Date(),
          hiddenReason: "사유",
          createdAt: new Date("2026-07-02T00:00:00Z"),
        }), // hidden
        mkPost({ id: 3n, accountId: OWNER, deletedAt: new Date(), createdAt: new Date("2026-07-01T00:00:00Z") }), // 삭제 → 제외
        mkPost({ id: 4n, accountId: OTHER, createdAt: new Date("2026-07-04T00:00:00Z") }), // 타인 → 제외
      ],
    });
    const result = await listMyPosts(OWNER, 1, db as never);
    expect(result.items.map((p) => p.id)).toEqual([1, 2]); // createdAt desc, 삭제·타인 제외
    expect(result.total).toBe(2);
    expect(result.items.find((p) => p.id === 1)).toMatchObject({ status: "visible", hiddenReason: null });
    expect(result.items.find((p) => p.id === 2)).toMatchObject({ status: "hidden", hiddenReason: "사유" });
  });

  it("댓글수는 post별 VISIBLE 댓글만 집계한다(숨김·삭제 제외)", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n, accountId: OWNER })],
      comments: [
        mkComment({ id: 100n, postId: 1n }), // visible
        mkComment({ id: 101n, postId: 1n }), // visible
        mkComment({ id: 102n, postId: 1n, hiddenAt: new Date() }), // hidden 제외
        mkComment({ id: 103n, postId: 1n, deletedAt: new Date() }), // deleted 제외
      ],
    });
    const result = await listMyPosts(OWNER, 1, db as never);
    expect(result.items.find((p) => p.id === 1)?.commentCount).toBe(2);
  });

  it("페이지네이션 — createdAt desc·id desc 정렬로 22건을 20/2건씩 자른다", async () => {
    const base = new Date("2026-07-01T00:00:00Z").getTime();
    const posts = Array.from({ length: 22 }, (_, i) =>
      mkPost({ id: BigInt(i + 1), accountId: OWNER, createdAt: new Date(base + i * 1000) }),
    );
    const db = makeDb({ posts });
    const page1 = await listMyPosts(OWNER, 1, db as never);
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].id).toBe(22);
    expect(page1.total).toBe(22);

    const page2 = await listMyPosts(OWNER, 2, db as never);
    expect(page2.items.map((p) => p.id)).toEqual([2, 1]);
  });
});

describe("listReportQueue", () => {
  it("신고가 없으면 빈 결과", async () => {
    const db = makeDb({});
    const result = await listReportQueue(1, db as never);
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: POST_PAGE_SIZE });
  });

  it("resolvedAt이 설정된 신고는 큐에서 제외한다", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      postReports: [
        mkPostReport({ id: 1n, postId: 1n, resolvedAt: new Date() }), // 해결됨 → 제외
        mkPostReport({ id: 2n, postId: 1n }), // 미해결
      ],
    });
    const result = await listReportQueue(1, db as never);
    expect(result.items.map((i) => i.id)).toEqual([2]);
  });

  it("글 신고 targetStatus — visible·hidden·deleted·missing(대상 글 없음) 4종", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n, publicCode: "p1" }), // visible
        mkPost({ id: 2n, publicCode: "p2", hiddenAt: new Date() }), // hidden
        mkPost({ id: 3n, publicCode: "p3", deletedAt: new Date() }), // deleted
        // id=4는 posts에 없음 → missing
      ],
      postReports: [
        mkPostReport({ id: 1n, postId: 1n, createdAt: new Date("2026-07-01T00:00:00Z") }),
        mkPostReport({ id: 2n, postId: 2n, createdAt: new Date("2026-07-01T00:00:01Z") }),
        mkPostReport({ id: 3n, postId: 3n, createdAt: new Date("2026-07-01T00:00:02Z") }),
        mkPostReport({ id: 4n, postId: 4n, createdAt: new Date("2026-07-01T00:00:03Z") }),
      ],
    });
    const result = await listReportQueue(1, db as never);
    const byId = new Map(result.items.map((i) => [i.id, i]));
    expect(byId.get(1)?.targetStatus).toBe("visible");
    expect(byId.get(1)?.targetPublicCode).toBe("p1");
    expect(byId.get(1)?.reason).toBe("spam");
    expect(byId.get(2)?.targetStatus).toBe("hidden");
    expect(byId.get(3)?.targetStatus).toBe("deleted");
    expect(byId.get(4)?.targetStatus).toBe("missing");
    expect(byId.get(4)?.targetPublicCode).toBeNull();
  });

  it("댓글 신고 effective status — 댓글 자체 상태 + 상위 글의 영구 상태(삭제·누락)만 반영, 상위 글 숨김(가역)은 전파 안 함", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 10n, publicCode: "p10" }), // visible
        mkPost({ id: 11n, publicCode: "p11", hiddenAt: new Date() }), // hidden
        mkPost({ id: 12n, publicCode: "p12", deletedAt: new Date() }), // deleted
        // id=13은 없음 → post missing
      ],
      comments: [
        mkComment({ id: 100n, postId: 10n }), // visible + post visible → visible
        mkComment({ id: 101n, postId: 11n }), // visible + post hidden → visible(상위 글 hidden 전파 안 함)
        mkComment({ id: 102n, postId: 12n }), // visible + post deleted → deleted
        mkComment({ id: 103n, postId: 13n }), // visible + post missing → missing
        mkComment({ id: 104n, postId: 10n, hiddenAt: new Date(), hiddenReason: "사유" }), // hidden + post visible → hidden
        mkComment({ id: 105n, postId: 10n, deletedAt: new Date() }), // deleted + post visible → deleted
        // id=106은 없음 → comment missing
      ],
      commentReports: [
        mkCommentReport({ id: 1n, commentId: 100n, createdAt: new Date("2026-07-01T00:00:00Z") }),
        mkCommentReport({ id: 2n, commentId: 101n, createdAt: new Date("2026-07-01T00:00:01Z") }),
        mkCommentReport({ id: 3n, commentId: 102n, createdAt: new Date("2026-07-01T00:00:02Z") }),
        mkCommentReport({ id: 4n, commentId: 103n, createdAt: new Date("2026-07-01T00:00:03Z") }),
        mkCommentReport({ id: 5n, commentId: 104n, createdAt: new Date("2026-07-01T00:00:04Z") }),
        mkCommentReport({ id: 6n, commentId: 105n, createdAt: new Date("2026-07-01T00:00:05Z") }),
        mkCommentReport({ id: 7n, commentId: 106n, createdAt: new Date("2026-07-01T00:00:06Z") }),
      ],
    });
    const result = await listReportQueue(1, db as never);
    const byId = new Map(result.items.map((i) => [i.id, i]));
    expect(byId.get(1)?.targetStatus).toBe("visible");
    expect(byId.get(1)?.targetPublicCode).toBe("p10"); // 댓글 신고의 targetPublicCode는 소속 글 코드
    expect(byId.get(2)?.targetStatus).toBe("visible"); // 상위 글만 숨김 → 댓글은 여전히 독립 조치 대상
    expect(byId.get(3)?.targetStatus).toBe("deleted");
    expect(byId.get(4)?.targetStatus).toBe("missing");
    expect(byId.get(4)?.targetPublicCode).toBeNull(); // 글 없음
    expect(byId.get(5)?.targetStatus).toBe("hidden");
    expect(byId.get(6)?.targetStatus).toBe("deleted");
    expect(byId.get(7)?.targetStatus).toBe("missing"); // 댓글 자체가 없음
    expect(byId.get(7)?.targetPublicCode).toBeNull();
  });

  it("reporterMasked는 신고자 UUID 뒤 4자만 노출한다(# 접두)", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      postReports: [
        mkPostReport({ id: 1n, postId: 1n, reporterAccountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1234" }),
      ],
    });
    const result = await listReportQueue(1, db as never);
    expect(result.items[0].reporterMasked).toBe("#1234");
  });

  it("병합 정렬 — createdAt asc, 동시각은 target 문자열(comment<post)로 tiebreak", async () => {
    const T = new Date("2026-07-01T00:00:00Z");
    const T2 = new Date("2026-07-01T00:00:01Z");
    const db = makeDb({
      posts: [mkPost({ id: 1n }), mkPost({ id: 2n })],
      comments: [mkComment({ id: 50n, postId: 1n })],
      postReports: [
        mkPostReport({ id: 100n, postId: 1n, createdAt: T }), // target=post, comment(1n)과 동시각
        mkPostReport({ id: 200n, postId: 2n, createdAt: T2 }), // 더 늦은 시각
      ],
      commentReports: [mkCommentReport({ id: 1n, commentId: 50n, createdAt: T })], // target=comment
    });
    const result = await listReportQueue(1, db as never);
    expect(result.items.map((i) => `${i.target}:${i.id}`)).toEqual(["comment:1", "post:100", "post:200"]);
  });

  it("동일 target·동일 createdAt은 id 오름차순으로 tiebreak", async () => {
    const T = new Date("2026-07-01T00:00:00Z");
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      postReports: [
        mkPostReport({ id: 20n, postId: 1n, createdAt: T }),
        mkPostReport({ id: 5n, postId: 1n, createdAt: T }),
      ],
    });
    const result = await listReportQueue(1, db as never);
    expect(result.items.map((i) => i.id)).toEqual([5, 20]);
  });

  it("페이지네이션 — 전체 병합 목록을 POST_PAGE_SIZE 단위로 자른다(22건)", async () => {
    const base = new Date("2026-07-01T00:00:00Z").getTime();
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      postReports: Array.from({ length: 22 }, (_, i) =>
        mkPostReport({ id: BigInt(i + 1), postId: 1n, createdAt: new Date(base + i * 1000) }),
      ),
    });
    const page1 = await listReportQueue(1, db as never);
    expect(page1.items).toHaveLength(20);
    expect(page1.total).toBe(22);
    expect(page1.items[0].id).toBe(1); // createdAt asc → 가장 이른 것이 먼저
    expect(page1.items[19].id).toBe(20);

    const page2 = await listReportQueue(2, db as never);
    expect(page2.items.map((i) => i.id)).toEqual([21, 22]);
  });
});

describe("listAdminPosts", () => {
  it("상태 필터 3종 — visible/hidden/deleted, 미지정 시 전체(삭제 포함)", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n, title: "보임" }),
        mkPost({ id: 2n, title: "숨김", hiddenAt: new Date(), hiddenReason: "사유" }),
        mkPost({ id: 3n, title: "삭제", deletedAt: new Date() }),
        mkPost({
          id: 4n,
          title: "숨겼다 삭제",
          hiddenAt: new Date(),
          hiddenReason: "사유",
          deletedAt: new Date(),
        }),
      ],
    });
    const visible = await listAdminPosts({ status: "visible" }, db as never);
    expect(visible.items.map((p) => p.id)).toEqual([1]);

    const hidden = await listAdminPosts({ status: "hidden" }, db as never);
    expect(hidden.items.map((p) => p.id)).toEqual([2]); // hiddenAt 설정 & deletedAt null만

    const deleted = await listAdminPosts({ status: "deleted" }, db as never);
    expect(deleted.items.map((p) => p.id).sort()).toEqual([3, 4]); // deletedAt 설정(숨김 여부 무관)

    const all = await listAdminPosts({}, db as never);
    expect(all.items.map((p) => p.id).sort()).toEqual([1, 2, 3, 4]); // 필터 없으면 전체(삭제 포함)
  });

  it("status·hiddenReason 매핑 — 숨김+삭제 조합은 삭제 우선이며 숨김 사유를 노출하지 않는다", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n }),
        mkPost({ id: 2n, hiddenAt: new Date(), hiddenReason: "사유" }),
        mkPost({ id: 3n, deletedAt: new Date() }),
        mkPost({ id: 4n, hiddenAt: new Date(), hiddenReason: "숨김후삭제사유", deletedAt: new Date() }),
      ],
    });
    const all = await listAdminPosts({}, db as never);
    const byId = new Map(all.items.map((p) => [p.id, p]));
    expect(byId.get(1)).toMatchObject({ status: "visible", hiddenReason: null });
    expect(byId.get(2)).toMatchObject({ status: "hidden", hiddenReason: "사유" });
    expect(byId.get(3)).toMatchObject({ status: "deleted", hiddenReason: null });
    expect(byId.get(4)).toMatchObject({ status: "deleted", hiddenReason: null });
  });

  it("검색 — 제목 부분일치·대소문자 무시", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n, title: "Hello World" }), mkPost({ id: 2n, title: "다른 글" })],
    });
    const result = await listAdminPosts({ q: "hello" }, db as never);
    expect(result.items.map((p) => p.id)).toEqual([1]);
  });
});

describe("listHiddenComments", () => {
  it("자체 숨김(hiddenAt not null)이면서 미삭제(deletedAt null)인 댓글만 반환한다", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      comments: [
        mkComment({ id: 10n, postId: 1n, hiddenAt: new Date(), hiddenReason: "사유" }), // 숨김만 → 포함
        mkComment({ id: 11n, postId: 1n }), // 미숨김 → 제외
        mkComment({ id: 12n, postId: 1n, deletedAt: new Date() }), // 미숨김+삭제 → 제외
        mkComment({
          id: 13n,
          postId: 1n,
          hiddenAt: new Date(),
          hiddenReason: "사유",
          deletedAt: new Date(),
        }), // 숨김+삭제 → 제외(삭제된 것은 항상 제외)
      ],
    });
    const result = await listHiddenComments(1, db as never);
    expect(result.items.map((i) => i.id)).toEqual([10]);
    expect(result.total).toBe(1);
  });

  it("소속 글 title·publicCode를 join한다 — 매칭 글이 없으면 둘 다 null", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n, publicCode: "p1", title: "글1" })],
      comments: [
        mkComment({
          id: 10n,
          postId: 1n,
          body: "본문1",
          hiddenAt: new Date(),
          hiddenReason: "사유",
        }),
        mkComment({ id: 11n, postId: 2n, hiddenAt: new Date(), hiddenReason: "사유" }), // postId=2n은 posts에 없음
      ],
    });
    const result = await listHiddenComments(1, db as never);
    const byId = new Map(result.items.map((i) => [i.id, i]));
    expect(byId.get(10)).toMatchObject({
      body: "본문1",
      hiddenReason: "사유",
      postTitle: "글1",
      postPublicCode: "p1",
    });
    expect(byId.get(11)).toMatchObject({
      postTitle: null,
      postPublicCode: null,
      postStatus: "missing", // 상위 글 없음 → 해제 불가
    });
  });

  it("상위 글 상태를 postStatus로 노출 — active·deleted·missing (해제 가능 여부)", async () => {
    const db = makeDb({
      posts: [
        mkPost({ id: 1n, publicCode: "p1", title: "정상" }),
        mkPost({ id: 2n, publicCode: "p2", title: "삭제됨", deletedAt: new Date() }),
      ],
      comments: [
        mkComment({ id: 10n, postId: 1n, hiddenAt: new Date(), hiddenReason: "사유" }),
        mkComment({ id: 20n, postId: 2n, hiddenAt: new Date(), hiddenReason: "사유" }),
        mkComment({ id: 30n, postId: 999n, hiddenAt: new Date(), hiddenReason: "사유" }), // 상위 글 없음
      ],
    });
    const result = await listHiddenComments(1, db as never);
    const byId = new Map(result.items.map((i) => [i.id, i]));
    expect(byId.get(10)).toMatchObject({ postStatus: "active" });
    expect(byId.get(20)).toMatchObject({ postStatus: "deleted", postTitle: "삭제됨" });
    expect(byId.get(30)).toMatchObject({ postStatus: "missing", postPublicCode: null });
  });

  it("hiddenAt을 ISO 문자열로 반환한다", async () => {
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      comments: [
        mkComment({
          id: 1n,
          postId: 1n,
          hiddenAt: new Date("2026-07-05T01:02:03.000Z"),
          hiddenReason: "사유",
        }),
      ],
    });
    const result = await listHiddenComments(1, db as never);
    expect(result.items[0].hiddenAt).toBe("2026-07-05T01:02:03.000Z");
  });

  it("hiddenAt이 동일하면 id desc로 tiebreak한다", async () => {
    const T = new Date("2026-07-01T00:00:00Z");
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      comments: [
        mkComment({ id: 5n, postId: 1n, hiddenAt: T, hiddenReason: "사유" }),
        mkComment({ id: 20n, postId: 1n, hiddenAt: T, hiddenReason: "사유" }),
      ],
    });
    const result = await listHiddenComments(1, db as never);
    expect(result.items.map((i) => i.id)).toEqual([20, 5]);
  });

  it("hiddenAt desc·id desc로 정렬하고 POST_PAGE_SIZE 단위로 자른다(22건 중 1·2페이지)", async () => {
    const base = new Date("2026-07-01T00:00:00Z").getTime();
    const db = makeDb({
      posts: [mkPost({ id: 1n })],
      comments: Array.from({ length: 22 }, (_, i) =>
        mkComment({
          id: BigInt(i + 1),
          postId: 1n,
          hiddenAt: new Date(base + i * 1000),
          hiddenReason: "사유",
        }),
      ),
    });
    const page1 = await listHiddenComments(1, db as never);
    expect(page1.total).toBe(22);
    expect(page1.pageSize).toBe(POST_PAGE_SIZE);
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].id).toBe(22); // 가장 최근 숨김이 먼저
    expect(page1.items[19].id).toBe(3);

    const page2 = await listHiddenComments(2, db as never);
    expect(page2.items.map((i) => i.id)).toEqual([2, 1]);
  });
});

// 사진·잠금 케이스 전용 db 팩토리 — 기존 케이스의 in-memory fake와 섞이지 않도록 분리한다.
function makeQueriesDb(
  over: {
    post?: Record<string, unknown> | null;
    comments?: { hiddenAt: Date | null; deletedAt: Date | null }[];
    photoRows?: { id: bigint; r2_key: string; display_order: number; is_thumbnail: boolean }[];
    commentCount?: number;
    photoCount?: number;
    report?: { snapshot: unknown } | null;
  } = {},
) {
  const postRow =
    over.post === null
      ? null
      : {
          id: 1n, accountId: "owner-1", publicCode: "code-1", topic: "community", title: "t", body: "b",
          teamId: null, memberId: null, cardId: null,
          linkUrl: null, linkLabel: null,
          eventStartsAt: null, eventEndsAt: null, eventPlace: null,
          editedAt: null,
          hiddenAt: null, hiddenReason: null, hiddenBy: null, deletedAt: null,
          createdAt: new Date("2026-07-26T00:00:00Z"), updatedAt: new Date("2026-07-26T00:00:00Z"),
          ...over.post,
        };
  const commentRows = (over.comments ?? []).map((c, index) => ({
    id: BigInt(index + 1), postId: 1n, accountId: "other-1", parentId: null, body: "c",
    hiddenReason: null, hiddenBy: null, editedAt: null,
    createdAt: new Date("2026-07-26T00:10:00Z"), updatedAt: new Date("2026-07-26T00:10:00Z"),
    ...c,
  }));
  return {
    account: {
      findMany: vi.fn().mockResolvedValue([
        { id: "owner-1", displayName: "a", publicCode: "AC1" },
        { id: "other-1", displayName: "n", publicCode: "OC1" },
      ]),
    },
    post: {
      findFirst: vi.fn().mockResolvedValue(postRow),
      findMany: vi.fn().mockResolvedValue(postRow ? [postRow] : []),
      count: vi.fn().mockResolvedValue(postRow ? 1 : 0),
    },
    postComment: {
      findMany: vi.fn().mockResolvedValue(commentRows),
      count: vi
        .fn()
        .mockResolvedValue(
          over.commentCount ?? commentRows.filter((c) => c.deletedAt === null).length,
        ),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    postPhoto: {
      groupBy: vi.fn().mockResolvedValue([{ postId: 1n, _count: { _all: over.photoCount ?? 2 } }]),
      // 목록 enrich는 사진 행을 직접 세어 개수·대표 썸네일을 도출한다(groupBy → findMany 전환).
      findMany: vi.fn().mockResolvedValue(
        Array.from({ length: over.photoCount ?? 2 }, (_, i) => ({
          id: BigInt(i + 1),
          postId: 1n,
        })),
      ),
    },
    team: { findMany: vi.fn().mockResolvedValue([]) },
    member: { findMany: vi.fn().mockResolvedValue([]) },
    card: { findMany: vi.fn().mockResolvedValue([]) },
    postReport: { findFirst: vi.fn().mockResolvedValue(over.report ?? null) },
    $queryRaw: vi.fn().mockResolvedValue(over.photoRows ?? []),
  };
}

describe("사진 서빙 — 서명 URL 발급 규칙(§결정 8·P1-2)", () => {
  const photoRows = [
    { id: 1n, r2_key: "posts/a.jpg", display_order: 0, is_thumbnail: true },
    { id: 2n, r2_key: "posts/b.jpg", display_order: 1, is_thumbnail: false },
  ];

  it("상세: 활성 사진을 display_order ASC로 서명 URL 발급", async () => {
    const db = makeQueriesDb({ photoRows });
    const view = await getPostByPublicCode("code-1", null, db as never);
    expect(view!.photos).toEqual([
      { id: 1, url: "signed:posts/a.jpg", displayOrder: 0, isThumbnail: true },
      { id: 2, url: "signed:posts/b.jpg", displayOrder: 1, isThumbnail: false },
    ]);
    expect(view!.post.photoCount).toBe(2);
  });

  it("사진 키는 글 노출·소속을 함께 검증하는 단일 JOIN에서 도출한다(P1-2)", async () => {
    const db = makeQueriesDb({ photoRows });
    await getPostByPublicCode("code-1", null, db as never);
    const sql = (db.$queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(sql).toContain("JOIN post p ON p.id = ph.post_id"); // 소속 검증
    expect(sql).toContain("p.hidden_at IS NULL");
    expect(sql).toContain("p.deleted_at IS NULL");
    expect(sql).toContain("ph.deleted_at IS NULL");
  });

  it("미발급: 글 미존재·숨김·삭제면 상세가 null이고 서명 쿼리 자체를 하지 않는다", async () => {
    const db = makeQueriesDb({ post: null }); // VISIBLE 필터에 걸린 숨김·삭제도 동일하게 0행
    expect(await getPostByPublicCode("code-1", null, db as never)).toBeNull();
    expect(db.post.findFirst.mock.calls[0][0].where).toMatchObject({
      publicCode: "code-1", hiddenAt: null, deletedAt: null,
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("미발급: 사진 미존재·soft delete·타 글 소속이면 JOIN이 0행 → photos 빈 배열", async () => {
    const db = makeQueriesDb({ photoRows: [], photoCount: 0 });
    const view = await getPostByPublicCode("code-1", null, db as never);
    expect(view!.photos).toEqual([]);
    expect(view!.post.photoCount).toBe(0);
  });

  it("목록: 서명 URL을 발급하지 않고 사진 개수만 싣는다", async () => {
    const { getSignedUgcGetUrl } = await import("@/lib/r2/ugc");
    const db = makeQueriesDb({ photoCount: 3 });
    const page = await listPosts({}, db as never);
    expect(page.items[0].photoCount).toBe(3);
    expect(getSignedUgcGetUrl).not.toHaveBeenCalled();
  });
});

describe("capability·getEditablePost — lockedReason 우선순위(§11)", () => {
  it("canEdit: 본인이어도 미삭제 댓글이 있으면 false(숨김 댓글도 카운트), 삭제는 허용", async () => {
    const db = makeQueriesDb({ comments: [{ hiddenAt: new Date(), deletedAt: null }] });
    const view = await getPostByPublicCode("code-1", "owner-1", db as never);
    expect(view!.capabilities.canEdit).toBe(false);
    expect(view!.capabilities.canDelete).toBe(true);
  });

  it("canEdit: 삭제된 댓글만 있으면 true", async () => {
    const db = makeQueriesDb({ comments: [{ hiddenAt: null, deletedAt: new Date() }] });
    const view = await getPostByPublicCode("code-1", "owner-1", db as never);
    expect(view!.capabilities.canEdit).toBe(true);
  });

  it("getEditablePost: 숨김이면서 댓글도 있으면 moderation 우선", async () => {
    const db = makeQueriesDb({ post: { hiddenAt: new Date() }, commentCount: 3 });
    const result = await getEditablePost("code-1", "owner-1", db as never);
    expect(result!.lockedReason).toBe("moderation");
  });

  it("getEditablePost: 댓글만이면 has_comments, 둘 다 없으면 null", async () => {
    const withComments = makeQueriesDb({ commentCount: 1 });
    expect((await getEditablePost("code-1", "owner-1", withComments as never))!.lockedReason).toBe(
      "has_comments",
    );

    const clean = makeQueriesDb({ commentCount: 0 });
    expect((await getEditablePost("code-1", "owner-1", clean as never))!.lockedReason).toBeNull();
    // 숨김 댓글도 잠금 사유에 포함되도록 deletedAt만 거른다.
    expect(clean.postComment.count.mock.calls[0][0].where).toEqual({ postId: 1n, deletedAt: null });
  });
});

describe("getReportEvidencePhotoUrl — admin 증거 signer(P1-4)", () => {
  const snapshotV2 = {
    version: 2, title: "t", body: "b", authorName: "a", authorCode: "c",
    updatedAt: "2026-07-26T00:00:00.000Z",
    photos: [{ r2Key: "posts/a.jpg", displayOrder: 0 }],
  };
  const snapshotV1 = {
    version: 1, title: "t", body: "b", authorName: "a", authorCode: "c",
    updatedAt: "2026-07-26T00:00:00.000Z",
  };

  it("snapshot v2의 photos[photoIndex] 키만 서명한다", async () => {
    const db = makeQueriesDb({ report: { snapshot: snapshotV2 } });
    await expect(getReportEvidencePhotoUrl(1, 0, db as never)).resolves.toBe("signed:posts/a.jpg");
  });

  it("범위 밖 photoIndex는 거부한다", async () => {
    const db = makeQueriesDb({ report: { snapshot: snapshotV2 } });
    await expect(getReportEvidencePhotoUrl(1, 5, db as never)).rejects.toThrow(
      "증거 사진을 찾을 수 없습니다",
    );
  });

  it("v1 스냅샷·미존재 신고는 거부한다", async () => {
    const v1Db = makeQueriesDb({ report: { snapshot: snapshotV1 } });
    await expect(getReportEvidencePhotoUrl(1, 0, v1Db as never)).rejects.toThrow(
      "사진 증거가 없는 신고입니다",
    );
    const missing = makeQueriesDb({ report: null });
    await expect(getReportEvidencePhotoUrl(9, 0, missing as never)).rejects.toThrow(
      "신고를 찾을 수 없습니다",
    );
  });

  it("대상이 숨김·삭제된 뒤에도 증거는 발급된다(공개 signer와 분리 — §7)", async () => {
    const db = makeQueriesDb({ post: { hiddenAt: new Date() }, report: { snapshot: snapshotV2 } });
    await expect(getReportEvidencePhotoUrl(1, 0, db as never)).resolves.toBe("signed:posts/a.jpg");
  });
});
