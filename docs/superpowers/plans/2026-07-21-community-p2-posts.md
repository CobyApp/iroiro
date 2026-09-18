# 커뮤니티 Plan 2: 자유게시판 텍스트 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 외부 설계 리뷰 1차(2026-07-22) 반영: 동시성 잠금(FOR UPDATE)·수정 TOCTOU 원자화·admin 전체
> 검색/해제 경로·신고 resolve 대상 판별·capability DTO·신고 rate limit 합산·반환/revalidate 계약·
> Prisma partial 미러·actions 폴더 분리·테스트 매트릭스 확대.
> 2차(2026-07-22) 반영: 댓글 신고의 상위 글 선잠금(post→comment 순서 준수)·답글 리프 필터 정합·
> 댓글 신고 effective targetStatus(상위 글 상태 반영)·댓글 전체 로드 근거 정정(승격 조건 명시)·
> 실DB 동시성 시나리오 5종 × 양방향 확정.

**Goal:** 자유게시판(post)의 **텍스트 코어**를 출시 가능한 상태로 구현한다 — 글(말머리 3종)·평면 댓글+1단 답글·신고·admin 숨김/해제/기각·전체 글 검색·계정 rate limit, 그리고 `(shop)` 헤더의 "커뮤니티" 진입점. **사진은 전 범위 제외(Plan 3).**

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-19-community-design.md`의 post 계열 — `init_post` 마이그레이션(4 텍스트 테이블 + 신고 RLS) → `modules/posts` 도메인(Plan 1 `modules/notices` + collection `mutations` 패턴 미러) → 공개/내글/admin 화면. 작성자는 `account.public_code`(Plan 1) 기반 `닉네임 #코드` 스냅샷으로 식별한다.

**Tech Stack:** Next.js 16 App Router · React 19 · Prisma 7(adapter-pg) · Supabase 마이그레이션 · zod v4 · Vitest · shadcn/ui

## Global Constraints

- **사진 전면 제외** — `post_photo`·`post_photo_claim` 테이블, presign/claim/서명 GET, 사진 컴포넌트·검증은 **Plan 3**. 이 계획의 어떤 Task도 R2/사진을 다루지 않는다. 신고 `snapshot`은 `version: 1` 텍스트 전용 스키마(사진 키는 Plan 3에서 version 확장).
- 스키마: 단수 snake_case · BIGINT IDENTITY PK · **FK 미사용**(관계 컬럼 수동 인덱스 필수) · TEXT enum + zod(DB CHECK는 불변식만) · 전 컬럼 한국어 COMMENT · `CREATE TABLE → ALTER CHECK → CREATE INDEX → COMMENT → GRANT/RLS` 블록 순서.
- **public_code length CHECK 미부여** · **enum 컬럼 DB DEFAULT 미부여**(`post.topic` 포함 — notice.category 선례, 스펙 동기화 완료). UI(PostForm)가 "잡담"을 프리셀렉트해 항상 값을 보낸다.
- **동시성 규약**: 숨김/삭제와 경합하는 생성·신고는 **tx + `SELECT … FOR UPDATE`(`$queryRaw`)로 대상 행을 잠그고, 잠금 하에 노출 상태를 재검증**한 뒤 INSERT까지 같은 tx에서 수행한다. 수정·삭제·숨김·해제는 **원자적 조건부 `updateMany`**(where에 상태 조건 포함, count 0 = 실패)로만 상태를 바꾼다 — 사전 조회는 친화적 에러 메시지 용도일 뿐 인가 근거가 아니다. **잠금 순서는 post → post_comment 고정**(교착 방지).
- GRANT: `app` 롤만. post·post_comment는 DELETE 미부여(soft delete 강제). 신고 2테이블은 컬럼 제한 UPDATE + DELETE 미부여. **신고 2테이블만 RLS**(own-row insert/select + admin update — `(select fn())` initplan 래핑).
- 작성자 식별: `author_name`·`author_code`는 작성 시점 스냅샷(표시 전용). **인가 근거는 항상 `account_id`** — `author_code`를 인가에 사용하지 않는다. `hidden_by`·`resolved_by`는 세션 admin account UUID(TEXT).
- **capability는 서버 계산**: 조회 계층이 viewer 기준 `isOwner`·`canEdit`·`canDelete`·`canReply`·`canReport`를 DTO에 담아 내려준다. UI는 이를 그대로 사용하고, mutation은 소유권을 **다시** 검증한다(2중).
- 입력 길이(zod, trim 후 공백만 거부 — 선택 입력은 trim 후 빈 값이면 undefined 정규화): 글 제목 80·본문 5,000 / 댓글 1,000 / 신고 detail 500 / 숨김 사유 500 / 처리 메모 1,000. 삭제·숨김·해제·resolve의 ID 입력도 zod 검증.
- 목록 페이지 크기 20(products 선례) — 공개 목록·내 글·admin 글 목록·admin 신고 큐 공통. 정렬 `created_at DESC, id DESC`(신고 큐만 `created_at ASC` 오래된 순).
- rate limit(계정 단위 이중 윈도 COUNT): 글 5/시간·20/일 · 댓글 5/분·60/시간 · **신고 5/10분·20/일 = 글·댓글 신고 COUNT 합산**(스펙 동기화 완료). 초과 시 도메인 에러.
- **mutation 반환 계약**: 콘텐츠를 변경하는 모든 mutation은 영향받은 글의 `postPublicCode`를 반환한다. 액션은 `/posts`·`/posts/my`·`/posts/[code]`(+admin 변경 시 `/admin/posts`)를 revalidate. 댓글의 소속 글 부재는 빈 문자열이 아니라 **무결성 에러 throw**.
- **신고 resolve 의미론**: 단독 resolve는 `dismissed` 전용(대상 미변경). `actioned`은 **숨김 tx 안에서만** 세팅된다. resolve 입력은 `target: "post" | "comment"` 판별자 필수(두 테이블 ID 독립).
- **actions는 폴더 구조로 시작**: `modules/posts/actions/{post,comment,report,moderation}.ts` + `index.ts` 재노출 — conventions.md 승격 기준(300줄/7개 이상)을 12+개 액션이 즉시 초과하므로 처음부터 분리.
- 인가: 쓰기 진입 시 `getCurrentAccount()`(비로그인 `redirect("/login")`), admin은 `requireAdmin()`을 **파싱보다 먼저** 호출(숨김/해제/기각 등 모더레이션 액션). 대필 금지 = admin은 **타인** 글·댓글을 수정·삭제하지 않음(숨김·해제만). admin도 **본인 명의** 글·댓글 작성은 일반 회원과 동일(스펙 §권한 표 — 작성 ✅).
- 공개 DTO: `account_id`·신고자 신원·스냅샷·타인 `hidden_reason` 미포함. id는 number(BigInt→Number 직렬화 — 저장소 전역 컨벤션, `lib/db.ts`). 본문 plain text 렌더(`whitespace-pre-wrap break-words`).
- mutations·queries는 **db 주입형**(`db: Db = defaultDb`). "use server" 파일은 async 함수만 export.
- 테스트(test-policy): **각 액션 최소 3케이스** — happy / 인증·인가 거부 / 입력 검증 실패. admin 액션은 `requireAdmin`이 mutation 전에 호출됨을 검증. `tests/` 미러, `vi.mock("@/lib/db")` 또는 db 주입, `getCurrentAccount`/`requireAdmin`은 `vi.hoisted` 스텁.
- 커밋: `<type>: 한국어 제목 70자 미만` · Co-Authored-By 금지. 브랜치 `feat/community-posts`(base `feat/community`) — PR도 `feat/community`로.

---

## 파일 구조

**신규 생성**
- `supabase/migrations/<ts>_init_post.sql` — post·post_comment·post_report·post_comment_report + RLS
- `modules/posts/types.ts` — DTO·라벨·capability·신고 큐/admin 목록 타입
- `modules/posts/lib/schema.ts` — zod(입력·searchParams·snapshot)·정책 상수
- `modules/posts/lib/rate-limit.ts` — 이중 윈도 COUNT 가드
- `modules/posts/lib/transform.ts` — DTO 변환(마스킹·capability)
- `modules/posts/lib/queries.ts` — 목록·상세·수정용·내 글·admin(신고 큐·글 목록)
- `modules/posts/lib/mutations.ts` — 글·댓글·신고·모더레이션 (FOR UPDATE·원자 UPDATE)
- `modules/posts/actions/{post,comment,report,moderation,index}.ts`
- `modules/posts/components/{PostList,PostCard,PostDetail,CommentThread,CommentForm,PostForm,ReportDialog,MyPosts,ReportQueue,PostsAdminTable}.tsx`
- `app/(shop)/posts/{page,new/page}.tsx` · `app/(shop)/posts/[publicCode]/{page,edit/page}.tsx` · `app/(shop)/posts/my/page.tsx`
- `app/(admin)/admin/posts/page.tsx`
- 대응 `tests/**`

