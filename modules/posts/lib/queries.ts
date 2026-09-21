import "server-only";
import { Prisma } from "@prisma/client";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getSignedUgcGetUrl } from "@/lib/r2/ugc";
import { POST_PAGE_SIZE, postReportSnapshot } from "./schema";
import { toPost, buildCommentTree, type AuthorInfo, type PostEnrich } from "./transform";
import type {
  Post, PostCardRef, PostDetailView, MyPost, ReportQueueItem, AdminPostItem, HiddenCommentItem,
  PostTopic, ReportReason, TargetStatus, LockedReason, PostPhotoView,
} from "../types";

type Db = typeof defaultDb;
const VISIBLE = { hiddenAt: null, deletedAt: null } as const;

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

// 최애 필터 — 뷰어의 관심 그룹/멤버 id(페이지가 계산해 넘긴다). null이면 필터 미적용.
export type FaveFilter = { teamIds: number[]; memberIds: number[] } | null;

// 표시 부가정보 배치 조회 — 대표 사진(썸네일)·사진 수·태그명(그룹/멤버)·첨부 카드.
// 목록·상세·내 글·수정 프리필이 공용으로 쓴다(같은 패턴의 account 배치 조회와 동형).
async function enrichForRows(
  db: Db,
  rows: { id: bigint; teamId: bigint | null; memberId: bigint | null; cardId: bigint | null }[],
): Promise<Map<string, PostEnrich>> {
  if (rows.length === 0) return new Map();
  const ids = rows.map((r) => r.id);
  const teamIds = [...new Set(rows.flatMap((r) => (r.teamId !== null ? [r.teamId] : [])))];
  const memberIds = [...new Set(rows.flatMap((r) => (r.memberId !== null ? [r.memberId] : [])))];
  const cardIds = [...new Set(rows.flatMap((r) => (r.cardId !== null ? [r.cardId] : [])))];
  const [photos, teams, members, cards] = await Promise.all([
    db.postPhoto.findMany({
      where: { postId: { in: ids }, deletedAt: null },
      orderBy: [{ isThumbnail: "desc" }, { displayOrder: "asc" }, { id: "asc" }],
      select: { id: true, postId: true },
    }),
    teamIds.length ? db.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }) : [],
    memberIds.length ? db.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } }) : [],
    cardIds.length
      ? db.card.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, name: true, frontR2Key: true },
        })
      : [],
  ]);
  const photoCount = new Map<string, number>();
  const thumbId = new Map<string, number>();
  for (const p of photos) {
    const key = p.postId.toString();
    photoCount.set(key, (photoCount.get(key) ?? 0) + 1);
    if (!thumbId.has(key)) thumbId.set(key, Number(p.id)); // 정렬상 첫 사진 = 대표
  }
  const teamName = new Map(teams.map((t) => [t.id.toString(), t.name]));
  const memberName = new Map(members.map((m) => [m.id.toString(), m.name]));
  const cardById = new Map<string, PostCardRef>(
    cards.map((c) => [
      c.id.toString(),
      {
        id: Number(c.id),
        name: c.name,
        imageUrl: c.frontR2Key ? `${env.R2_PUBLIC_BASE}/${c.frontR2Key}` : null,
      },
    ]),
  );
  const out = new Map<string, PostEnrich>();
  for (const r of rows) {
    const key = r.id.toString();
    out.set(key, {
      photoCount: photoCount.get(key) ?? 0,
      thumbnailPhotoId: thumbId.get(key) ?? null,
      teamName: r.teamId !== null ? (teamName.get(r.teamId.toString()) ?? null) : null,
      memberName: r.memberId !== null ? (memberName.get(r.memberId.toString()) ?? null) : null,
      card: r.cardId !== null ? (cardById.get(r.cardId.toString()) ?? null) : null,
    });
  }
  return out;
}

