// 팬 커뮤니티 허브 — 게시판 2개.
//  event     = 이벤트·모임 (생일카페·컵홀더·팝업·정모 등, 일시·장소·링크 구조화)
//  community = 자랑·수다 (개봉·컬렉션 자랑, 최애 이야기, 시세·정품 질문)
export const POST_TOPICS = ["event", "community"] as const;
export type PostTopic = (typeof POST_TOPICS)[number];
export const POST_TOPIC_LABELS: Record<PostTopic, string> = {
  event: "이벤트·모임",
  community: "자랑·수다",
};
export const POST_TOPIC_EMOJI: Record<PostTopic, string> = {
  event: "🎉",
  community: "🫰",
};

export const REPORT_REASONS = ["spam", "abuse", "privacy", "trade", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "스팸/광고",
  abuse: "욕설/비방",
  privacy: "개인정보 노출",
  trade: "거래 게시물",
  other: "기타",
};

export const REPORT_TARGETS = ["post", "comment"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

// 최애 태그 — 그룹/멤버(둘 다 선택 가능, 없으면 null).
export type PostFaveTag = {
  teamId: number | null;
  teamName: string | null;
  memberId: number | null;
  memberName: string | null;
};
// 이벤트 구조화 필드 — event 토픽에서만 채워진다.
export type PostEventInfo = {
  startsAt: string;
  endsAt: string | null;
  place: string | null;
};
// 외부 링크 첨부 — http(s)만. label 없으면 도메인을 표시한다.
export type PostLink = { url: string; label: string | null };
// 첨부한 토레카(card 마스터) 요약 — 이미지·이름·일본 시세.
export type PostCardRef = {
  id: number;
  name: string;
  imageUrl: string | null;
  marketAvgJpy: number;
};

// 공개 DTO — account_id·신고자·스냅샷·타인 hidden_reason 미포함(프라이버시 §).
export type Post = {
  id: number;
  publicCode: string;
  topic: PostTopic;
  title: string;
  body: string;
  authorName: string;
  authorCode: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null; // 작성자 편집 시각(§11 '수정됨' 뱃지) — updated_at과 분리
  photoCount: number;
  commentCount: number;
  // 커뮤니티 허브 확장 — 최애 태그·이벤트·링크·토레카·대표 썸네일.
  tag: PostFaveTag;
  event: PostEventInfo | null;
  link: PostLink | null;
  card: PostCardRef | null;
  // 목록 대표 썸네일(sharp 프록시 URL). 사진 없으면 null. 상세는 photos[](서명 GET) 사용.
  thumbnailUrl: string | null;
};

// 댓글 DTO — status·capability는 서버 계산(viewer 기준). authorCode는 표시 전용.
export type PostComment = {
  id: number;
  parentId: number | null;
  authorName: string;
  authorCode: string;
  createdAt: string;
  editedAt: string | null; // 본문 편집 시각 — '수정됨' 표시용(숨김·삭제로는 갱신 안 됨)
  status: "visible" | "deleted" | "hidden";
  body: string | null;         // visible 또는 (hidden && 본인)일 때만
  hiddenReason: string | null; // hidden && 본인일 때만
  canEdit: boolean;
  canDelete: boolean;
  canReply: boolean;
  canReport: boolean;
  replies: PostComment[];
};

// 상세 사진 — 서명 GET URL 포함(TTL 15분, 렌더 시점 발급).
export type PostPhotoView = {
  id: number;
  url: string;
  displayOrder: number;
  isThumbnail: boolean;
};

export type PostDetailView = {
  post: Post;
  capabilities: {
    canEdit: boolean;
    canDelete: boolean;
    canReport: boolean;
    // 게시판 관리자(admin/moderator) — 타인 글도 관리 삭제 가능.
    canModerate: boolean;
    // 작성자에게 쪽지 가능(본인 글 아님).
    canMessageAuthor: boolean;
  };
  comments: PostComment[];
  photos: PostPhotoView[];
};

export type MyPost = Post & { status: "visible" | "hidden"; hiddenReason: string | null };

// 글 수정 잠금 사유(§11) — 우선순위: moderation(운영 숨김) → has_comments(미삭제 댓글) → null.
// capability·getEditablePost·PostForm·mutation 4곳이 동일 우선순위를 쓴다.
export type LockedReason = "moderation" | "has_comments" | null;

export type TargetStatus = "visible" | "hidden" | "deleted" | "missing";

// admin 신고 큐 항목 — 대상 상태 포함(deleted/missing이면 모더레이션 액션 비활성).
export type ReportQueueItem = {
  id: number;
  target: ReportTarget;
  targetId: number;
  targetPublicCode: string | null; // 글 코드(댓글이면 소속 글 코드)
  reason: ReportReason;
  detail: string | null;
  snapshot: unknown;               // 화면에서 snapshot zod parse 후 표시
  reporterMasked: string;          // 신고자 마스킹(#UUID 뒤 4자) — 신원 비노출
  createdAt: string;
  targetStatus: TargetStatus;
};

// admin 전체 글 목록 항목 — 숨김 해제·상태 확인 진입점.
export type AdminPostItem = {
  id: number;
  publicCode: string;
  topic: PostTopic;
  title: string;
  authorName: string;
  authorCode: string;
  status: "visible" | "hidden" | "deleted";
  hiddenReason: string | null;
  createdAt: string;
};

// admin 숨김 댓글 전용 목록 항목 — 신고 해제로 큐에서 빠진 뒤에도 계속 추적·해제할 수 있는
// 진입점(자체 숨김만 대상, 삭제된 댓글은 제외). 소속 글이 이미 없으면 postTitle·postPublicCode는 null.
export type HiddenCommentItem = {
  id: number;
  body: string;
  hiddenReason: string | null;
  hiddenAt: string;
  postTitle: string | null;
  postPublicCode: string | null;
  // 상위 글 상태 — active만 해제 가능. deleted(소프트삭제)·missing(무결성 위반)은 해제 불가.
  postStatus: "active" | "deleted" | "missing";
};