**수정**: `prisma/schema.prisma` · `app/(shop)/layout.tsx`(헤더 커뮤니티 링크) · `modules/admin/components/AdminSidebar.tsx`

**미러 소스**: `modules/notices/*`, `modules/collection/lib/mutations.ts`, `lib/{public-code,prisma-errors}.ts`, `modules/auth/dal.ts`, `modules/admin/lib/requireAdmin.ts`, `supabase/migrations/20260608142249_init_account.sql`(RLS 문법), `20260720002722_init_notice.sql`(블록 구조), `prisma/schema.prisma`의 `where: raw(...)` partial 미러(예: `account_email_idx`).

---

### Task 1: `init_post` 마이그레이션 + Prisma 모델

**Files:**
- Create: `supabase/migrations/<ts>_init_post.sql` (`supabase migration new init_post`)
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: 4테이블 + Prisma `Post`·`PostComment`·`PostReport`·`PostCommentReport`(partial 인덱스 `where: raw` 미러 포함).

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- ============================================================================
-- init_post: 자유게시판 도메인 (텍스트 코어 — 사진은 Plan 3)
--   - post/post_comment = 공개물, soft delete(deleted_at) + admin 숨김(hidden_*)
--   - 신고 2테이블 = 경계 데이터 → RLS 백스톱(own-row insert/select + admin update)
--   - 인가: 앱 DAL. 작성자 식별은 author_name·author_code 스냅샷(표시 전용 — 인가는 account_id)
-- ============================================================================