// 작성자 표시 정보를 account에서 배치 조회한다(페이지당 PK IN-list 1회 — listHiddenComments의
// post 배치 조회와 같은 패턴). 스냅샷 컬럼을 없앤 라이브 조회라 닉네임 변경이 전 글에 즉시
// 반영되고, #코드는 public_code가 불변이라 흔들리지 않는다. 탈퇴 계정은 softDeleteAccount가
// display_name을 "탈퇴한 회원"으로 바꿔 자연 처리된다(행은 soft delete — app 롤에 DELETE 없음).
async function fetchAuthors(
  db: Db,
  accountIds: Iterable<string>,
): Promise<Map<string, AuthorInfo>> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.account.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true, publicCode: true },
  });
  return new Map(rows.map((a) => [a.id, { name: a.displayName, code: a.publicCode }]));
}

// 댓글 수 배치 조회 — 목록 공용.
async function commentCountsFor(db: Db, ids: bigint[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const counts = await db.postComment.groupBy({
    by: ["postId"],
    where: { postId: { in: ids }, ...VISIBLE },
    _count: { _all: true },
  });
  return new Map(counts.map((c) => [c.postId.toString(), c._count._all]));
}

export async function listPosts(
  filter: { topic?: PostTopic; q?: string; page?: number; fave?: FaveFilter },
  db: Db = defaultDb,
): Promise<Page<Post>> {
  const page = filter.page ?? 1;
  const skip = (page - 1) * POST_PAGE_SIZE;

  // WHERE 조각 — Prisma 경로(community/전체)와 raw 경로(event 정렬)가 공유.
  const where: Prisma.PostWhereInput = {
    ...VISIBLE,
    ...(filter.topic ? { topic: filter.topic } : {}),
    ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" as const } } : {}),
    ...(filter.fave
      ? {
          OR: [
            { teamId: { in: filter.fave.teamIds.map(BigInt) } },
            { memberId: { in: filter.fave.memberIds.map(BigInt) } },
          ],
        }
      : {}),
  };

  let rows: Prisma.PostGetPayload<object>[];
  let total: number;

  if (filter.topic === "event") {
    // 이벤트 정렬 — 다가오는 것 먼저(가까운 순), 지난 것은 최근 순으로 뒤에.
    // Prisma orderBy로는 조건부 정렬을 못 만들어 raw로 id 순서를 뽑고 hydrate한다.
    const conds: Prisma.Sql[] = [
      Prisma.sql`hidden_at IS NULL`,
      Prisma.sql`deleted_at IS NULL`,
      Prisma.sql`topic = 'event'`,
    ];
    if (filter.q) conds.push(Prisma.sql`title ILIKE ${"%" + filter.q + "%"}`);
    if (filter.fave) {
      const t = filter.fave.teamIds;
      const m = filter.fave.memberIds;
      conds.push(
        Prisma.sql`(${t.length ? Prisma.sql`team_id IN (${Prisma.join(t.map(BigInt))})` : Prisma.sql`false`}
          OR ${m.length ? Prisma.sql`member_id IN (${Prisma.join(m.map(BigInt))})` : Prisma.sql`false`})`,
      );
    }
    const whereSql = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
    const order = Prisma.sql`
      ORDER BY (event_starts_at >= now()) DESC,
               CASE WHEN event_starts_at >= now() THEN event_starts_at END ASC,
               event_starts_at DESC,
               created_at DESC, id DESC`;
    const [idRows, countRows] = await Promise.all([
      db.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM post ${whereSql} ${order}
        LIMIT ${POST_PAGE_SIZE} OFFSET ${skip}`,
      db.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM post ${whereSql}`,
    ]);
    total = Number(countRows[0]?.count ?? 0);
    const orderedIds = idRows.map((r) => r.id);
    const fetched = orderedIds.length
      ? await db.post.findMany({ where: { id: { in: orderedIds } } })
      : [];
    const byId = new Map(fetched.map((r) => [r.id.toString(), r]));
    rows = orderedIds.map((id) => byId.get(id.toString())!).filter(Boolean);
  } else {
    [rows, total] = await Promise.all([
      db.post.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: POST_PAGE_SIZE,
      }),
      db.post.count({ where }),
    ]);
  }

  const [countByPost, enrich, authors] = await Promise.all([
    commentCountsFor(db, rows.map((r) => r.id)),
    enrichForRows(db, rows),
    fetchAuthors(db, rows.map((r) => r.accountId)),
  ]);
  return {
    items: rows.map((r) =>
      toPost(r, authors, countByPost.get(r.id.toString()) ?? 0, enrich.get(r.id.toString())),
    ),
    total, page, pageSize: POST_PAGE_SIZE,
  };
}