CREATE TABLE post
(
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id    UUID        NOT NULL,
    public_code   TEXT        NOT NULL,
    topic         TEXT        NOT NULL,   -- talk | info | question (zod enum 필수·기본값 없음)
    title         TEXT        NOT NULL,
    body          TEXT        NOT NULL,
    author_name   TEXT        NOT NULL,   -- 작성 시점 displayName 스냅샷
    author_code   TEXT        NOT NULL,   -- 작성 시점 account.public_code 스냅샷
    hidden_at     TIMESTAMPTZ,
    hidden_reason TEXT,
    hidden_by     TEXT,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE post ADD CONSTRAINT post_hidden_consistency
    CHECK ((hidden_at IS NULL) = (hidden_reason IS NULL) AND (hidden_at IS NULL) = (hidden_by IS NULL));

CREATE UNIQUE INDEX post_public_code_unique ON post (public_code);
CREATE INDEX post_account_created_at_idx ON post (account_id, created_at);  -- rate limit COUNT + 내 글
CREATE INDEX post_created_at_idx ON post (created_at);
CREATE INDEX post_updated_at_idx ON post (updated_at);

COMMENT ON TABLE post IS '게시판 글';
COMMENT ON COLUMN post.id IS 'PK';
COMMENT ON COLUMN post.account_id IS '작성 회원 ID';
COMMENT ON COLUMN post.public_code IS '공개 URL 코드 (base62 12자)';
COMMENT ON COLUMN post.topic IS '말머리 (talk | info | question — 앱 zod 검증)';
COMMENT ON COLUMN post.title IS '제목';
COMMENT ON COLUMN post.body IS '본문 (plain text)';
COMMENT ON COLUMN post.author_name IS '작성 시점 닉네임 스냅샷';
COMMENT ON COLUMN post.author_code IS '작성 시점 공개 작성자 코드 스냅샷';
COMMENT ON COLUMN post.hidden_at IS '숨김 시각 (admin)';
COMMENT ON COLUMN post.hidden_reason IS '숨김 사유';
COMMENT ON COLUMN post.hidden_by IS '숨김 처리자 (account UUID, TEXT)';
COMMENT ON COLUMN post.deleted_at IS '삭제 시각 (soft delete)';
COMMENT ON COLUMN post.created_at IS '생성일';
COMMENT ON COLUMN post.updated_at IS '수정일';

CREATE TABLE post_comment
(
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id       BIGINT      NOT NULL,
    account_id    UUID        NOT NULL,
    parent_id     BIGINT,                 -- NULL = 최상위, 값 있으면 1단 답글
    body          TEXT        NOT NULL,
    author_name   TEXT        NOT NULL,
    author_code   TEXT        NOT NULL,
    hidden_at     TIMESTAMPTZ,
    hidden_reason TEXT,
    hidden_by     TEXT,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE post_comment ADD CONSTRAINT post_comment_hidden_consistency
    CHECK ((hidden_at IS NULL) = (hidden_reason IS NULL) AND (hidden_at IS NULL) = (hidden_by IS NULL));

CREATE INDEX post_comment_post_idx               ON post_comment (post_id);
CREATE INDEX post_comment_parent_idx             ON post_comment (parent_id);
CREATE INDEX post_comment_account_created_at_idx ON post_comment (account_id, created_at);  -- rate limit
CREATE INDEX post_comment_created_at_idx ON post_comment (created_at);
CREATE INDEX post_comment_updated_at_idx ON post_comment (updated_at);

COMMENT ON TABLE post_comment IS '게시판 댓글';
COMMENT ON COLUMN post_comment.id IS 'PK';
COMMENT ON COLUMN post_comment.post_id IS '글 ID';
COMMENT ON COLUMN post_comment.account_id IS '작성 회원 ID';
COMMENT ON COLUMN post_comment.parent_id IS '부모 댓글 ID (NULL = 최상위, 값 = 1단 답글)';
COMMENT ON COLUMN post_comment.body IS '내용 (plain text)';
COMMENT ON COLUMN post_comment.author_name IS '작성 시점 닉네임 스냅샷';
COMMENT ON COLUMN post_comment.author_code IS '작성 시점 공개 작성자 코드 스냅샷';
COMMENT ON COLUMN post_comment.hidden_at IS '숨김 시각 (admin)';
COMMENT ON COLUMN post_comment.hidden_reason IS '숨김 사유';
COMMENT ON COLUMN post_comment.hidden_by IS '숨김 처리자 (account UUID, TEXT)';
COMMENT ON COLUMN post_comment.deleted_at IS '삭제 시각 (soft delete)';
COMMENT ON COLUMN post_comment.created_at IS '생성일';
COMMENT ON COLUMN post_comment.updated_at IS '수정일';

CREATE TABLE post_report
(
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id             BIGINT      NOT NULL,
    reporter_account_id UUID        NOT NULL,
    reason              TEXT        NOT NULL,   -- spam | abuse | privacy | trade | other (zod)
    detail              TEXT,
    snapshot            JSONB       NOT NULL,   -- 신고 시점 대상 스냅샷 (version 1 — 텍스트 전용)
    resolution          TEXT,                   -- actioned | dismissed (zod)
    resolved_by         TEXT,
    resolution_note     TEXT,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE post_report ADD CONSTRAINT post_report_resolution_consistency
    CHECK ((resolved_at IS NULL) = (resolution IS NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL));

CREATE UNIQUE INDEX post_report_post_reporter_unique   ON post_report (post_id, reporter_account_id);
CREATE INDEX post_report_reporter_created_at_idx       ON post_report (reporter_account_id, created_at);  -- rate limit
CREATE INDEX post_report_unresolved_created_at_idx     ON post_report (created_at) WHERE resolved_at IS NULL;
CREATE INDEX post_report_created_at_idx ON post_report (created_at);
CREATE INDEX post_report_updated_at_idx ON post_report (updated_at);

COMMENT ON TABLE post_report IS '글 신고';
COMMENT ON COLUMN post_report.id IS 'PK';
COMMENT ON COLUMN post_report.post_id IS '신고 대상 글 ID';
COMMENT ON COLUMN post_report.reporter_account_id IS '신고자 회원 ID';
COMMENT ON COLUMN post_report.reason IS '사유 (spam | abuse | privacy | trade | other)';
COMMENT ON COLUMN post_report.detail IS '상세 사유';
COMMENT ON COLUMN post_report.snapshot IS '신고 시점 대상 스냅샷 (JSONB, version 필드 포함)';
COMMENT ON COLUMN post_report.resolution IS '처리 결과 (actioned | dismissed)';
COMMENT ON COLUMN post_report.resolved_by IS '처리자 (account UUID, TEXT)';
COMMENT ON COLUMN post_report.resolution_note IS '처리 메모';
COMMENT ON COLUMN post_report.resolved_at IS '처리 시각';
COMMENT ON COLUMN post_report.created_at IS '생성일';
COMMENT ON COLUMN post_report.updated_at IS '수정일';

CREATE TABLE post_comment_report
(
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    comment_id          BIGINT      NOT NULL,
    reporter_account_id UUID        NOT NULL,
    reason              TEXT        NOT NULL,
    detail              TEXT,
    snapshot            JSONB       NOT NULL,
    resolution          TEXT,
    resolved_by         TEXT,
    resolution_note     TEXT,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE post_comment_report ADD CONSTRAINT post_comment_report_resolution_consistency
    CHECK ((resolved_at IS NULL) = (resolution IS NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL));

CREATE UNIQUE INDEX post_comment_report_comment_reporter_unique ON post_comment_report (comment_id, reporter_account_id);
CREATE INDEX post_comment_report_reporter_created_at_idx   ON post_comment_report (reporter_account_id, created_at);
CREATE INDEX post_comment_report_unresolved_created_at_idx ON post_comment_report (created_at) WHERE resolved_at IS NULL;
CREATE INDEX post_comment_report_created_at_idx ON post_comment_report (created_at);
CREATE INDEX post_comment_report_updated_at_idx ON post_comment_report (updated_at);

COMMENT ON TABLE post_comment_report IS '댓글 신고';
COMMENT ON COLUMN post_comment_report.id IS 'PK';
COMMENT ON COLUMN post_comment_report.comment_id IS '신고 대상 댓글 ID';
COMMENT ON COLUMN post_comment_report.reporter_account_id IS '신고자 회원 ID';
COMMENT ON COLUMN post_comment_report.reason IS '사유 (spam | abuse | privacy | trade | other)';
COMMENT ON COLUMN post_comment_report.detail IS '상세 사유';
COMMENT ON COLUMN post_comment_report.snapshot IS '신고 시점 대상 스냅샷 (JSONB, version 필드 포함)';
COMMENT ON COLUMN post_comment_report.resolution IS '처리 결과 (actioned | dismissed)';
COMMENT ON COLUMN post_comment_report.resolved_by IS '처리자 (account UUID, TEXT)';
COMMENT ON COLUMN post_comment_report.resolution_note IS '처리 메모';
COMMENT ON COLUMN post_comment_report.resolved_at IS '처리 시각';
COMMENT ON COLUMN post_comment_report.created_at IS '생성일';
COMMENT ON COLUMN post_comment_report.updated_at IS '수정일';

-- ============================================================================
-- GRANT — app 롤만. post·post_comment는 DELETE 미부여(soft delete). 신고는 컬럼 제한 UPDATE.
-- ============================================================================
REVOKE ALL ON post, post_comment, post_report, post_comment_report FROM anon, authenticated, app;
GRANT SELECT, INSERT, UPDATE ON post         TO app;
GRANT SELECT, INSERT, UPDATE ON post_comment TO app;
GRANT SELECT, INSERT ON post_report TO app;
GRANT UPDATE (resolution, resolved_by, resolution_note, resolved_at, updated_at) ON post_report TO app;
GRANT SELECT, INSERT ON post_comment_report TO app;
GRANT UPDATE (resolution, resolved_by, resolution_note, resolved_at, updated_at) ON post_comment_report TO app;

-- ============================================================================
-- RLS — 신고 2테이블만(경계 데이터). own-row insert/select + admin update. DELETE 불가.
-- ============================================================================
ALTER TABLE post_report         ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comment_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_report_insert_own ON post_report FOR INSERT
    WITH CHECK (reporter_account_id = (select current_account_id()));
CREATE POLICY post_report_select_own_or_admin ON post_report FOR SELECT
    USING (reporter_account_id = (select current_account_id()) OR (select is_admin()));
CREATE POLICY post_report_admin_update ON post_report FOR UPDATE USING ((select is_admin()));

CREATE POLICY post_comment_report_insert_own ON post_comment_report FOR INSERT
    WITH CHECK (reporter_account_id = (select current_account_id()));
CREATE POLICY post_comment_report_select_own_or_admin ON post_comment_report FOR SELECT
    USING (reporter_account_id = (select current_account_id()) OR (select is_admin()));
CREATE POLICY post_comment_report_admin_update ON post_comment_report FOR UPDATE USING ((select is_admin()));
```

- [ ] **Step 2: `db:reset` 검증** — `Applying migration <ts>_init_post.sql` 클린 통과 + `\d post_report`로 RLS·제약 확인.

- [ ] **Step 3: Prisma 모델** — 커뮤니티 그룹(Notice 아래). **partial 인덱스는 `where: raw(...)`로 미러**(저장소 실사용 패턴 — `account_email_idx` 등 7곳 선례).

```prisma
model Post {
  id           BigInt         @id @default(autoincrement())
  accountId    String         @map("account_id") @db.Uuid
  publicCode   String         @map("public_code")
  topic        String
  title        String
  body         String
  authorName   String         @map("author_name")
  authorCode   String         @map("author_code")
  hiddenAt     DateTime?      @map("hidden_at") @db.Timestamptz(6)
  hiddenReason String?        @map("hidden_reason")
  hiddenBy     String?        @map("hidden_by")
  deletedAt    DateTime?      @map("deleted_at") @db.Timestamptz(6)
  createdAt    DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime       @default(now()) @map("updated_at") @db.Timestamptz(6)
  comments     PostComment[]

  @@unique([publicCode], map: "post_public_code_unique")
  @@index([accountId, createdAt], map: "post_account_created_at_idx")
  @@index([createdAt], map: "post_created_at_idx")
  @@index([updatedAt], map: "post_updated_at_idx")
  @@map("post")
}

model PostComment {
  id           BigInt    @id @default(autoincrement())
  postId       BigInt    @map("post_id")
  accountId    String    @map("account_id") @db.Uuid
  parentId     BigInt?   @map("parent_id")
  body         String
  authorName   String    @map("author_name")
  authorCode   String    @map("author_code")
  hiddenAt     DateTime? @map("hidden_at") @db.Timestamptz(6)
  hiddenReason String?   @map("hidden_reason")
  hiddenBy     String?   @map("hidden_by")
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz(6)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)
  post         Post      @relation(fields: [postId], references: [id])

  @@index([postId], map: "post_comment_post_idx")
  @@index([parentId], map: "post_comment_parent_idx")
  @@index([accountId, createdAt], map: "post_comment_account_created_at_idx")
  @@index([createdAt], map: "post_comment_created_at_idx")
  @@index([updatedAt], map: "post_comment_updated_at_idx")
  @@map("post_comment")
}

model PostReport {
  id                BigInt    @id @default(autoincrement())
  postId            BigInt    @map("post_id")
  reporterAccountId String    @map("reporter_account_id") @db.Uuid
  reason            String
  detail            String?
  snapshot          Json
  resolution        String?
  resolvedBy        String?   @map("resolved_by")
  resolutionNote    String?   @map("resolution_note")
  resolvedAt        DateTime? @map("resolved_at") @db.Timestamptz(6)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  @@unique([postId, reporterAccountId], map: "post_report_post_reporter_unique")
  @@index([reporterAccountId, createdAt], map: "post_report_reporter_created_at_idx")
  @@index([createdAt], map: "post_report_unresolved_created_at_idx", where: raw("(resolved_at IS NULL)"))
  @@index([createdAt], map: "post_report_created_at_idx")
  @@index([updatedAt], map: "post_report_updated_at_idx")
  @@map("post_report")
}

model PostCommentReport {
  id                BigInt    @id @default(autoincrement())
  commentId         BigInt    @map("comment_id")
  reporterAccountId String    @map("reporter_account_id") @db.Uuid
  reason            String
  detail            String?
  snapshot          Json
  resolution        String?
  resolvedBy        String?   @map("resolved_by")
  resolutionNote    String?   @map("resolution_note")
  resolvedAt        DateTime? @map("resolved_at") @db.Timestamptz(6)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  @@unique([commentId, reporterAccountId], map: "post_comment_report_comment_reporter_unique")
  @@index([reporterAccountId, createdAt], map: "post_comment_report_reporter_created_at_idx")
  @@index([createdAt], map: "post_comment_report_unresolved_created_at_idx", where: raw("(resolved_at IS NULL)"))
  @@index([createdAt], map: "post_comment_report_created_at_idx")
  @@index([updatedAt], map: "post_comment_report_updated_at_idx")
  @@map("post_comment_report")
}
```

- [ ] **Step 4: `npm run db:generate` + `npm run db:pull` 무 diff 확인 + 커밋** — `git commit -m "feat: 게시판 4테이블 마이그레이션·Prisma 모델 추가"`

---

### Task 2: 도메인 코어 — types · schema · rate-limit

**Files:**
- Create: `modules/posts/types.ts`, `modules/posts/lib/schema.ts`, `modules/posts/lib/rate-limit.ts`
- Test: `tests/modules/posts/lib/schema.test.ts`, `tests/modules/posts/lib/rate-limit.test.ts`

**Interfaces:**
- Produces: enum·라벨 상수, DTO(capability 포함), zod 스키마(입력·searchParams·snapshot), `RATE_LIMITS`, `assertWithinRateLimit(windows, counter)`.

- [ ] **Step 1: `types.ts`**

```ts
export const POST_TOPICS = ["talk", "info", "question"] as const;
export type PostTopic = (typeof POST_TOPICS)[number];
export const POST_TOPIC_LABELS: Record<PostTopic, string> = {
  talk: "잡담",
  info: "정보",
  question: "질문",
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
  commentCount: number;
};

// 댓글 DTO — status·capability는 서버 계산(viewer 기준). authorCode는 표시 전용.
export type PostComment = {
  id: number;
  parentId: number | null;
  authorName: string;
  authorCode: string;
  createdAt: string;
  status: "visible" | "deleted" | "hidden";
  body: string | null;         // visible 또는 (hidden && 본인)일 때만
  hiddenReason: string | null; // hidden && 본인일 때만
  canEdit: boolean;
  canDelete: boolean;
  canReply: boolean;
  canReport: boolean;
  replies: PostComment[];
};

export type PostDetailView = {
  post: Post;
  capabilities: { canEdit: boolean; canDelete: boolean; canReport: boolean };
  comments: PostComment[];
};

export type MyPost = Post & { status: "visible" | "hidden"; hiddenReason: string | null };

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
```

- [ ] **Step 2: `schema.test.ts` (실패 테스트)**

```ts
import { describe, expect, it } from "vitest";
import {
  postCreateSchema, commentCreateSchema, reportCreateSchema, dismissSchema,
  postListParamsSchema, POST_TITLE_MAX, POST_BODY_MAX, COMMENT_BODY_MAX,
} from "@/modules/posts/lib/schema";

describe("postCreateSchema", () => {
  const valid = { topic: "talk", title: "제목", body: "본문" };
  it("정상 입력 통과", () => {
    expect(postCreateSchema.parse(valid).topic).toBe("talk");
  });
  it("topic은 필수·enum만 — 생략/오값 거부", () => {
    expect(() => postCreateSchema.parse({ title: "t", body: "b" })).toThrow();
    expect(() => postCreateSchema.parse({ ...valid, topic: "notice" })).toThrow();
  });
  it("trim 후 공백만인 제목·본문 거부", () => {
    expect(() => postCreateSchema.parse({ ...valid, title: "   " })).toThrow();
    expect(() => postCreateSchema.parse({ ...valid, body: "\n\t " })).toThrow();
  });
  it("길이 상한(제목 80·본문 5,000)", () => {
    expect(() => postCreateSchema.parse({ ...valid, title: "가".repeat(POST_TITLE_MAX + 1) })).toThrow();
    expect(() => postCreateSchema.parse({ ...valid, body: "가".repeat(POST_BODY_MAX + 1) })).toThrow();
  });
});

describe("commentCreateSchema", () => {
  it("parentId 없거나 양의 정수, 본문 필수·상한", () => {
    expect(commentCreateSchema.parse({ postId: 1, body: "안녕" }).parentId).toBeUndefined();
    expect(commentCreateSchema.parse({ postId: 1, parentId: 3, body: "답글" }).parentId).toBe(3);
    expect(() => commentCreateSchema.parse({ postId: 1, body: "   " })).toThrow();
    expect(() => commentCreateSchema.parse({ postId: 1, body: "가".repeat(COMMENT_BODY_MAX + 1) })).toThrow();
  });
});

describe("reportCreateSchema", () => {
  it("reason enum만, detail 선택·상한, 공백 detail은 undefined 정규화", () => {
    expect(reportCreateSchema.parse({ targetId: 1, reason: "spam" }).reason).toBe("spam");
    expect(reportCreateSchema.parse({ targetId: 1, reason: "spam", detail: "   " }).detail).toBeUndefined();
    expect(() => reportCreateSchema.parse({ targetId: 1, reason: "bogus" })).toThrow();
    expect(() => reportCreateSchema.parse({ targetId: 1, reason: "spam", detail: "가".repeat(501) })).toThrow();
  });
});

describe("dismissSchema", () => {
  it("target 판별자 필수(post|comment) — 두 신고 테이블 ID 독립", () => {
    expect(dismissSchema.parse({ target: "post", reportId: 1 }).target).toBe("post");
    expect(() => dismissSchema.parse({ reportId: 1 })).toThrow();
    expect(() => dismissSchema.parse({ target: "user", reportId: 1 })).toThrow();
  });
});

describe("postListParamsSchema", () => {
  it("잘못된 topic·page는 기본값으로 관용 파싱, q는 trim", () => {
    const parsed = postListParamsSchema.parse({ topic: "bogus", page: "-3", q: "  검색어  " });
    expect(parsed.topic).toBeUndefined();
    expect(parsed.page).toBe(1);
    expect(parsed.q).toBe("검색어");
  });
});
```

- [ ] **Step 3: `schema.ts` (테스트 통과)**

```ts
import { z } from "zod";
import { POST_TOPICS, REPORT_REASONS, REPORT_TARGETS } from "../types";

export const POST_TITLE_MAX = 80;
export const POST_BODY_MAX = 5_000;
export const COMMENT_BODY_MAX = 1_000;
export const REPORT_DETAIL_MAX = 500;
export const HIDE_REASON_MAX = 500;
export const RESOLUTION_NOTE_MAX = 1_000;
export const POST_PAGE_SIZE = 20;

// rate limit 이중 윈도. 신고는 글·댓글 신고 COUNT "합산" 상한(스펙 §9).
export const RATE_LIMITS = {
  post:    [{ seconds: 3600, max: 5 }, { seconds: 86_400, max: 20 }],
  comment: [{ seconds: 60, max: 5 },   { seconds: 3600, max: 60 }],
  report:  [{ seconds: 600, max: 5 },  { seconds: 86_400, max: 20 }],
} as const;

const trimmed = (max: number, label: string) =>
  z.string().trim()
    .min(1, `${label}을 입력해주세요`)
    .max(max, `${label}은 ${max.toLocaleString()}자 이내여야 합니다`);

// 선택 입력 — trim 후 빈 값이면 undefined 정규화(빈 문자열 저장 방지).
const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => {
      if (v == null) return undefined;
      if (typeof v !== "string") return v;
      const t = v.trim();
      return t === "" ? undefined : t;
    },
    z.string().max(max).optional(),
  );

const positiveId = z.number().int().positive();

export const postCreateSchema = z.object({
  topic: z.enum(POST_TOPICS),
  title: trimmed(POST_TITLE_MAX, "제목"),
  body: trimmed(POST_BODY_MAX, "본문"),
});
export const postUpdateSchema = postCreateSchema.extend({ id: positiveId });
export const idSchema = positiveId; // 삭제·숨김·해제 등 단일 ID 입력 검증

export const commentCreateSchema = z.object({
  postId: positiveId,
  parentId: positiveId.optional(),
  body: trimmed(COMMENT_BODY_MAX, "댓글"),
});
export const commentUpdateSchema = z.object({ id: positiveId, body: trimmed(COMMENT_BODY_MAX, "댓글") });

export const reportCreateSchema = z.object({
  targetId: positiveId,
  reason: z.enum(REPORT_REASONS),
  detail: optionalTrimmed(REPORT_DETAIL_MAX),
});

export const hideSchema = z.object({ targetId: positiveId, reason: trimmed(HIDE_REASON_MAX, "숨김 사유") });
export const unhideSchema = z.object({ targetId: positiveId });
// 단독 resolve는 dismissed 전용 — actioned는 숨김 tx에서만 세팅(§Global Constraints).
export const dismissSchema = z.object({
  target: z.enum(REPORT_TARGETS),
  reportId: positiveId,
  note: optionalTrimmed(RESOLUTION_NOTE_MAX),
});

// 공개 목록 searchParams — 관용 파싱(오값은 기본값), q는 trim.
export const postListParamsSchema = z.object({
  topic: z.enum(POST_TOPICS).optional().catch(undefined),
  q: optionalTrimmed(POST_TITLE_MAX).catch(undefined),
  page: z.coerce.number().int().positive().catch(1).default(1),
});

// 신고 스냅샷 v1(텍스트 전용) — Plan 3에서 사진 키는 version 확장으로.
export const postReportSnapshotV1 = z.object({
  version: z.literal(1),
  title: z.string(),
  body: z.string(),
  authorName: z.string(),
  authorCode: z.string(),
  updatedAt: z.string(),
});
export const commentReportSnapshotV1 = z.object({
  version: z.literal(1),
  body: z.string(),
  authorName: z.string(),
  authorCode: z.string(),
  updatedAt: z.string(),
});

export type PostCreateInput = z.input<typeof postCreateSchema>;
export type PostUpdateInput = z.input<typeof postUpdateSchema>;
export type CommentCreateInput = z.input<typeof commentCreateSchema>;
export type CommentUpdateInput = z.input<typeof commentUpdateSchema>;
export type ReportCreateInput = z.input<typeof reportCreateSchema>;
```

- [ ] **Step 4: `rate-limit.ts` + 테스트** — 테스트: 윈도별 counter 반환값 조작 → 초과 시 throw·미만 통과·두 윈도 중 하나만 초과해도 거부.

```ts
import "server-only";

type Window = { seconds: number; max: number };
type Counter = (since: Date) => Promise<number>;

// 이중 윈도 COUNT — 어느 윈도든 max 이상이면 도메인 에러.
// counter는 호출부가 스코프 주입(글/댓글 = account_id, 신고 = 두 테이블 합산 — mutations 참조).
export async function assertWithinRateLimit(
  windows: readonly Window[],
  counter: Counter,
): Promise<void> {
  for (const w of windows) {
    const since = new Date(Date.now() - w.seconds * 1000);
    if ((await counter(since)) >= w.max) {
      throw new Error("요청이 너무 잦습니다. 잠시 후 다시 시도해주세요");
    }
  }
}
```

- [ ] **Step 5: `npm run validate` + 커밋** — `git commit -m "feat: 게시판 도메인 코어(타입·zod·rate limit) 추가"`

---

### Task 3: transform + queries (읽기 계층)

**Files:**
- Create: `modules/posts/lib/transform.ts`, `modules/posts/lib/queries.ts`
- Test: `tests/modules/posts/lib/transform.test.ts`, `tests/modules/posts/lib/queries.test.ts`

**Interfaces:**
- Produces: `toPost`, `buildCommentTree(rows, viewerAccountId)`, `listPosts`, `getPostByPublicCode`, `getEditablePost`, `listMyPosts`, `listReportQueue`, `listAdminPosts` (전부 db 주입형).

- [ ] **Step 1: `transform.ts`**

```ts
import "server-only";
import type { Post as PrismaPost, PostComment as PrismaComment } from "@prisma/client";
import type { Post, PostComment, PostTopic } from "../types";

export function toPost(row: PrismaPost, commentCount: number): Post {
  return {
    id: Number(row.id),
    publicCode: row.publicCode,
    topic: row.topic as PostTopic,
    title: row.title,
    body: row.body,
    authorName: row.authorName,
    authorCode: row.authorCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    commentCount,
  };
}

// 댓글 1건 → DTO. 마스킹 규칙:
//   - deleted가 hidden보다 우선(삭제면 본인이라도 본문 비노출)
//   - 본문·사유는 status === "hidden" && 본인일 때만 예외 노출
// capability는 서버 계산 — UI는 이 값만 사용, mutation은 소유권 재검증(2중).
function toComment(row: PrismaComment, viewerAccountId: string | null): PostComment {
  const isOwner = viewerAccountId !== null && row.accountId === viewerAccountId;
  const status = row.deletedAt !== null ? "deleted" : row.hiddenAt !== null ? "hidden" : "visible";
  const ownHidden = status === "hidden" && isOwner;
  return {
    id: Number(row.id),
    parentId: row.parentId !== null ? Number(row.parentId) : null,
    authorName: row.authorName,
    authorCode: row.authorCode,
    createdAt: row.createdAt.toISOString(),
    status,
    body: status === "visible" || ownHidden ? row.body : null,
    hiddenReason: ownHidden ? row.hiddenReason : null,
    canEdit: isOwner && status === "visible",
    canDelete: isOwner && status !== "deleted", // 숨김 댓글은 삭제만 허용
    canReply: viewerAccountId !== null && status === "visible" && row.parentId === null,
    canReport: viewerAccountId !== null && !isOwner && status === "visible",
    replies: [],
  };
}

// 평면 rows → 2단 트리. created_at ASC, id ASC(동시각 tiebreaker).
// 리프 필터: 노출하지 않을 댓글(삭제·타인 숨김)은 ① 답글(항상 리프)이면 제거,
// ② 최상위는 답글이 남아 있을 때만 플레이스홀더로 유지(트리 붕괴 방지).
// 본인 숨김(hiddenReason 노출)은 리프여도 유지 — 작성자 통보 경로.
export function buildCommentTree(
  rows: PrismaComment[],
  viewerAccountId: string | null,
): PostComment[] {
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(a.id - b.id),
  );
  const dtoById = new Map<number, PostComment>();
  const roots: PostComment[] = [];
  for (const row of sorted) {
    const dto = toComment(row, viewerAccountId);
    dtoById.set(dto.id, dto);
    if (dto.parentId === null) roots.push(dto);
    else dtoById.get(dto.parentId)?.replies.push(dto);
  }
  const keep = (c: PostComment) => c.status === "visible" || c.hiddenReason !== null;
  for (const root of roots) {
    root.replies = root.replies.filter(keep); // 답글 리프 — 삭제·타인 숨김 제거
  }
  return roots.filter((c) => keep(c) || c.replies.length > 0);
}
```

- [ ] **Step 2: `transform.test.ts`** — ①visible 본문 노출 ②deleted → body null(본인 포함 — **deleted+hidden 조합도 body null**) ③hidden(타인) → body·사유 null ④hidden(본인) → body+사유 ⑤capability 매트릭스(본인/타인 × visible/hidden/deleted, canReply는 최상위·visible·로그인만) ⑥트리 조립·tiebreaker ⑦**리프 필터 정합**: 삭제·타인 숨김 답글 제거 / 본인 숨김 답글 유지 / 답글 있는 숨김 최상위 플레이스홀더 유지 / 답글 없는 숨김·삭제 최상위 제거.

- [ ] **Step 3: `queries.ts`**

```ts
import "server-only";
import { db as defaultDb } from "@/lib/db";
import { POST_PAGE_SIZE } from "./schema";
import { toPost, buildCommentTree } from "./transform";
import type {
  Post, PostDetailView, MyPost, ReportQueueItem, AdminPostItem, PostTopic,
  ReportReason, TargetStatus,
} from "../types";

type Db = typeof defaultDb;
const VISIBLE = { hiddenAt: null, deletedAt: null } as const;

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export async function listPosts(
  filter: { topic?: PostTopic; q?: string; page?: number },
  db: Db = defaultDb,
): Promise<Page<Post>> {
  const page = filter.page ?? 1;
  const where = {
    ...VISIBLE,
    ...(filter.topic ? { topic: filter.topic } : {}),
    ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" as const } } : {}),
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
  const counts = rows.length
    ? await db.postComment.groupBy({
        by: ["postId"],
        where: { postId: { in: rows.map((r) => r.id) }, ...VISIBLE },
        _count: { _all: true },
      })
    : [];
  const countByPost = new Map(counts.map((c) => [c.postId.toString(), c._count._all]));
  return {
    items: rows.map((r) => toPost(r, countByPost.get(r.id.toString()) ?? 0)),
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
): Promise<PostDetailView | null> {
  const row = await db.post.findFirst({ where: { publicCode: code, ...VISIBLE } });
  if (!row) return null;
  const commentRows = await db.postComment.findMany({
    where: { postId: row.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const isOwner = viewerAccountId !== null && row.accountId === viewerAccountId;
  const visibleCount = commentRows.filter((c) => !c.hiddenAt && !c.deletedAt).length;
  return {
    post: toPost(row, visibleCount),
    capabilities: {
      canEdit: isOwner,
      canDelete: isOwner,
      canReport: viewerAccountId !== null && !isOwner,
    },
    comments: buildCommentTree(commentRows, viewerAccountId),
  };
}

// 수정 페이지 전용 — publicCode + 본인 + 미삭제. 숨김이면 locked(수정 잠금 안내, 삭제만).
export async function getEditablePost(
  publicCode: string,
  accountId: string,
  db: Db = defaultDb,
): Promise<{ post: Post; locked: boolean } | null> {
  const row = await db.post.findFirst({ where: { publicCode, accountId, deletedAt: null } });
  if (!row) return null;
  return { post: toPost(row, 0), locked: row.hiddenAt !== null };
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
  return {
    items: rows.map((r) => ({
      ...toPost(r, 0),
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

// 댓글 신고의 effective status — 상위 글 상태를 함께 반영(글이 숨김·삭제·누락이면 댓글도
// 사실상 비노출이므로 숨김 액션이 잘못 활성화되지 않게 한다). 우선순위: missing → deleted → hidden → visible.
function effectiveCommentStatus(
  comment: { hiddenAt: Date | null; deletedAt: Date | null } | undefined,
  post: { hiddenAt: Date | null; deletedAt: Date | null } | undefined,
): TargetStatus {
  if (!comment || !post) return "missing";
  if (comment.deletedAt || post.deletedAt) return "deleted";
  if (comment.hiddenAt || post.hiddenAt) return "hidden";
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
  return {
    items: rows.map((r) => ({
      id: Number(r.id), publicCode: r.publicCode, topic: r.topic as PostTopic,
      title: r.title, authorName: r.authorName, authorCode: r.authorCode,
      status: r.deletedAt ? "deleted" as const : r.hiddenAt ? "hidden" as const : "visible" as const,
      hiddenReason: r.hiddenAt && !r.deletedAt ? r.hiddenReason : null,
      createdAt: r.createdAt.toISOString(),
    })),
    total, page, pageSize: POST_PAGE_SIZE,
  };
}
```

- [ ] **Step 4: `queries.test.ts`** — VISIBLE 필터·탭·검색·페이지네이션 인자·댓글수 집계 / 상세 404 동일(숨김·삭제 null)·capability / `getEditablePost`(타인 null·숨김 locked) / 내 글 페이지네이션·status / 신고 큐: 병합 정렬·targetStatus 4종(missing 포함)·**댓글 effective status(댓글 visible이어도 상위 글 hidden/deleted/missing이면 그 상태로)**·reporter 마스킹·페이지네이션 / admin 목록: 상태 필터 3종·검색.

- [ ] **Step 5: 커밋** — `git commit -m "feat: 게시판 읽기 계층(변환·조회·admin 목록) 추가"`

---

### Task 4: 글 mutations + actions

**Files:**
- Create: `modules/posts/lib/mutations.ts`(글), `modules/posts/actions/post.ts`, `modules/posts/actions/index.ts`
- Test: `tests/modules/posts/lib/mutations.post.test.ts`, `tests/modules/posts/actions/post.test.ts`

**Interfaces:**
- Produces: `createPost`·`updatePost`·`deletePost`(모두 `{ postPublicCode }` 반환) + `requireOwnedPost`. 액션 동명.

- [ ] **Step 1: `mutations.ts` — 글 CRUD**

```ts
import "server-only";
import { db as defaultDb } from "@/lib/db";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { generatePublicCode } from "@/lib/public-code";
import { assertWithinRateLimit } from "./rate-limit";
import { RATE_LIMITS } from "./schema";

type Db = typeof defaultDb;
type Author = { id: string; displayName: string; publicCode: string };
const MAX_CODE_RETRY = 3;

// 사전 조회 — 친화적 에러 메시지 용도(인가 근거 아님). 미존재·타인·삭제를 같은 에러로.
async function requireOwnedPost(
  db: Db, accountId: string, id: bigint,
): Promise<{ publicCode: string; hiddenAt: Date | null }> {
  const post = await db.post.findFirst({
    where: { id, accountId, deletedAt: null },
    select: { publicCode: true, hiddenAt: true },
  });
  if (!post) throw new Error("글을 찾을 수 없습니다");
  return post;
}

export async function createPost(
  author: Author,
  input: { topic: string; title: string; body: string },
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  await assertWithinRateLimit(RATE_LIMITS.post, (since) =>
    db.post.count({ where: { accountId: author.id, createdAt: { gte: since } } }),
  );
  for (let attempt = 0; ; attempt++) {
    try {
      const row = await db.post.create({
        data: {
          accountId: author.id,
          publicCode: generatePublicCode(),
          topic: input.topic,
          title: input.title,
          body: input.body,
          authorName: author.displayName,
          authorCode: author.publicCode,
        },
        select: { publicCode: true },
      });
      return { postPublicCode: row.publicCode };
    } catch (error) {
      if (isUniqueViolationOn(error, "public_code") && attempt < MAX_CODE_RETRY - 1) continue;
      throw error;
    }
  }
}

export async function updatePost(
  accountId: string,
  input: { id: number; topic: string; title: string; body: string },
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.id);
  const post = await requireOwnedPost(db, accountId, id);
  if (post.hiddenAt) throw new Error("운영 검토 중인 글은 수정할 수 없습니다");
  // 최종 인가 = 원자적 조건부 UPDATE — 조회 후 숨김·삭제가 끼어들면 0행(TOCTOU 차단).
  const updated = await db.post.updateMany({
    where: { id, accountId, deletedAt: null, hiddenAt: null },
    data: { topic: input.topic, title: input.title, body: input.body, updatedAt: new Date() },
  });
  if (updated.count === 0) throw new Error("글을 수정할 수 없습니다");
  return { postPublicCode: post.publicCode };
}

export async function deletePost(
  accountId: string, postId: number, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(postId);
  const post = await requireOwnedPost(db, accountId, id); // 숨김 글도 삭제 허용(§ 삭제만)
  const result = await db.post.updateMany({
    where: { id, accountId, deletedAt: null },
    data: { deletedAt: new Date(), updatedAt: new Date() },
  });
  if (result.count === 0) throw new Error("글을 찾을 수 없습니다");
  return { postPublicCode: post.publicCode };
}
```

- [ ] **Step 2: 글 mutations 테스트** — rate limit(윈도별)·code P2002 재시도·소유 404(타인/미존재/삭제 동일 에러)·숨김 수정 잠금·**TOCTOU: updateMany 0행 → 에러**(사전 조회 통과 후 차단 시나리오)·숨김 글 삭제 허용·반환 postPublicCode.

- [ ] **Step 3: `actions/post.ts` + `actions/index.ts`**

```ts
// modules/posts/actions/post.ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { idSchema, postCreateSchema, postUpdateSchema } from "../lib/schema";
import * as m from "../lib/mutations";

async function requireAccount() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  return account;
}
function revalidatePost(code?: string) {
  revalidatePath("/posts");
  revalidatePath("/posts/my");
  if (code) revalidatePath(`/posts/${code}`);
}

export async function createPost(input: unknown): Promise<{ postPublicCode: string }> {
  const account = await requireAccount();
  const data = postCreateSchema.parse(input);
  const result = await m.createPost(
    { id: account.id, displayName: account.displayName, publicCode: account.publicCode }, data,
  );
  revalidatePost(result.postPublicCode);
  return result;
}
export async function updatePost(input: unknown): Promise<{ postPublicCode: string }> {
  const account = await requireAccount();
  const data = postUpdateSchema.parse(input);
  const result = await m.updatePost(account.id, data);
  revalidatePost(result.postPublicCode);
  return result;
}
export async function deletePost(postId: number): Promise<void> {
  const account = await requireAccount();
  const id = idSchema.parse(postId);
  const result = await m.deletePost(account.id, id);
  revalidatePost(result.postPublicCode);
}
```

```ts
// modules/posts/actions/index.ts — 재노출(conventions.md 폴더 승격 형태)
export { createPost, updatePost, deletePost } from "./post";
export { createComment, updateComment, deleteComment } from "./comment";
export { reportPost, reportComment } from "./report";
export { hidePost, hideComment, unhidePost, unhideComment, dismissReport } from "./moderation";
```

- [ ] **Step 4: 액션 테스트(글 3종 × 3케이스)** — happy(위임·revalidate 경로) / 비로그인(redirect, mutation 미호출) / zod 실패(mutation 미호출).
- [ ] **Step 5: 커밋** — `git commit -m "feat: 게시판 글 mutations·액션(작성·수정·삭제) 추가"`

---

### Task 5: 댓글 mutations + actions (FOR UPDATE·1단 불변식)

**Files:**
- Modify: `modules/posts/lib/mutations.ts` / Create: `modules/posts/actions/comment.ts`
- Test: `tests/modules/posts/lib/mutations.comment.test.ts`, `tests/modules/posts/actions/comment.test.ts`

- [ ] **Step 1: `createComment` — tx + FOR UPDATE(잠금 순서 post → comment)**

```ts
export async function createComment(
  author: Author,
  input: { postId: number; parentId?: number; body: string },
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const postId = BigInt(input.postId);
  await assertWithinRateLimit(RATE_LIMITS.comment, (since) =>
    db.postComment.count({ where: { accountId: author.id, createdAt: { gte: since } } }),
  );
  return db.$transaction(async (tx) => {
    // ① 글 행 잠금 + 노출 재검증 — 숨김/삭제 tx(updateMany 행 잠금)와 직렬화되어
    //    "숨김 확정 후 댓글 삽입" 경쟁을 차단한다. 잠금 순서 규약: post 먼저.
    const posts = await tx.$queryRaw<{ public_code: string }[]>`
      SELECT public_code FROM post
      WHERE id = ${postId} AND hidden_at IS NULL AND deleted_at IS NULL
      FOR UPDATE`;
    const post = posts[0];
    if (!post) throw new Error("댓글을 달 수 없습니다");

    // ② 답글이면 부모 잠금 + 불변식: 같은 글 소속 · 최상위 · 노출 상태.
    if (input.parentId !== undefined) {
      const parents = await tx.$queryRaw<{ parent_id: bigint | null }[]>`
        SELECT parent_id FROM post_comment
        WHERE id = ${BigInt(input.parentId)} AND post_id = ${postId}
          AND hidden_at IS NULL AND deleted_at IS NULL
        FOR UPDATE`;
      const parent = parents[0];
      if (!parent || parent.parent_id !== null) {
        throw new Error("답글을 달 수 없는 댓글입니다");
      }
    }

    await tx.postComment.create({
      data: {
        postId,
        accountId: author.id,
        parentId: input.parentId !== undefined ? BigInt(input.parentId) : null,
        body: input.body,
        authorName: author.displayName,
        authorCode: author.publicCode,
      },
    });
    return { postPublicCode: post.public_code };
  });
}
```

- [ ] **Step 2: 수정·삭제 — 원자적 조건부 UPDATE + 무결성 에러**

```ts
async function postCodeOf(db: Db, postId: bigint): Promise<string> {
  const post = await db.post.findFirst({ where: { id: postId }, select: { publicCode: true } });
  // FK 없는 스키마에서 소속 글 부재 = 데이터 무결성 위반 — 조용히 넘기지 않는다.
  if (!post) throw new Error(`데이터 무결성 오류: 댓글의 소속 글(${postId})이 없습니다`);
  return post.publicCode;
}

export async function updateComment(
  accountId: string, input: { id: number; body: string }, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.id);
  const existing = await db.postComment.findFirst({
    where: { id, accountId, deletedAt: null },
    select: { postId: true, hiddenAt: true },
  });
  if (!existing) throw new Error("댓글을 찾을 수 없습니다");
  if (existing.hiddenAt) throw new Error("운영 검토 중인 댓글은 수정할 수 없습니다");
  const updated = await db.postComment.updateMany({
    where: { id, accountId, deletedAt: null, hiddenAt: null }, // TOCTOU 차단
    data: { body: input.body, updatedAt: new Date() },
  });
  if (updated.count === 0) throw new Error("댓글을 수정할 수 없습니다");
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
  if (!existing) throw new Error("댓글을 찾을 수 없습니다");
  const updated = await db.postComment.updateMany({
    where: { id, accountId, deletedAt: null }, // 숨김 댓글도 삭제 허용
    data: { deletedAt: new Date(), updatedAt: new Date() },
  });
  if (updated.count === 0) throw new Error("댓글을 삭제할 수 없습니다");
  return { postPublicCode: await postCodeOf(db, existing.postId) };
}
```

- [ ] **Step 3: 불변식 테스트 11종** — ①정상 최상위 ②정상 1단 답글 ③부재 부모 ④타 글 부모 ⑤답글에 답글 ⑥삭제 부모 ⑦숨김 부모 ⑧숨김 글 ⑨삭제 글 ⑩수정 TOCTOU(updateMany 0행) ⑪소속 글 부재 무결성 에러. `$transaction`·`$queryRaw` mock으로 잠금 쿼리 결과 주입.

- [ ] **Step 4: `actions/comment.ts` + 테스트(3종 × 3케이스)** — post.ts와 동일 구조. revalidate는 상세 경로 포함.
- [ ] **Step 5: 커밋** — `git commit -m "feat: 게시판 댓글 mutations·액션(FOR UPDATE·1단 불변식) 추가"`

---

### Task 6: 신고 + admin 모더레이션

**Files:**
- Modify: `modules/posts/lib/mutations.ts` / Create: `modules/posts/actions/report.ts`, `modules/posts/actions/moderation.ts`
- Test: `tests/modules/posts/lib/mutations.report.test.ts`, `tests/modules/posts/actions/{report,moderation}.test.ts`

- [ ] **Step 1: 신고 생성 — tx + FOR UPDATE + 합산 rate limit + 스냅샷 v1**

```ts
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
      const rows = await tx.$queryRaw<{
        account_id: string; title: string; body: string;
        author_name: string; author_code: string; updated_at: Date;
      }[]>`
        SELECT account_id, title, body, author_name, author_code, updated_at
        FROM post
        WHERE id = ${postId} AND hidden_at IS NULL AND deleted_at IS NULL
        FOR UPDATE`;
      const post = rows[0];
      if (!post) throw new Error("신고할 수 없습니다");
      if (post.account_id === reporterAccountId) throw new Error("본인 글은 신고할 수 없습니다");
      await tx.postReport.create({
        data: {
          postId, reporterAccountId,
          reason: input.reason, detail: input.detail ?? null,
          snapshot: {
            version: 1, title: post.title, body: post.body,
            authorName: post.author_name, authorCode: post.author_code,
            updatedAt: post.updated_at.toISOString(),
          },
        },
      });
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "post_id")) throw new Error("이미 신고한 글입니다");
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
      if (!ref) throw new Error("신고할 수 없습니다");
      // ② 상위 post 선잠금 + 노출 재검증 — hidePost와 직렬화.
      const posts = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM post
        WHERE id = ${ref.postId} AND hidden_at IS NULL AND deleted_at IS NULL
        FOR UPDATE`;
      if (!posts[0]) throw new Error("신고할 수 없습니다");
      // ③ 댓글 잠금 + 소속·노출·작성자 재검증 — hideComment와 직렬화.
      const comments = await tx.$queryRaw<{
        account_id: string; body: string;
        author_name: string; author_code: string; updated_at: Date;
      }[]>`
        SELECT account_id, body, author_name, author_code, updated_at
        FROM post_comment
        WHERE id = ${commentId} AND post_id = ${ref.postId}
          AND hidden_at IS NULL AND deleted_at IS NULL
        FOR UPDATE`;
      const comment = comments[0];
      if (!comment) throw new Error("신고할 수 없습니다");
      if (comment.account_id === reporterAccountId) {
        throw new Error("본인 댓글은 신고할 수 없습니다");
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
    if (isUniqueViolationOn(error, "comment_id")) throw new Error("이미 신고한 댓글입니다");
    throw error;
  }
}
```

- [ ] **Step 2: 숨김/해제 — 원자 tx + `{ postPublicCode }` 반환**

```ts
type Admin = { id: string };

// 숨김 = 대상 hidden_* 스탬프 + 그 시점의 미처리 신고 일괄 actioned(동일 tx).
// updateMany의 행 잠금이 createComment/createReport의 FOR UPDATE와 직렬화된다.
export async function hidePost(
  admin: Admin, input: { targetId: number; reason: string }, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.targetId);
  return db.$transaction(async (tx) => {
    const post = await tx.post.findFirst({ where: { id }, select: { publicCode: true } });
    if (!post) throw new Error("글을 찾을 수 없습니다");
    const now = new Date();
    const updated = await tx.post.updateMany({
      where: { id, deletedAt: null, hiddenAt: null },
      data: { hiddenAt: now, hiddenReason: input.reason, hiddenBy: admin.id, updatedAt: now },
    });
    if (updated.count === 0) throw new Error("숨길 수 없는 글입니다");
    await tx.postReport.updateMany({
      where: { postId: id, resolvedAt: null },
      data: { resolution: "actioned", resolvedBy: admin.id, resolvedAt: now, updatedAt: now },
    });
    return { postPublicCode: post.publicCode };
  });
}

export async function unhidePost(
  admin: Admin, targetId: number, db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(targetId);
  const post = await db.post.findFirst({ where: { id }, select: { publicCode: true } });
  if (!post) throw new Error("글을 찾을 수 없습니다");
  const updated = await db.post.updateMany({
    where: { id, deletedAt: null, hiddenAt: { not: null } },
    data: { hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: new Date() },
  });
  if (updated.count === 0) throw new Error("해제할 수 없는 글입니다");
  return { postPublicCode: post.publicCode };
}

// hideComment/unhideComment — 동일 구조(대상 post_comment + post_comment_report resolve).
// 반환 postPublicCode는 postCodeOf(무결성 에러 포함)로 조회.

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
  if (updated.count === 0) throw new Error("이미 처리된 신고입니다");
}
```

- [ ] **Step 3: 테스트** — 본인 차단·숨김/삭제 대상 신고 불가(잠금 재검증 0행)·**댓글 신고: 상위 글이 숨김/삭제면 거부(post 선잠금 재검증 — 댓글이 visible이어도)**·스냅샷 v1 동결(`postReportSnapshotV1.parse` 통과)·중복 P2002 → "이미 신고"·**합산 rate limit(글 3+댓글 2 신고 후 6번째 거부)**·숨김+미처리 신고 actioned 원자성·이미 숨김 재숨김 0행 에러·해제(조건부 0행 포함)·dismiss target 분리(**두 테이블 동일 ID 공존 시 지정 테이블만 갱신**)·dismiss가 대상 콘텐츠 미변경.

- [ ] **Step 4: `actions/report.ts`·`actions/moderation.ts` + 테스트(각 액션 3케이스)** — report: requireAccount. moderation: **`requireAdmin()`을 parse보다 먼저 호출**(호출 순서 검증 테스트 포함), revalidate = 상세·`/posts`·`/admin/posts`.
- [ ] **Step 5: 커밋** — `git commit -m "feat: 게시판 신고·admin 숨김/해제/기각 추가"`

---

### Task 7: 공개 UI — 목록·상세·댓글·작성·내 글

**Files:**
- Create: `app/(shop)/posts/{page,new/page}.tsx`, `app/(shop)/posts/[publicCode]/{page,edit/page}.tsx`, `app/(shop)/posts/my/page.tsx`
- Create: `modules/posts/components/{PostList,PostCard,PostDetail,CommentThread,CommentForm,PostForm,ReportDialog,MyPosts}.tsx`

**Interfaces:** Consumes queries(Task 3)·actions(Task 4-6)·DTO capability(Task 2). UI는 서버 계산 capability만 사용 — 클라이언트 소유권 판단 금지.

- [ ] **Step 1: `PostForm`** (NoticeForm 미러) — topic Select(`POST_TOPICS[0]`="잡담" 프리셀렉트)·title·body. `createPost`/`updatePost`, 성공 시 `router.push(`/posts/${postPublicCode}`)`. sonner toast.
- [ ] **Step 2: `/posts` 목록** — `postListParamsSchema.parse(searchParams)`로 topic·q·page 관용 파싱 → `listPosts`. 탭([전체/잡담/정보/질문])·제목 검색·페이지네이션. **상단에 "공지사항" 진입 링크(`/notices`) 배치**(스펙: 공지 진입 = 홈 스트립 + 커뮤니티 내부 링크). `PostCard` = 말머리 뱃지·제목·`작성자 #코드`·시각·댓글수.
- [ ] **Step 3: `CommentThread`·`CommentForm`** — 2단 렌더. status별: visible=본문 / deleted="삭제된 댓글입니다" / hidden(타인)="운영 정책 위반으로 숨김 처리된 댓글입니다" / hidden(본인)=본문+"숨김: {사유}" 뱃지. 버튼은 DTO의 `canEdit`·`canDelete`·`canReply`·`canReport` 그대로. 본문 `whitespace-pre-wrap break-words`.
- [ ] **Step 4: `ReportDialog`** — reason Select + detail. `reportPost`/`reportComment`, 중복·rate limit 에러 toast.
- [ ] **Step 5: `PostDetail` + 상세 라우트** — `getCurrentAccount()`로 viewer 전달, `getPostByPublicCode` null → `notFound()`(숨김·삭제·미존재 404 동일). `capabilities`로 수정/삭제/신고 버튼.
- [ ] **Step 6: 작성·수정·내 글 라우트** — `/posts/new`: 비로그인 `redirect("/login")`. `/posts/[publicCode]/edit`: `getEditablePost` null → notFound, `locked` → "운영 검토 중" 안내(수정 불가·삭제만). `/posts/my`: `listMyPosts(accountId, page)` + 숨김 상태·사유 표시 + 페이지네이션. Metadata 타입·장식 아이콘 `aria-hidden`.
- [ ] **Step 7: `npm run validate` + 커밋** — `git commit -m "feat: 게시판 공개 화면(목록·상세·댓글·작성·내 글) 추가"`

---

### Task 8: admin 화면 — 신고 큐 + 전체 글 검색(해제 진입점)

**Files:**
- Create: `app/(admin)/admin/posts/page.tsx`, `modules/posts/components/{ReportQueue,PostsAdminTable}.tsx`
- Modify: `modules/admin/components/AdminSidebar.tsx`

- [ ] **Step 1: `/admin/posts` 구성** — 탭 2개: **신고 큐**(기본) · **전체 글**. searchParams로 탭·검색·상태 필터·page.
- [ ] **Step 2: `ReportQueue`** — `listReportQueue(page)`. 컬럼: 대상(글/댓글)·snapshot 요약(`postReportSnapshotV1`/`commentReportSnapshotV1`.safeParse로 표시)·사유·`reporterMasked`·시각·`targetStatus` 뱃지. 액션: 숨김(사유 Dialog)·기각(메모 Dialog — `dismissReport(target, id, note)`). **targetStatus가 deleted·missing이면 숨김 비활성(기각만)**, hidden이면 "이미 숨김" 표시(기각만).
- [ ] **Step 3: `PostsAdminTable`** — `listAdminPosts({ q, status, page })`. 상태 필터(전체/노출/숨김/삭제)·제목 검색·페이지네이션. 행 액션: visible → 숨김 / hidden → **해제**(+사유 표시) / deleted → 액션 없음(상태만). 상세 링크는 visible만.
- [ ] **Step 4: AdminSidebar** — "게시판" 항목(MessageSquare, `/admin/posts`, matchPrefix, 공지사항 아래).
- [ ] **Step 5: 커밋** — `git commit -m "feat: admin 게시판 신고 큐·전체 글 검색 화면 추가"`

---

### Task 9: 헤더 "커뮤니티" 진입점

**Files:** Modify: `app/(shop)/layout.tsx`

- [ ] **Step 1: 헤더에 `/posts` "커뮤니티" 텍스트 링크 추가** — 검색과 SNS 아이콘 사이. 모바일에서도 상시 노출(기존 SNS nav의 `hidden sm:flex`와 달리 항상 표시).
- [ ] **Step 2: `npm run validate` + 커밋** — `git commit -m "feat: 헤더에 커뮤니티(게시판) 진입 링크 추가"`

---

## 최종 단계

- `npm run validate` 그린 · `npm run db:reset` 클린.
- **실DB 동시성 검증(수동 스크립트 — 저장소에 실DB 테스트 레인 없음, 리뷰 합의 방식)**: 2-세션
  psql/스크립트로 **5시나리오 × 양방향** — hide 선행 → 생성·신고가 잠금 대기 후 거부 /
  생성·신고 선행 → hide가 대기한 뒤 그 신고까지 `actioned` 처리(post 신고의 경우).
  ① post report vs hidePost ② comment report vs hideComment ③ **comment report vs hidePost**
  ④ comment vs hidePost ⑤ reply vs hideComment. 재현 스크립트와 결과 기록을 저장소에 커밋한다.
- **신고 RLS 검증 SQL**: 비-owner `app` 롤 + GUC로 일반 유저 `INSERT … RETURNING` 통과 / 타인 신고 SELECT 0행 / admin SELECT·UPDATE 통과 / DELETE 거부 — owner 접속은 RLS 우회이므로 별도 필수.
- `dev:all` 수동 E2E: 작성→댓글→답글→신고→admin 숨김(신고 actioned 확인)→본인 사유 확인→전체 글 탭에서 해제→재노출.
- 최종 whole-branch 리뷰(opus) → `feat/community`로 PR.

## Self-Review 체크리스트 (작성자용)

- [ ] 스펙 post 계열 요구 전부 매핑 — 글·댓글·신고·숨김/해제/기각·**전체 글 검색**·rate limit(신고 합산)·내글·헤더 링크·**커뮤니티 내 공지 링크**. 사진만 의도적 제외(Plan 3).
- [ ] 동시성 — 생성·신고는 tx+FOR UPDATE(잠금 순서 post→comment), 상태 변경은 전부 원자적 조건부 updateMany(count 검증), 사전 조회는 메시지 용도임이 명시됨.
- [ ] 신고 의미론 — resolve 대상 판별자, dismissed 전용 단독 resolve, actioned은 숨김 tx 한정, 스냅샷 version 1.
- [ ] capability — 서버 계산 DTO, authorCode 인가 사용 금지, mutation 소유권 재검증.
- [ ] 반환/revalidate 계약 — 전 mutation `postPublicCode`, 무결성 에러(빈 문자열 금지).
- [ ] Plan 1 확정 반영 — public_code CHECK 없음·enum DB default 없음·`isUniqueViolationOn`·partial `where: raw` 미러.
- [ ] 구조/테스트 정책 — actions 폴더 분리(conventions), 전 액션 3케이스+admin 선호출 검증(test-policy).