// 상세 — 숨김·삭제 글은 null(라우트 notFound, 404 동일 응답).
// 댓글은 v1 전체 로드 — pre-launch 예상 트래픽(글당 수십 건 규모)을 근거로 한 명시적 수용.
// (계정별 rate limit은 게시글 전체 누적을 제한하지 못함 — 규모 근거 아님.)
// 승격 조건: 글당 댓글 200건 초과 사례 발생 또는 상세 p95 응답 500ms 초과 시 페이지네이션 후속.
export async function getPostByPublicCode(
  code: string,
  viewerAccountId: string | null,
  db: Db = defaultDb,
  viewerIsManager = false,
): Promise<PostDetailView | null> {
  const row = await db.post.findFirst({ where: { publicCode: code, ...VISIBLE } });
  if (!row) return null;
  const [commentRows, photoRows] = await Promise.all([
    db.postComment.findMany({
      where: { postId: row.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    // 서명 대상 키는 "글 노출 + 사진 소속 + 사진 미삭제"를 하나의 조회에서 확인해 도출한다(P1-2).
    // 글을 먼저 읽고 사진을 따로 읽으면 그 사이에 커밋된 숨김을 놓쳐 신규 URL이 나갈 수 있다.
    db.$queryRaw<{ id: bigint; r2_key: string; display_order: number; is_thumbnail: boolean }[]>`
      SELECT ph.id, ph.r2_key, ph.display_order, ph.is_thumbnail
      FROM post_photo ph
      JOIN post p ON p.id = ph.post_id
      WHERE p.public_code = ${code}
        AND p.hidden_at IS NULL
        AND p.deleted_at IS NULL
        AND ph.deleted_at IS NULL
      ORDER BY ph.display_order ASC, ph.id ASC`,
  ]);
  const photos: PostPhotoView[] = await Promise.all(
    photoRows.map(async (p) => ({
      id: Number(p.id),
      url: await getSignedUgcGetUrl(p.r2_key),
      displayOrder: p.display_order,
      isThumbnail: p.is_thumbnail,
    })),
  );
  const isOwner = viewerAccountId !== null && row.accountId === viewerAccountId;
  const visibleCount = commentRows.filter((c) => !c.hiddenAt && !c.deletedAt).length;
  // canEdit: 미삭제 댓글(숨김 포함) 0일 때만(§11). visible 글만 오므로 moderation은 자연 배제.
  const undeletedCount = commentRows.filter((c) => !c.deletedAt).length;
  const [authors, enrich] = await Promise.all([
    fetchAuthors(db, [row.accountId, ...commentRows.map((c) => c.accountId)]),
    enrichForRows(db, [row]),
  ]);
  return {
    // 상세는 photos[](서명 GET)로 원본을 주므로 목록 썸네일 URL은 불필요 — thumbnailPhotoId 생략.
    post: toPost(row, authors, visibleCount, {
      ...enrich.get(row.id.toString()),
      photoCount: photos.length,
      thumbnailPhotoId: null,
    }),
    capabilities: {
      canEdit: isOwner && undeletedCount === 0,
      canDelete: isOwner,
      canReport: viewerAccountId !== null && !isOwner,
      // 관리자는 타인 글도 관리 삭제 가능(본인 글은 일반 삭제 경로 사용).
      canModerate: viewerIsManager && !isOwner,
      // 작성자에게 쪽지 — 본인 글이 아니면 노출(비로그인은 버튼에서 로그인 유도).
      canMessageAuthor: !isOwner,
    },
    comments: buildCommentTree(commentRows, viewerAccountId, authors),
    photos,
  };
}

// generateMetadata 전용 — 제목만 필요하므로 댓글을 로드하지 않는 경량 조회(상세 렌더와 별도 쿼리).
export async function getPostTitleByPublicCode(
  code: string,
  db: Db = defaultDb,
): Promise<{ title: string } | null> {
  return db.post.findFirst({
    where: { publicCode: code, ...VISIBLE },
    select: { title: true },
  });
}

// 수정 페이지 전용 — publicCode + 본인 + 미삭제. 숨김이면 locked(수정 잠금 안내, 삭제만).
// 수정 페이지 전용 — publicCode + 본인 + 미삭제. 잠금 사유는 우선순위로 구분(§11):
// moderation(운영 숨김) → has_comments(미삭제 댓글) → null. mutation·capability와 동일 축.
export async function getEditablePost(
  publicCode: string,
  accountId: string,
  db: Db = defaultDb,
): Promise<{ post: Post; lockedReason: LockedReason } | null> {
  const row = await db.post.findFirst({ where: { publicCode, accountId, deletedAt: null } });
  if (!row) return null;
  const undeleted = await db.postComment.count({ where: { postId: row.id, deletedAt: null } });
  const lockedReason: LockedReason =
    row.hiddenAt !== null ? "moderation" : undeleted > 0 ? "has_comments" : null;
  const [authors, enrich] = await Promise.all([
    fetchAuthors(db, [row.accountId]), // 본인 글 — 계정 1건 조회
    enrichForRows(db, [row]), // 수정 폼 프리필용 태그·카드·이벤트
  ]);
  return { post: toPost(row, authors, 0, enrich.get(row.id.toString())), lockedReason };
}

// admin 증거 signer 데이터 계층(P1-4) — snapshot에 실제 포함된 키만 서명. 클라 r2Key 불수용.
// 호출부(actions/photo.ts)가 requireAdmin을 입력 파싱보다 먼저 실행한다.
export async function getReportEvidencePhotoUrl(
  reportId: number,
  photoIndex: number,
  db: Db = defaultDb,
): Promise<string> {
  const report = await db.postReport.findFirst({
    where: { id: BigInt(reportId) },
    select: { snapshot: true },
  });
  if (!report) throw new DomainError("신고를 찾을 수 없습니다");
  const parsed = postReportSnapshot.safeParse(report.snapshot);
  if (!parsed.success || parsed.data.version !== 2) {
    throw new DomainError("사진 증거가 없는 신고입니다");
  }
  const photo = parsed.data.photos[photoIndex];
  if (!photo) throw new DomainError("증거 사진을 찾을 수 없습니다");
  // 숨김·삭제 후에도 admin은 증거 열람 가능(§7) — 공개 signer와 달리 노출 조건을 걸지 않는다.
  return getSignedUgcGetUrl(photo.r2Key);
}

export async function listMyPosts(
  accountId: string,
  page = 1,
  db: Db = defaultDb,
): Promise<Page<MyPost>> {
  const where = { accountId, deletedAt: null };
  const [rows, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * POST_PAGE_SIZE,
      take: POST_PAGE_SIZE,
    }),
    db.post.count({ where }),
  ]);
  const [countByPost, enrich, authors] = await Promise.all([
    commentCountsFor(db, rows.map((r) => r.id)),
    enrichForRows(db, rows),
    fetchAuthors(db, rows.map((r) => r.accountId)),
  ]);
  return {
    items: rows.map((r) => ({
      ...toPost(r, authors, countByPost.get(r.id.toString()) ?? 0, enrich.get(r.id.toString())),
      status: r.hiddenAt ? "hidden" as const : "visible" as const,
      hiddenReason: r.hiddenAt ? r.hiddenReason : null,
    })),
    total, page, pageSize: POST_PAGE_SIZE,
  };
}

function targetStatusOf(t: { hiddenAt: Date | null; deletedAt: Date | null } | undefined): TargetStatus {
  if (!t) return "missing";
  if (t.deletedAt) return "deleted";
  if (t.hiddenAt) return "hidden";
  return "visible";
}

// 댓글 신고의 effective status — 상위 글의 **영구** 상태(삭제·누락)만 함께 반영한다. 상위 글이
// '숨김'(가역)일 뿐이면 댓글 자체는 여전히 독립 숨김 대상이어야 한다 — 안 그러면 글을 해제했을 때
// 미조치 댓글이 그대로 재노출된다. 우선순위: missing → deleted → (댓글 자체) hidden → visible.
function effectiveCommentStatus(
  comment: { hiddenAt: Date | null; deletedAt: Date | null } | undefined,
  post: { hiddenAt: Date | null; deletedAt: Date | null } | undefined,
): TargetStatus {
  if (!comment || !post) return "missing";
  if (comment.deletedAt || post.deletedAt) return "deleted";
  if (comment.hiddenAt) return "hidden"; // 상위 글 hidden은 전파하지 않음(가역)
  return "visible";
}

// admin 신고 큐 — 글+댓글 미처리 합산, created_at ASC(target·id tiebreaker) 병합 후 페이지네이션.
// 미처리 큐는 운영 규모상 소량 전제(전량 로드 후 병합) — 대량화 시 커서 페이지네이션 후속.
export async function listReportQueue(
  page = 1,
  db: Db = defaultDb,
): Promise<Page<ReportQueueItem>> {
  const [postReports, commentReports] = await Promise.all([
    db.postReport.findMany({ where: { resolvedAt: null } }),
    db.postCommentReport.findMany({ where: { resolvedAt: null } }),
  ]);

  const commentRows = commentReports.length
    ? await db.postComment.findMany({
        where: { id: { in: commentReports.map((r) => r.commentId) } },
        select: { id: true, postId: true, hiddenAt: true, deletedAt: true },
      })
    : [];
  const commentById = new Map(commentRows.map((c) => [c.id.toString(), c]));

  const postIds = new Set<string>(postReports.map((r) => r.postId.toString()));
  for (const c of commentRows) postIds.add(c.postId.toString());
  const postRows = postIds.size
    ? await db.post.findMany({
        where: { id: { in: [...postIds].map((v) => BigInt(v)) } },
        select: { id: true, publicCode: true, hiddenAt: true, deletedAt: true },
      })
    : [];
  const postById = new Map(postRows.map((p) => [p.id.toString(), p]));

  const mask = (accountId: string) => `#${accountId.slice(-4)}`;

  const items: ReportQueueItem[] = [
    ...postReports.map((r) => {
      const target = postById.get(r.postId.toString());
      return {
        id: Number(r.id), target: "post" as const, targetId: Number(r.postId),
        targetPublicCode: target?.publicCode ?? null,
        reason: r.reason as ReportReason, detail: r.detail, snapshot: r.snapshot,
        reporterMasked: mask(r.reporterAccountId),
        createdAt: r.createdAt.toISOString(),
        targetStatus: targetStatusOf(target),
      };
    }),
    ...commentReports.map((r) => {
      const comment = commentById.get(r.commentId.toString());
      const post = comment ? postById.get(comment.postId.toString()) : undefined;
      return {
        id: Number(r.id), target: "comment" as const, targetId: Number(r.commentId),
        targetPublicCode: post?.publicCode ?? null,
        reason: r.reason as ReportReason, detail: r.detail, snapshot: r.snapshot,
        reporterMasked: mask(r.reporterAccountId),
        createdAt: r.createdAt.toISOString(),
        targetStatus: effectiveCommentStatus(comment, post),
      };
    }),
  ].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.target.localeCompare(b.target) ||
      a.id - b.id,
  );

  const start = (page - 1) * POST_PAGE_SIZE;
  return {
    items: items.slice(start, start + POST_PAGE_SIZE),
    total: items.length, page, pageSize: POST_PAGE_SIZE,
  };
}

// admin 전체 글 목록 — 검색·상태 필터(숨김 해제 진입점). 삭제 글도 노출(상태 표시, 액션 비활성).
export async function listAdminPosts(
  filter: { q?: string; status?: "visible" | "hidden" | "deleted"; page?: number },
  db: Db = defaultDb,
): Promise<Page<AdminPostItem>> {
  const page = filter.page ?? 1;
  const where = {
    ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" as const } } : {}),
    ...(filter.status === "visible" ? VISIBLE
      : filter.status === "hidden" ? { hiddenAt: { not: null }, deletedAt: null }
      : filter.status === "deleted" ? { deletedAt: { not: null } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * POST_PAGE_SIZE,
      take: POST_PAGE_SIZE,
    }),
    db.post.count({ where }),
  ]);
  const authors = await fetchAuthors(db, rows.map((r) => r.accountId));
  return {
    items: rows.map((r) => {
      const author = authors.get(r.accountId) ?? { name: "(알 수 없음)", code: "-" };
      return {
        id: Number(r.id), publicCode: r.publicCode, topic: r.topic as PostTopic,
        title: r.title, authorName: author.name, authorCode: author.code,
        status: r.deletedAt ? "deleted" as const : r.hiddenAt ? "hidden" as const : "visible" as const,
        hiddenReason: r.hiddenAt && !r.deletedAt ? r.hiddenReason : null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
    total, page, pageSize: POST_PAGE_SIZE,
  };
}

// admin 숨김 댓글 전용 목록 — 자체 숨김(hiddenAt not null) & 미삭제만. 신고를 처리(hide)하면
// 신고 큐에서는 resolve되어 사라지지만 숨김 댓글 자체는 여기서 계속 추적·해제할 수 있어야 한다
// ("전체 글" 탭은 글만 나열하므로 댓글은 이 목록이 유일한 진입점).
export async function listHiddenComments(
  page = 1,
  db: Db = defaultDb,
): Promise<Page<HiddenCommentItem>> {
  const where = { hiddenAt: { not: null }, deletedAt: null };
  const [rows, total] = await Promise.all([
    db.postComment.findMany({
      where,
      orderBy: [{ hiddenAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * POST_PAGE_SIZE,
      take: POST_PAGE_SIZE,
    }),
    db.postComment.count({ where }),
  ]);

  const postIds = [...new Set(rows.map((r) => r.postId.toString()))];
  const postRows = postIds.length
    ? await db.post.findMany({
        where: { id: { in: postIds.map((v) => BigInt(v)) } },
        select: { id: true, title: true, publicCode: true, deletedAt: true },
      })
    : [];
  const postById = new Map(postRows.map((p) => [p.id.toString(), p]));

  return {
    items: rows.map((r) => {
      const post = postById.get(r.postId.toString());
      return {
        id: Number(r.id),
        body: r.body,
        hiddenReason: r.hiddenReason,
        hiddenAt: r.hiddenAt!.toISOString(),
        postTitle: post?.title ?? null,
        postPublicCode: post?.publicCode ?? null,
        postStatus: !post
          ? "missing"
          : post.deletedAt !== null
            ? "deleted"
            : "active",
      };
    }),
    total, page, pageSize: POST_PAGE_SIZE,
  };
}
