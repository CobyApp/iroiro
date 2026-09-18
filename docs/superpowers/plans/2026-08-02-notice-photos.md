# 공지사항 사진 첨부 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin이 공지에 사진(최대 10장)을 첨부하고, 공개 상세에서 본문 아래에 표시한다.

**Architecture:** 상품 admin 사진 파이프라인(첨부 즉시 presign→PUT, 저장 시 키 기록)을 공지로 확장한다. 사진은 공개 버킷 `notices/original/{uuidv7}.{ext}`에 저장하고 `R2_PUBLIC_BASE` URL로 직서빙한다. 재사용 가능한 클라이언트 프리미티브는 `lib/photo-client.ts`로 승격해 posts·notices가 공유한다(아키텍처 룰 1 — 도메인 간 직접 의존 금지).

**Tech Stack:** Next.js 16 · Prisma 7(adapter-pg) · Supabase Postgres(app 롤 + GRANT) · R2/MinIO(aws4fetch presign) · vitest(Prisma-mock 스타일)

**스펙(단일 진실):** `docs/superpowers/specs/2026-08-02-notice-photos-design.md` — 이 계획과 다르면 스펙이 우선.

## Global Constraints

- 허용 포맷 3종: `["image/jpeg", "image/png", "image/webp"]` — HEIC 거부 문구는 정확히 `"지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)"`
- 수량·크기: 최대 **10장**, 파일당 **5MB**(`5 * 1024 * 1024`), 합계 상한 없음
- R2 키: `notices/original/{uuidv7}.{ext}` · 저장 계약의 prefix 정규식: `/^notices\/original\/[^/]+$/`
- `display_order` = 제출 배열 index(서버 부여). 수정은 **전체 교체**(`deleteMany` → `createMany`)
- `notice_photo`는 불변(append-only): `updated_at` 없음, GRANT는 `SELECT, INSERT, DELETE`만
- 본문 렌더는 plain text 유지. 목록 계열(`listNotices`·`listHomeNotices`)의 DTO `photos`는 빈 배열
- `lib/photo-client.ts`에 `import "server-only"` 금지(클라이언트 컴포넌트가 import)
- 커밋 메시지는 `agent/rules/commit-message.md` 형식(한국어 제목, bullet 본문). 커밋 전 보안 리뷰는 세션 관례(security-officer 수동 리뷰 후 `--no-verify`)를 따른다
- 마이그레이션은 `supabase/migrations/20260720002722_init_notice.sql` **in-place 수정**(pre-launch 관례) 후 `npm run db:reset` 재적용 — reset은 로컬 계정을 지우므로 이후 수동 확인 시 `is_admin` 재지정 필요

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| Create `lib/photo-client.ts` | 클라이언트 사진 프리미티브(허용 타입·재인코딩·PUT 재시도) — posts·notices 공용 |
| Modify `modules/posts/lib/schema.ts` · `photo-upload-client.ts` · `components/PostPhotoUploader.tsx` | 승격된 심볼의 import 경로 전환(동작 불변) |
| Modify `supabase/migrations/20260720002722_init_notice.sql` · `prisma/schema.prisma` | `notice_photo` 테이블·모델 |
| Modify `modules/notices/lib/schema.ts` · `types.ts` · `lib/transform.ts` · `lib/queries.ts` | 저장 계약 `photos` · DTO `photos` · 상세 조회 포함 |
| Modify `modules/notices/actions.ts` · `lib/r2/presign.ts` | `presignNoticePhotos` · `buildNoticeR2Key` · 저장 반영 |
| Create `modules/notices/components/NoticePhotoUploader.tsx` · Modify `NoticeForm.tsx` | admin 업로더 UI |
| Modify `app/(shop)/notices/[publicCode]/page.tsx` | 본문 아래 사진 렌더 |
| Modify `README.md` · `docs/environment-variables.md` · `docs/r2-adoption.md` | `R2_BUCKET` 용도 문구 3곳 |

---

### Task 1: `lib/photo-client.ts` 승격 (동작 불변 리팩토링)

**Files:**
- Create: `lib/photo-client.ts`
- Modify: `modules/posts/lib/schema.ts:13-23` (상수 3개 제거·import 추가)
- Modify: `modules/posts/lib/photo-upload-client.ts` (moved 심볼 제거·import 전환)
- Modify: `modules/posts/components/PostPhotoUploader.tsx:7-12` (import 전환)
- Modify: `tests/modules/posts/lib/photo-upload-client.test.ts:2` (import 전환)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `lib/photo-client.ts`의 `PHOTO_ALLOWED_TYPES: readonly ["image/jpeg","image/png","image/webp"]` · `PHOTO_CLIENT_MAX_DIMENSION = 4096` · `PHOTO_UPLOAD_TIMEOUT_MS = 30000` · `HEIC_TYPES: string[]` · `UNSUPPORTED_TYPE_MESSAGE: string` · `type PutFn = (url: string, blob: Blob) => Promise<{ status: number }>` · `putWithRetry(put: PutFn, url: string, blob: Blob): Promise<void>` · `reencodeToBlob(file: File, maxDimension: number): Promise<Blob>`

- [ ] **Step 1: `lib/photo-client.ts` 생성** — 아래 전문. putWithRetry·reencodeToBlob 본문과 주석은 `modules/posts/lib/photo-upload-client.ts`의 기존 코드를 **그대로 옮긴 것**이다(로직 수정 금지).

```ts
// 브라우저 표시용 업로드 사진의 공용 클라이언트 프리미티브 — posts·notices가 공유한다.
// 도메인 정책 상수(장수·합계 상한)는 각 도메인 schema가 소유하고, 여기는 포맷·전송 계층만 둔다.
// 클라이언트 컴포넌트가 import하므로 "server-only" 금지.

export const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const; // HEIC 미지원(P2-4)
export const PHOTO_CLIENT_MAX_DIMENSION = 4_096; // 클라 canvas 리사이즈 상한(긴 변)
export const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
export const HEIC_TYPES = ["image/heic", "image/heif"];
export const UNSUPPORTED_TYPE_MESSAGE = "지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)";

export type PutFn = (url: string, blob: Blob) => Promise<{ status: number }>;

// PUT 재시도 규칙(P2-2 확정): 네트워크 오류·5xx만 1회 재시도.
// 재시도 412 = 최초 PUT이 이미 성공(If-None-Match:*) 후 응답 유실 — 성공 간주(서버 검증이 최종 판정).
// 최초 412 = 새 임시 키가 이미 선점된 비정상 상태 — 실패.
// 실 R2 주의(2026-08-01 게이트): 실 R2에서 관측한 크기 계약 위반의 `403 SignatureDoesNotMatch`
// 응답에는 CORS 헤더가 없어 브라우저에 네트워크 오류로 전달된다(모든 R2 오류 응답의 일반 규칙이
// 아니다 — 같은 게이트에서 412는 판독됐다).
// 즉 위반은 아래 4xx 분기가 아니라 재시도 경로를 타고 실패한다.
// 강제는 서버에서 성립하므로(객체 미생성) 안전하고, 정상 사용자는 선언 크기 = 실제 Blob이라 무관하다.
// 따라서 실패 메시지는 원인을 단정하지 말 것 — "네트워크 오류" 단정 문구 금지.
export async function putWithRetry(put: PutFn, url: string, blob: Blob): Promise<void> {
  const attempt = async (): Promise<{ status: number } | null> => {
    try {
      return await put(url, blob);
    } catch {
      return null; // 네트워크 오류 또는 CORS로 읽히지 않는 거부 응답(실 R2 크기 위반)
    }
  };
  const first = await attempt();
  if (first && (first.status === 200 || first.status === 204)) return;
  if (first && first.status < 500) {
    throw new Error(`사진 업로드에 실패했습니다 (${first.status})`);
  }
  const second = await attempt();
  if (second && (second.status === 200 || second.status === 204 || second.status === 412)) return;
  throw new Error("사진 업로드에 실패했습니다. 다시 시도해주세요");
}

// 브라우저 전용 — canvas 재인코딩·리사이즈(긴 변 maxDimension). EXIF 등 메타데이터 제거 시도(보조 수단).
export async function reencodeToBlob(file: File, maxDimension: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas 미지원");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, 0.9),
    );
    if (!blob) throw new Error("재인코딩 실패");
    return blob;
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 2: `modules/posts/lib/schema.ts`에서 이동 상수 제거** — 13-23줄 영역에서 아래 3줄을 **삭제**하고, 파일 상단에 import를 추가한다(`PHOTO_ALLOWED_TYPES`는 이 파일의 presign zod `z.enum(...)`이 계속 쓰므로 lib에서 가져온다).

삭제할 줄:
```ts
export const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const; // HEIC 미지원(P2-4)
export const PHOTO_CLIENT_MAX_DIMENSION = 4_096; // 클라 canvas 리사이즈 상한(긴 변)
export const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
```

추가할 import (기존 `import { z } from "zod";` 아래):
```ts
import { PHOTO_ALLOWED_TYPES } from "@/lib/photo-client";
```

유지: `PHOTO_MAX_COUNT` · `PHOTO_MAX_FILE_BYTES` · `PHOTO_MAX_TOTAL_BYTES` · `PHOTO_MAX_DIMENSION` · `PHOTO_RETRY_CODE`(posts 도메인 정책).

- [ ] **Step 3: `modules/posts/lib/photo-upload-client.ts`에서 moved 심볼 제거·import 전환**

파일 상단 import를 다음으로 교체:
```ts
// 클라 업로드 순수 로직(P1-1 순서 계약) — 컴포넌트는 이 모듈의 얇은 배선만 담당한다.
// deps DI(reencode·presign·put)로 브라우저 API 없이 단위 테스트한다(리뷰 P2-5).
import {
  HEIC_TYPES,
  PHOTO_ALLOWED_TYPES,
  UNSUPPORTED_TYPE_MESSAGE,
  putWithRetry,
  type PutFn,
} from "@/lib/photo-client";
import { PHOTO_MAX_COUNT, PHOTO_MAX_FILE_BYTES, PHOTO_MAX_TOTAL_BYTES } from "./schema";
```

그리고:
- `const HEIC_TYPES = ...`와 `const UNSUPPORTED_TYPE_MESSAGE = ...` 로컬 정의 2줄 삭제
- `PreparePhotoDeps`의 `put` 타입을 `put: PutFn;`으로 교체
- `putWithRetry` 함수 정의(주석 블록 포함)와 `reencodeToBlob` 함수 정의(주석 포함)를 **통째로 삭제** (lib로 이동됨)
- `preparePhotos`·`revokePreviews`·타입들은 그대로 유지

- [ ] **Step 4: `modules/posts/components/PostPhotoUploader.tsx` import 전환** — 기존:

```ts
import {
  PHOTO_CLIENT_MAX_DIMENSION,
  PHOTO_MAX_COUNT,
  PHOTO_UPLOAD_TIMEOUT_MS,
} from "../lib/schema";
import { preparePhotos, reencodeToBlob, type UploadedPhotoItem } from "../lib/photo-upload-client";
```

를 다음으로 교체(다른 코드는 무수정):
```ts
import {
  PHOTO_CLIENT_MAX_DIMENSION,
  PHOTO_UPLOAD_TIMEOUT_MS,
  reencodeToBlob,
} from "@/lib/photo-client";
import { PHOTO_MAX_COUNT } from "../lib/schema";
import { preparePhotos, type UploadedPhotoItem } from "../lib/photo-upload-client";
```

- [ ] **Step 5: `putWithRetry` 테스트를 mirror 위치로 이동** — `agent/rules/test-policy.md`의 매트릭스에서 `lib/*.ts`(분기 있는 횡단 유틸)는 **필수 · 1:1 비율**이고 테스트는 src 트리를 mirror한다(`lib/photo-client.ts` → `tests/lib/photo-client.test.ts`). `putWithRetry`가 lib로 이동했으므로 그 테스트도 함께 옮긴다.

**Create `tests/lib/photo-client.test.ts`** — 아래 전문. describe 블록 4케이스는 `tests/modules/posts/lib/photo-upload-client.test.ts:122-164`에서 **그대로 옮긴 것**(내용 수정 금지):

```ts
import { describe, expect, it, vi } from "vitest";
import { putWithRetry } from "@/lib/photo-client";

const jpegBlob = (size = 1000) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });

describe("putWithRetry — 재시도 규칙(P2-2 확정)", () => {
  // 이 403 분기는 same-origin·비-R2 저장소용 방어다. 실 R2에서 크기 계약 위반의 403은
  // CORS 헤더가 없어 브라우저가 읽지 못하고 fetch가 throw하므로, 아래 "네트워크 오류" 케이스가
  // 실제 위반 경로를 담당한다(2026-08-01 게이트 발견 — Global Constraints 참조).
  it("200/204 즉시 성공, 4xx(403)는 재시도 없이 실패", async () => {
    await expect(
      putWithRetry(vi.fn(async () => ({ status: 204 })), "u", jpegBlob()),
    ).resolves.toBeUndefined();
    const put403 = vi.fn(async () => ({ status: 403 }));
    await expect(putWithRetry(put403, "u", jpegBlob())).rejects.toThrow("403");
    expect(put403).toHaveBeenCalledTimes(1);
  });

  it("최초 412는 실패(임시 키 선점 — 비정상)", async () => {
    const put = vi.fn(async () => ({ status: 412 }));
    await expect(putWithRetry(put, "u", jpegBlob())).rejects.toThrow("412");
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("네트워크 오류·5xx는 1회 재시도, 재시도 412는 최초 성공 간주(If-None-Match:*)", async () => {
    const netThen412 = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({ status: 412 });
    await expect(putWithRetry(netThen412, "u", jpegBlob())).resolves.toBeUndefined();

    const fiveThen200 = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });
    await expect(putWithRetry(fiveThen200, "u", jpegBlob())).resolves.toBeUndefined();

    const bothFail = vi.fn().mockRejectedValue(new TypeError("network"));
    await expect(putWithRetry(bothFail, "u", jpegBlob())).rejects.toThrow();
    expect(bothFail).toHaveBeenCalledTimes(2);
  });

  it("timeout(AbortError)도 네트워크 오류로 취급 — 무한 대기 없이 사용자 오류로 끝난다(P2-2)", async () => {
    const timedOut = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(putWithRetry(timedOut, "u", jpegBlob())).rejects.toThrow(/다시 시도/);
    expect(timedOut).toHaveBeenCalledTimes(2); // 1회 재시도 후 종료(멈춘 채 매달리지 않음)
  });
});
```

**Modify `tests/modules/posts/lib/photo-upload-client.test.ts`**:
- 2줄째 import에서 `putWithRetry`를 제거: `import { preparePhotos } from "@/modules/posts/lib/photo-upload-client";`
- 122-164줄의 `describe("putWithRetry — 재시도 규칙(P2-2 확정)", ...)` 블록 **전체를 삭제**(위 새 파일로 이동함)
- 남는 `describe("preparePhotos — 순서 계약(P1-1)", ...)` 블록과 헬퍼는 그대로 둔다

- [ ] **Step 6: 이동·불변 확인**

Run: `npx vitest run tests/lib/photo-client.test.ts tests/modules/posts/ && npx tsc --noEmit`
Expected: 전부 PASS(putWithRetry 4케이스가 새 위치에서, preparePhotos 5케이스가 기존 위치에서) · 타입 에러 0. `reencodeToBlob`은 순수 브라우저 API 래퍼(canvas·createImageBitmap)라 별도 테스트를 만들지 않는다 — 기존에도 없었고 jsdom에서 canvas 인코딩이 동작하지 않는다.

- [ ] **Step 7: Commit**

```bash
git add lib/photo-client.ts tests/lib/photo-client.test.ts modules/posts/lib/schema.ts modules/posts/lib/photo-upload-client.ts modules/posts/components/PostPhotoUploader.tsx tests/modules/posts/lib/photo-upload-client.test.ts
git commit -m "refactor: 사진 클라이언트 프리미티브를 lib/photo-client로 승격

- 공지 사진(스펙 2026-08-02)이 재사용할 포맷·재인코딩·PUT 재시도를
  lib로 올려 도메인 간 직접 의존(룰 1 위반)을 방지
- 장수·합계 상한 등 도메인 정책 상수는 posts schema에 유지"
```

---

### Task 2: `notice_photo` 테이블 + Prisma 모델

**Files:**
- Modify: `supabase/migrations/20260720002722_init_notice.sql` (`notice` 전용 GRANT 자리에 `notice_photo` DDL 삽입 · GRANT는 파일 끝 통합 섹션으로)
- Modify: `prisma/schema.prisma:218` (`model Notice` 블록 내부에 `photos` 역방향 관계 추가 + 블록 직후에 `NoticePhoto` 모델 추가)

**Interfaces:**
- Consumes: 없음
- Produces: Prisma `NoticePhoto` 모델 — `{ id: BigInt; noticeId: BigInt; r2Key: string; displayOrder: number; createdAt: Date }`, 클라이언트 접근자 `db.noticePhoto`

- [ ] **Step 1: 마이그레이션에 테이블 추가** — `init_notice.sql`에서 `notice` 테이블의 `COMMENT` 블록 뒤에 있던 `notice` 전용 GRANT 2줄(`REVOKE ALL ON notice FROM ...` / `GRANT SELECT, INSERT, UPDATE ON notice TO app;`)을 제거하고 그 자리에 `notice_photo` DDL을 추가한다. GRANT는 `notice`·`notice_photo`를 함께 다루는 단일 섹션으로 파일 맨 끝에 새로 둔다(data-modeling.md:149 — GRANT는 파일 끝 전역 섹션). `notice.updated_by` COMMENT 아래부터 파일 끝까지 최종 형태:

```sql
-- ── 공지 첨부 사진 (스펙: docs/superpowers/specs/2026-08-02-notice-photos-design.md) ──
-- 전체 교체(delete+insert) 패턴이라 행이 불변 — updated_at 생략(data-modeling "불변 테이블" 규칙).
CREATE TABLE notice_photo
(
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    notice_id     BIGINT      NOT NULL,
    r2_key        TEXT        NOT NULL,
    display_order INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notice_photo_notice_id_idx ON notice_photo (notice_id, display_order);
CREATE UNIQUE INDEX notice_photo_r2_key_unique ON notice_photo (r2_key);
CREATE INDEX notice_photo_created_at_idx ON notice_photo (created_at);

COMMENT ON TABLE notice_photo IS '공지 첨부 사진';
COMMENT ON COLUMN notice_photo.id IS 'PK';
COMMENT ON COLUMN notice_photo.notice_id IS '공지 ID';
COMMENT ON COLUMN notice_photo.r2_key IS 'R2 객체 키 (notices/original/{uuidv7}.{ext})';
COMMENT ON COLUMN notice_photo.display_order IS '표시 순서 (저장 시 배열 index)';
COMMENT ON COLUMN notice_photo.created_at IS '생성일';

-- ============================================================================
-- GRANT — app 롤만(Data API 미노출).
--   - notice       : DELETE 미부여(soft delete 강제)
--   - notice_photo : 전체 교체(delete+insert) 패턴이라 행 불변 → UPDATE 미부여
-- ============================================================================
REVOKE ALL ON notice, notice_photo FROM anon, authenticated, app;
GRANT SELECT, INSERT, UPDATE ON notice TO app;
GRANT SELECT, INSERT, DELETE ON notice_photo TO app;
```

- [ ] **Step 2: Prisma 모델 추가** — `prisma/schema.prisma`의 `model Notice`에 역방향 관계 `photos NoticePhoto[]`를 추가하고, 그 블록 바로 아래에 `NoticePhoto` 모델을 추가한다. `notice` 스칼라 관계 필드도 함께 둔다 — `relationMode = "prisma"`라 DB FK는 생기지 않지만, 관계는 모델에 유지하는 것이 data-modeling.md 규칙이다(도메인 *내부* 참조라 `@relation` 선언 대상). 최종 형태:

```prisma
model Notice {
  id         BigInt        @id @default(autoincrement())
  publicCode String        @map("public_code")
  category   String        @default("general") // 'general' | 'event' — 앱 zod 검증
  title      String
  body       String
  isPinned   Boolean       @default(false) @map("is_pinned")
  deletedAt  DateTime?     @map("deleted_at") @db.Timestamptz(6)
  createdAt  DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  createdBy  String?       @map("created_by")
  updatedAt  DateTime      @default(now()) @map("updated_at") @db.Timestamptz(6)
  updatedBy  String?       @map("updated_by")
  photos     NoticePhoto[]

  @@unique([publicCode], map: "notice_public_code_unique")
  @@index([createdAt], map: "notice_created_at_idx")
  @@index([updatedAt], map: "notice_updated_at_idx")
  @@map("notice")
}

model NoticePhoto {
  id           BigInt   @id @default(autoincrement())
  noticeId     BigInt   @map("notice_id")
  r2Key        String   @map("r2_key")
  displayOrder Int      @default(0) @map("display_order")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  notice       Notice   @relation(fields: [noticeId], references: [id])

  @@unique([r2Key], map: "notice_photo_r2_key_unique")
  @@index([noticeId, displayOrder], map: "notice_photo_notice_id_idx")
  @@index([createdAt], map: "notice_photo_created_at_idx")
  @@map("notice_photo")
}
```

- [ ] **Step 3: 적용·생성 검증**

Run: `npm run db:reset && npm run db:generate && npx tsc --noEmit`
Expected: reset 클린 적용(에러 0) · generate 성공 · 타입 에러 0

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260720002722_init_notice.sql prisma/schema.prisma
git commit -m "feat: 공지 첨부 사진 notice_photo 테이블 추가

- 전체 교체 패턴이라 행 불변 — updated_at 생략, GRANT는 SELECT/INSERT/DELETE만
- r2_key UNIQUE + notice_id·created_at 인덱스 (FK 없음 규칙)"
```

---

### Task 3: 저장 계약·DTO·조회 — `photos` 필드

**Files:**
- Modify: `modules/notices/lib/schema.ts` (상수 2·`photos` 필드)
- Modify: `modules/notices/types.ts` (`NoticePhoto` 타입·`Notice.photos`)
- Modify: `modules/notices/lib/transform.ts` (`toNotice` 2번째 인자)
- Modify: `modules/notices/lib/queries.ts` (상세 2곳 photos 조회)
- Test: `tests/modules/notices/lib/transform.test.ts` · `tests/modules/notices/lib/queries.test.ts`

**Interfaces:**
- Consumes: Task 2의 `db.noticePhoto`
- Produces:
  - `NOTICE_PHOTO_MAX_COUNT = 10` · `NOTICE_PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024` (`modules/notices/lib/schema.ts`)
  - `noticeCreateSchema`에 `photos: string[]`(기본 `[]`) · `noticeUpdateSchema`에 `photos: string[]`(기본값 없음 — 전체 교체라 생략 시 전체 삭제를 막기 위함)
  - `type NoticePhoto = { r2Key: string; url: string }` · `Notice.photos: NoticePhoto[]` (`types.ts`)
  - `toNotice(row: PrismaNotice, photos?: { r2Key: string }[]): Notice` — photos 생략 시 `[]`

- [ ] **Step 1: 실패하는 transform 테스트 작성** — `tests/modules/notices/lib/transform.test.ts` 파일 상단(import 아래)에 mock 추가 + 기존 `toEqual` 기대값에 `photos: []` 추가 + 새 케이스 추가:

파일 상단에 추가:
```ts
vi.mock("@/lib/r2/presign", () => ({
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));
```
(`import { describe, expect, it, vi } from "vitest";`로 vi import 보강)

기존 케이스의 기대 객체에 `photos: [],` 한 줄 추가. 그리고 describe 안에 새 케이스:

```ts
it("photos 인자를 display 순서 그대로 URL 매핑한다", () => {
  const row = {
    id: 3n,
    publicCode: "AbCdEfGh1234",
    category: "event",
    title: "이벤트",
    body: "본문",
    isPinned: true,
    deletedAt: null,
    createdAt: new Date("2026-07-19T00:00:00Z"),
    createdBy: "mock-admin",
    updatedAt: new Date("2026-07-19T01:00:00Z"),
    updatedBy: "mock-admin",
  } satisfies PrismaNotice;

  const result = toNotice(row, [
    { r2Key: "notices/original/a.jpg" },
    { r2Key: "notices/original/b.webp" },
  ]);

  expect(result.photos).toEqual([
    { r2Key: "notices/original/a.jpg", url: "https://cdn.test/notices/original/a.jpg" },
    { r2Key: "notices/original/b.webp", url: "https://cdn.test/notices/original/b.webp" },
  ]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/modules/notices/lib/transform.test.ts`
Expected: FAIL — `photos` 미존재(기존 케이스 toEqual 불일치 + 새 케이스 undefined)

- [ ] **Step 3: 구현 — types·transform·schema**

`modules/notices/types.ts` — `Notice` 타입에 필드 추가 및 사진 타입 신설:
```ts
export type NoticePhoto = { r2Key: string; url: string };
```
`Notice`에 `photos: NoticePhoto[];` 추가(`isPinned` 아래).

`modules/notices/lib/transform.ts` 전문 교체:
```ts
import "server-only";

import type { Notice as PrismaNotice } from "@prisma/client";
import { getPublicUrl } from "@/lib/r2/presign";
import type { Notice, NoticeCategory } from "../types";

// deletedAt·created_by류는 DTO 미포함 — 공개·admin 화면 공통으로 노출 불필요.
// photos: 조회 계층이 display_order 순으로 넘긴다. 목록 계열은 생략(빈 배열) — 스펙 §조회·렌더.
export function toNotice(row: PrismaNotice, photos: { r2Key: string }[] = []): Notice {
  return {
    id: Number(row.id),
    publicCode: row.publicCode,
    category: row.category as NoticeCategory,
    title: row.title,
    body: row.body,
    isPinned: row.isPinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    photos: photos.map((photo) => ({
      r2Key: photo.r2Key,
      url: getPublicUrl(photo.r2Key),
    })),
  };
}
```

`modules/notices/lib/schema.ts` — `NOTICE_PIN_LIMIT` 아래에 추가:
```ts
export const NOTICE_PHOTO_MAX_COUNT = 10;
export const NOTICE_PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024; // 파일당 5MB

// r2Key prefix 검사 — 타 도메인 키·경로 오입력을 데이터 경계에서 차단 (스펙 §업로드 플로우)
const photosSchema = z
  .array(z.string().regex(/^notices\/original\/[^/]+$/, "잘못된 사진 키입니다"))
  .max(NOTICE_PHOTO_MAX_COUNT, `사진은 최대 ${NOTICE_PHOTO_MAX_COUNT}장까지 첨부할 수 있습니다`);
```
`noticeCreateSchema`에는 `photos: photosSchema.default([]),`(`isPinned` 아래 — 생성은 빈 상태 시작이라 생략 = 없음으로 안전), `noticeUpdateSchema`에는 `photos: photosSchema,`(`isPinned` 아래 — 수정은 전체 교체라 생략이 곧 전체 삭제이므로 기본값을 두지 않아 호출부가 의도를 명시하게 강제한다) 필드를 각각 추가.

- [ ] **Step 4: transform 테스트 통과 확인**

Run: `npx vitest run tests/modules/notices/lib/transform.test.ts tests/modules/notices/lib/schema.test.ts`
Expected: PASS (schema.test는 기존 케이스가 `photos` 기본값 `[]`로 여전히 통과해야 한다 — 실패하면 기대 객체에 `photos: []` 추가)

- [ ] **Step 5: `actions.test.ts`에 presign mock 선반영** — transform이 이제 `getPublicUrl`을 import하므로, actions 테스트가 실제 `lib/r2` → `lib/env` 체인을 타지 않도록 mock을 지금 추가한다(Task 4의 presign 테스트도 이 mock을 그대로 쓴다). `tests/modules/notices/actions.test.ts` 상단의 다른 `vi.mock` 블록들 옆에:

```ts
const { mockGetSignedUploadUrl, mockBuildNoticeR2Key } = vi.hoisted(() => ({
  mockGetSignedUploadUrl: vi.fn(async () => "https://r2.test/upload?sig"),
  mockBuildNoticeR2Key: vi.fn(() => "notices/original/mock.jpg"),
}));
vi.mock("@/lib/r2/presign", () => ({
  getSignedUploadUrl: mockGetSignedUploadUrl,
  buildNoticeR2Key: mockBuildNoticeR2Key,
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));
```

Run: `npx vitest run tests/modules/notices/actions.test.ts` — 기존 16케이스 그대로 PASS 확인.

- [ ] **Step 6: 실패하는 queries 테스트 추가** — `tests/modules/notices/lib/queries.test.ts`:

mock 블록을 다음으로 교체(파일 상단):
```ts
const findMany = vi.fn();
const findFirst = vi.fn();
const photoFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    notice: { findMany, findFirst },
    noticePhoto: { findMany: photoFindMany },
  },
}));

vi.mock("@/lib/r2/presign", () => ({
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));
```

`beforeEach`에 `photoFindMany.mockReset().mockResolvedValue([]);` 추가. describe 안에 새 케이스 2개:

```ts
it("getNoticeByPublicCode — 사진을 display_order 순으로 포함한다", async () => {
  photoFindMany.mockResolvedValue([
    { id: 1n, noticeId: 1n, r2Key: "notices/original/a.jpg", displayOrder: 0, createdAt: new Date() },
  ]);
  const { getNoticeByPublicCode } = await import("@/modules/notices/lib/queries");
  const result = await getNoticeByPublicCode("AbCdEfGh1234");

  expect(photoFindMany).toHaveBeenCalledWith({
    where: { noticeId: 1n },
    orderBy: { displayOrder: "asc" },
  });
  expect(result?.photos).toEqual([
    { r2Key: "notices/original/a.jpg", url: "https://cdn.test/notices/original/a.jpg" },
  ]);
});

it("listNotices — 목록은 사진을 조회하지 않는다(빈 배열)", async () => {
  const { listNotices } = await import("@/modules/notices/lib/queries");
  const result = await listNotices();
  expect(photoFindMany).not.toHaveBeenCalled();
  expect(result[0].photos).toEqual([]);
});
```

- [ ] **Step 7: 실패 확인**

Run: `npx vitest run tests/modules/notices/lib/queries.test.ts`
Expected: FAIL — `photoFindMany` 미호출

- [ ] **Step 8: queries 구현** — `modules/notices/lib/queries.ts`의 상세 2개 함수를 교체:

```ts
// 상세 계열만 사진 포함 — 목록은 미조회(스펙 §조회·렌더 YAGNI). display_order 순.
async function fetchPhotos(noticeId: bigint) {
  return db.noticePhoto.findMany({
    where: { noticeId },
    orderBy: { displayOrder: "asc" },
  });
}

export async function getNoticeByPublicCode(
  code: string,
): Promise<Notice | null> {
  const row = await db.notice.findFirst({
    where: { publicCode: code, deletedAt: null },
  });
  if (!row) return null;
  return toNotice(row, await fetchPhotos(row.id));
}

export async function getNoticeById(id: number): Promise<Notice | null> {
  const row = await db.notice.findFirst({
    where: { id: BigInt(id), deletedAt: null },
  });
  if (!row) return null;
  return toNotice(row, await fetchPhotos(row.id));
}
```

- [ ] **Step 9: 통과 확인**

Run: `npx vitest run tests/modules/notices/ && npx tsc --noEmit`
Expected: 전부 PASS (actions.test.ts 기존 케이스가 `photos` 기본값으로 흔들리면 이 시점엔 아직 actions 미수정이므로 그대로 PASS여야 정상), 타입 에러 0

- [ ] **Step 10: Commit**

```bash
git add modules/notices/lib/schema.ts modules/notices/types.ts modules/notices/lib/transform.ts modules/notices/lib/queries.ts tests/modules/notices/lib/transform.test.ts tests/modules/notices/lib/queries.test.ts
git commit -m "feat: 공지 DTO·저장 계약에 photos 추가 — 상세 조회만 사진 포함

- photos는 r2Key 배열(prefix zod 검사) — display_order는 서버가 배열 index로 부여
- DTO는 {r2Key, url} 단일 형태: admin 수정 폼의 전체 교체 재제출에 r2Key 필요
- 목록 계열은 사진 미조회(빈 배열) — 스펙 §조회·렌더"
```

---

### Task 4: `presignNoticePhotos` 액션 + `buildNoticeR2Key`

**Files:**
- Modify: `lib/r2/presign.ts` (`buildR2Key` 아래 함수 1개)
- Modify: `modules/notices/actions.ts`
- Test: `tests/modules/notices/actions.test.ts`

**Interfaces:**
- Consumes: Task 1의 `PHOTO_ALLOWED_TYPES`(lib) · Task 3의 `NOTICE_PHOTO_MAX_COUNT`/`NOTICE_PHOTO_MAX_FILE_BYTES` · 기존 `getSignedUploadUrl(key, contentType)`
- Produces: `buildNoticeR2Key(filename: string): string` · `presignNoticePhotos(files: { filename: string; mimeType: string; sizeBytes: number }[]): Promise<ActionResult<{ r2Key: string; uploadUrl: string }[]>>`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/modules/notices/actions.test.ts`에 추가. presign mock은 **Task 3 Step 5에서 선반영한** `mockGetSignedUploadUrl`·`mockBuildNoticeR2Key`를 그대로 사용한다(중복 `vi.mock` 금지).

describe 추가(기존 admin 세션 스텁 헬퍼 — `mockGetCurrentAccount`가 admin 계정을 반환하도록 세팅하는 기존 beforeEach/헬퍼 — 를 그대로 사용):

```ts
describe("presignNoticePhotos", () => {
  const file = { filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 1000 };

  it("비관리자는 재던져진다 (ok:false 아님)", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    await expect(presignNoticePhotos([file])).rejects.toThrow();
  });

  it("빈 배열은 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([]);
    expect(result).toEqual({ ok: false, message: "파일이 없습니다" });
  });

  it("11장은 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos(Array.from({ length: 11 }, () => file));
    expect(result.ok).toBe(false);
  });

  it("HEIC 등 미지원 MIME은 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([{ ...file, mimeType: "image/heic" }]);
    expect(result).toEqual({
      ok: false,
      message: "지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)",
    });
  });

  it("5MB 초과는 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([{ ...file, sizeBytes: 5 * 1024 * 1024 + 1 }]);
    expect(result.ok).toBe(false);
  });

  it("정상 요청은 파일별 {r2Key, uploadUrl}을 반환한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([file, { ...file, filename: "b.png", mimeType: "image/png" }]);
    expect(result).toEqual({
      ok: true,
      data: [
        { r2Key: "notices/original/mock.jpg", uploadUrl: "https://r2.test/upload?sig" },
        { r2Key: "notices/original/mock.jpg", uploadUrl: "https://r2.test/upload?sig" },
      ],
    });
    expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("notices/original/mock.jpg", "image/jpeg");
    expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("notices/original/mock.jpg", "image/png");
  });
});
```

주의: 이 파일의 기존 테스트들이 admin 세션을 어떻게 세팅하는지(beforeEach의 `mockGetCurrentAccount.mockResolvedValue({...isAdmin: true})` 형태)를 그대로 따르고, 비관리자 케이스만 위처럼 override 한다. 기존 파일에 이미 같은 취지의 헬퍼가 있으면 그것을 쓴다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/modules/notices/actions.test.ts`
Expected: FAIL — `presignNoticePhotos` export 없음. **주의**: 기존 케이스가 presign mock 추가로 깨지면 안 된다 — 깨지면 mock 경로 오타.

- [ ] **Step 3: `buildNoticeR2Key` 구현** — `lib/r2/presign.ts`의 `buildR2Key` 함수 아래에 추가:

```ts
// 공지 첨부 사진 키 — 상품과 동일 원칙(uuidv7·original 세그먼트·비샤딩).
// 설계: docs/superpowers/specs/2026-08-02-notice-photos-design.md
export function buildNoticeR2Key(filename: string): string {
  return `notices/original/${uuidv7()}.${extractExt(filename)}`;
}
```

- [ ] **Step 4: 액션 구현** — `modules/notices/actions.ts`에 추가. import 보강:

```ts
import { PHOTO_ALLOWED_TYPES, UNSUPPORTED_TYPE_MESSAGE } from "@/lib/photo-client";
import { buildNoticeR2Key, getSignedUploadUrl } from "@/lib/r2/presign";
```
schema import에 `NOTICE_PHOTO_MAX_COUNT, NOTICE_PHOTO_MAX_FILE_BYTES` 추가. 함수(파일 하단, `deleteNotice` 아래):

```ts
// 첨부 즉시 업로드용 presign — 상품 presignProductPhotos 동형(admin 신뢰 전제).
// Content-Length는 서명에 고정하지 않는다(스펙 §보안 — 의도된 미검증, UGC와 다름).
export async function presignNoticePhotos(
  files: { filename: string; mimeType: string; sizeBytes: number }[],
): Promise<ActionResult<{ r2Key: string; uploadUrl: string }[]>> {
  return runAction(async () => {
    await requireAdmin();
    if (files.length === 0) throw new DomainError("파일이 없습니다");
    if (files.length > NOTICE_PHOTO_MAX_COUNT) {
      throw new DomainError(`사진은 최대 ${NOTICE_PHOTO_MAX_COUNT}장까지 첨부할 수 있습니다`);
    }
    for (const file of files) {
      if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.mimeType)) {
        throw new DomainError(UNSUPPORTED_TYPE_MESSAGE);
      }
      if (file.sizeBytes > NOTICE_PHOTO_MAX_FILE_BYTES) {
        throw new DomainError(`파일 크기 초과 (5MB 이하): ${file.filename}`);
      }
    }
    return Promise.all(
      files.map(async (file) => {
        const r2Key = buildNoticeR2Key(file.filename);
        const uploadUrl = await getSignedUploadUrl(r2Key, file.mimeType);
        return { r2Key, uploadUrl };
      }),
    );
  });
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/modules/notices/actions.test.ts && npx tsc --noEmit`
Expected: PASS · 타입 에러 0

- [ ] **Step 6: Commit**

```bash
git add lib/r2/presign.ts modules/notices/actions.ts tests/modules/notices/actions.test.ts
git commit -m "feat: 공지 사진 presign 액션 추가 — 상품 동형, admin 신뢰 전제

- buildNoticeR2Key = notices/original/{uuidv7}.{ext} (경로 전략 대칭)
- 3종 MIME·5MB·10장 사전 검사, Content-Length 미서명은 스펙에 의도로 기록"
```

---

### Task 5: 저장 반영 — `createNotice`/`updateNotice`의 photos

**Files:**
- Modify: `modules/notices/actions.ts` (`createNotice`·`updateNotice` tx)
- Test: `tests/modules/notices/actions.test.ts`

**Interfaces:**
- Consumes: Task 3의 `photos` zod 필드 · Task 2의 `db.noticePhoto`
- Produces: create/update가 `photos: string[]` 입력을 받아 `notice_photo` 행으로 반영, 반환 DTO에 `photos: {r2Key, url}[]` 포함

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/modules/notices/actions.test.ts`:

tx mock 객체에 noticePhoto 추가 — `vi.mock("@/lib/db", ...)`의 tx 객체를 다음처럼 확장:

```ts
const photoCreateMany = vi.fn();
const photoDeleteMany = vi.fn();
```
(파일 상단 다른 `vi.fn()` 선언들 옆에 추가하고, tx 객체에 `noticePhoto: { createMany: photoCreateMany, deleteMany: photoDeleteMany },` 추가. `beforeEach`에 두 mock의 `mockReset()` 추가.)

케이스 추가:

```ts
it("createNotice — photos를 배열 index 순서로 createMany 한다", async () => {
  create.mockResolvedValue({ ...baseRow, id: 7n });
  const { createNotice } = await import("@/modules/notices/actions");
  const result = await createNotice({
    category: "general",
    title: "공지",
    body: "본문",
    isPinned: false,
    photos: ["notices/original/a.jpg", "notices/original/b.webp"],
  });

  expect(photoCreateMany).toHaveBeenCalledWith({
    data: [
      { noticeId: 7n, r2Key: "notices/original/a.jpg", displayOrder: 0 },
      { noticeId: 7n, r2Key: "notices/original/b.webp", displayOrder: 1 },
    ],
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data.photos.map((p) => p.r2Key)).toEqual([
      "notices/original/a.jpg",
      "notices/original/b.webp",
    ]);
  }
});

it("createNotice — photos가 없으면 createMany를 호출하지 않는다", async () => {
  create.mockResolvedValue(baseRow);
  const { createNotice } = await import("@/modules/notices/actions");
  await createNotice({ category: "general", title: "공지", body: "본문", isPinned: false });
  expect(photoCreateMany).not.toHaveBeenCalled();
});

it("createNotice — notices/original/ 밖의 키는 zod가 거부한다", async () => {
  const { createNotice } = await import("@/modules/notices/actions");
  const result = await createNotice({
    category: "general",
    title: "공지",
    body: "본문",
    isPinned: false,
    photos: ["products/original/steal.jpg"],
  });
  expect(result.ok).toBe(false);
});

it("updateNotice — 전체 교체: deleteMany 후 createMany", async () => {
  updateMany.mockResolvedValue({ count: 1 });
  findFirstOrThrow.mockResolvedValue(baseRow);
  const { updateNotice } = await import("@/modules/notices/actions");
  const result = await updateNotice({
    id: 1,
    category: "general",
    title: "공지",
    body: "본문",
    isPinned: false,
    photos: ["notices/original/keep.jpg"],
  });

  expect(photoDeleteMany).toHaveBeenCalledWith({ where: { noticeId: 1n } });
  expect(photoCreateMany).toHaveBeenCalledWith({
    data: [{ noticeId: 1n, r2Key: "notices/original/keep.jpg", displayOrder: 0 }],
  });
  expect(photoDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
    photoCreateMany.mock.invocationCallOrder[0],
  );
  expect(result.ok).toBe(true);
});

it("updateNotice — photos 빈 배열이면 deleteMany만 (전부 제거)", async () => {
  updateMany.mockResolvedValue({ count: 1 });
  findFirstOrThrow.mockResolvedValue(baseRow);
  const { updateNotice } = await import("@/modules/notices/actions");
  await updateNotice({
    id: 1,
    category: "general",
    title: "공지",
    body: "본문",
    isPinned: false,
    photos: [],
  });
  expect(photoDeleteMany).toHaveBeenCalledWith({ where: { noticeId: 1n } });
  expect(photoCreateMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/modules/notices/actions.test.ts`
Expected: 새 케이스 FAIL (`photoCreateMany` 미호출 / DTO에 photos 없음)

- [ ] **Step 3: 구현** — `modules/notices/actions.ts`:

`createNotice`의 tx 내부를 교체(공지 생성 후 사진 기록, 반환은 사진 포함):
```ts
const row = await db.$transaction(async (tx) => {
  if (data.isPinned) await assertPinCapacity(tx);
  const created = await tx.notice.create({
    data: {
      publicCode: generatePublicCode(),
      category: data.category,
      title: data.title,
      body: data.body,
      isPinned: data.isPinned,
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });
  if (data.photos.length > 0) {
    await tx.noticePhoto.createMany({
      data: data.photos.map((r2Key, index) => ({
        noticeId: created.id,
        r2Key,
        displayOrder: index,
      })),
    });
  }
  return created;
});
revalidateNoticePaths(row.publicCode);
return toNotice(row, data.photos.map((r2Key) => ({ r2Key })));
```

`updateNotice`의 tx 내부 — 기존 `updateMany`(원자적 조건부 UPDATE)와 `findFirstOrThrow` 사이에 전체 교체 삽입:
```ts
if (updated.count === 0) throw new DomainError("공지를 찾을 수 없습니다");

// 사진 전체 교체 — 유지분은 r2Key 재제출(스펙 결정 6). 행 불변 패턴이라 UPDATE 없음.
await tx.noticePhoto.deleteMany({ where: { noticeId: id } });
if (data.photos.length > 0) {
  await tx.noticePhoto.createMany({
    data: data.photos.map((r2Key, index) => ({
      noticeId: id,
      r2Key,
      displayOrder: index,
    })),
  });
}

return tx.notice.findFirstOrThrow({ where: { id } });
```
`updateNotice`의 반환도 `return toNotice(row, data.photos.map((r2Key) => ({ r2Key })));`로 교체.

`deleteNotice`는 **무수정** — 공지 soft delete 시 `notice_photo` 행과 R2 객체를 유지한다(스펙 결정 7).

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/modules/notices/ && npx tsc --noEmit`
Expected: 전부 PASS · 타입 에러 0

- [ ] **Step 5: Commit**

```bash
git add modules/notices/actions.ts tests/modules/notices/actions.test.ts
git commit -m "feat: 공지 저장에 사진 반영 — 생성 createMany·수정 전체 교체

- display_order는 제출 배열 index — 순서 숫자를 받지 않아 중복·결번 검증 불필요
- 수정은 deleteMany 후 createMany (행 불변 패턴, 스펙 결정 6)"
```

---

### Task 6: admin UI — `NoticePhotoUploader` + `NoticeForm` 통합

**Files:**
- Create: `modules/notices/components/NoticePhotoUploader.tsx`
- Modify: `modules/notices/components/NoticeForm.tsx`

**Interfaces:**
- Consumes: Task 1의 lib/photo-client 전체 · Task 4의 `presignNoticePhotos` · Task 3의 `NOTICE_PHOTO_MAX_COUNT`/`NOTICE_PHOTO_MAX_FILE_BYTES` · `Notice.photos`
- Produces: `NoticePhotoItem = { r2Key: string; previewUrl: string }` · `<NoticePhotoUploader items onChange disabled onUploadingChange />`

**테스트 없음의 근거**: `agent/rules/test-policy.md` 매트릭스에서 인터랙션 컴포넌트는 **권장**(필수 아님)이고, 권장 도구인 RTL·user-event가 **미설치** 상태다(표 §프로젝트 표준 도구). 순수 로직은 `lib/photo-client`(putWithRetry)와 presign 액션 테스트가 이미 커버한다.

**posts의 `preparePhotos`를 재사용하지 않는 이유**(리뷰어가 중복으로 볼 수 있는 지점 — 판단 근거를 남긴다): 두 흐름은 구조만 닮았고 계약이 다르다 — ① presign 입력이 다르고(공지 `{filename, mimeType, sizeBytes}` vs posts `{contentType, sizeBytes}`) ② 반환 식별자가 다르며(`r2Key` vs `pendingPhotoId`) ③ 공지엔 합계 상한이 없고 ④ 공지 PUT엔 `If-None-Match`가 없다(서명에 없는 헤더). 공용화하려면 이미 배포·리뷰를 통과한 posts 함수를 제네릭으로 바꿔야 하는데, 호출부 2곳을 위한 추상화라 YAGNI에 걸리고 Task 1의 "동작 불변" 약속도 깨진다. 공유는 `lib/photo-client`의 프리미티브 수준에서 그친다.

- [ ] **Step 1: `NoticePhotoUploader.tsx` 생성** — 전문:

```tsx
"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HEIC_TYPES,
  PHOTO_ALLOWED_TYPES,
  PHOTO_CLIENT_MAX_DIMENSION,
  PHOTO_UPLOAD_TIMEOUT_MS,
  UNSUPPORTED_TYPE_MESSAGE,
  putWithRetry,
  reencodeToBlob,
} from "@/lib/photo-client";
import { presignNoticePhotos } from "../actions";
import { NOTICE_PHOTO_MAX_COUNT, NOTICE_PHOTO_MAX_FILE_BYTES } from "../lib/schema";

export type NoticePhotoItem = { r2Key: string; previewUrl: string };

type Props = {
  items: NoticePhotoItem[];
  onChange: (items: NoticePhotoItem[]) => void;
  disabled?: boolean;
  /** 업로드 중 폼 제출을 막기 위해 부모에 알린다 (posts P1-4 선례). */
  onUploadingChange?: (uploading: boolean) => void;
};

// admin 공지 첨부 전용 — 상품과 동일한 "첨부 즉시 업로드" 흐름. accept에 heic 금지(P2-4).
export function NoticePhotoUploader({ items, onChange, disabled = false, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function changeUploading(next: boolean) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = [...fileList];
    changeUploading(true);
    setErrors([]);
    const nextErrors: string[] = [];
    try {
      // ① 재인코딩 → 최종 Blob 확정 (파일 단위 실패는 수집하고 계속)
      const blobs: { name: string; blob: Blob }[] = [];
      for (const file of files) {
        if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
          if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
          nextErrors.push(`${file.name}: ${UNSUPPORTED_TYPE_MESSAGE}`);
          continue;
        }
        try {
          const blob = await reencodeToBlob(file, PHOTO_CLIENT_MAX_DIMENSION);
          if (blob.size > NOTICE_PHOTO_MAX_FILE_BYTES) {
            nextErrors.push(`${file.name}: 사진은 파일당 5MB 이하여야 합니다`);
            continue;
          }
          blobs.push({ name: file.name, blob });
        } catch {
          if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
          nextErrors.push(`${file.name}: 이미지를 처리할 수 없습니다`);
        }
      }
      if (blobs.length === 0) return;

      // 장수 상한은 유효 파일 확정 *후*에 센다 — 거부될 파일까지 세면 들어갈 수 있는 사진까지 막힌다.
      // 에러는 setErrors가 아니라 nextErrors로 — return이 finally를 타므로 여기서 setErrors하면
      // finally의 setErrors(nextErrors)가 같은 tick에 덮어써 무음 실패가 된다.
      if (items.length + blobs.length > NOTICE_PHOTO_MAX_COUNT) {
        nextErrors.push(`사진은 최대 ${NOTICE_PHOTO_MAX_COUNT}장까지 첨부할 수 있습니다`);
        return;
      }

      // ② presign — 최종 Blob의 type·size 기준
      const presigned = await presignNoticePhotos(
        blobs.map(({ name, blob }) => ({
          filename: name,
          mimeType: blob.type,
          sizeBytes: blob.size,
        })),
      );
      if (!presigned.ok) {
        nextErrors.push(presigned.message);
        return;
      }

      // ③ 동일 Blob PUT — 실패 항목만 제외하고 성공분을 목록에 추가
      const added: NoticePhotoItem[] = [];
      for (const [index, { blob }] of blobs.entries()) {
        const presign = presigned.data[index];
        try {
          await putWithRetry(
            async (url, body) => {
              const response = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": body.type },
                body,
                signal: AbortSignal.timeout(PHOTO_UPLOAD_TIMEOUT_MS),
              });
              return { status: response.status };
            },
            presign.uploadUrl,
            blob,
          );
          added.push({ r2Key: presign.r2Key, previewUrl: URL.createObjectURL(blob) });
        } catch (error) {
          nextErrors.push(error instanceof Error ? error.message : "사진 업로드에 실패했습니다");
        }
      }
      if (added.length > 0) onChange([...items, ...added]);
    } catch (error) {
      // 예상하지 못한 예외도 드러낸다 — 무음 실패 금지 (posts P1-4 선례)
      nextErrors.push(error instanceof Error ? error.message : "사진 업로드 중 오류가 발생했습니다");
    } finally {
      setErrors(nextErrors);
      changeUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    const next = [...items];
    // 기존 사진(공개 URL)은 revoke 대상이 아니다 — 신규 업로드의 blob URL만 해제
    if (next[index].previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(next[index].previewUrl);
    }
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => handleFiles(event.target.files)}
      />
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((item, index) => (
            <li key={item.r2Key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob 미리보기·R2 공개 URL */}
              <img
                src={item.previewUrl}
                alt=""
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
              <button
                type="button"
                aria-label="사진 제거"
                onClick={() => removeAt(index)}
                disabled={disabled || uploading}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || items.length >= NOTICE_PHOTO_MAX_COUNT}
        >
          <ImagePlus aria-hidden className="mr-1 h-4 w-4" />
          {uploading ? "업로드 중..." : `사진 추가 (${items.length}/${NOTICE_PHOTO_MAX_COUNT})`}
        </Button>
        <span className="text-xs text-muted-foreground">JPG·PNG·WebP, 장당 5MB</span>
      </div>
      {errors.map((message) => (
        <p key={message} className="text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
```

주의: posts와 달리 PUT에 `If-None-Match` 헤더를 보내지 않는다 — 공지 presign(`getSignedUploadUrl`)은 Content-Type만 서명하므로 서명에 없는 조건 헤더를 붙이지 않는다(uuidv7 키라 충돌 자체가 없다).

- [ ] **Step 2: `NoticeForm.tsx` 통합** — 변경 지점 4곳:

import 추가:
```tsx
import { NoticePhotoUploader, type NoticePhotoItem } from "./NoticePhotoUploader";
import { NOTICE_PHOTO_MAX_COUNT, NOTICE_PIN_LIMIT } from "../lib/schema";
```
(기존 `NOTICE_PIN_LIMIT` 단독 import를 위처럼 합친다)

state 추가(`isPinned` state 아래):
```tsx
const [photos, setPhotos] = useState<NoticePhotoItem[]>(
  notice?.photos.map((photo) => ({ r2Key: photo.r2Key, previewUrl: photo.url })) ?? [],
);
const [photoUploading, setPhotoUploading] = useState(false);
```

`handleSubmit`의 액션 호출에 photos 전달:
```tsx
const payload = { category, title, body, isPinned, photos: photos.map((photo) => photo.r2Key) };
const result =
  mode === "edit" && notice
    ? await updateNotice({ id: notice.id, ...payload })
    : await createNotice(payload);
```

폼 필드 추가(본문 Textarea 블록과 고정 checkbox 사이):
```tsx
<div className="space-y-2">
  <Label>사진 (선택, 최대 {NOTICE_PHOTO_MAX_COUNT}장)</Label>
  <NoticePhotoUploader
    items={photos}
    onChange={setPhotos}
    disabled={pending || deleting}
    onUploadingChange={setPhotoUploading}
  />
</div>
```

제출 버튼 disabled에 업로드 중 차단 추가:
```tsx
disabled={pending || deleting || photoUploading || !title.trim() || !body.trim()}
```

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit && npx vitest run tests/modules/notices/ tests/modules/posts/`
Expected: 타입 에러 0 · 전부 PASS

- [ ] **Step 4: Commit**

```bash
git add modules/notices/components/NoticePhotoUploader.tsx modules/notices/components/NoticeForm.tsx
git commit -m "feat: 공지 폼에 사진 업로더 추가 — 첨부 즉시 업로드

- lib/photo-client 프리미티브 + presignNoticePhotos 배선 (posts 업로더 동형)
- 업로드 중 제출 차단, 기존 사진은 공개 URL 미리보기로 표시·전체 교체 재제출"
```

---

### Task 7: 공개 상세 렌더 + 문서 갱신 + 최종 검증

**Files:**
- Modify: `app/(shop)/notices/[publicCode]/page.tsx`
- Modify: `README.md` · `docs/environment-variables.md` · `docs/r2-adoption.md` (R2_BUCKET 용도 문구)

**Interfaces:**
- Consumes: Task 3의 `Notice.photos`
- Produces: 완성된 기능 (배포 가능 상태)

- [ ] **Step 1: 상세 페이지에 사진 렌더** — 본문 `<div className="whitespace-pre-wrap ...">` 블록 **아래**에 추가:

```tsx
{notice.photos.length > 0 && (
  <div className="space-y-3">
    {notice.photos.map((photo) => (
      /* eslint-disable-next-line @next/next/no-img-element -- R2 공개 URL 직서빙(스펙 §조회·렌더) */
      <img
        key={photo.r2Key}
        src={photo.url}
        alt=""
        className="w-full rounded-md border border-border"
      />
    ))}
  </div>
)}
```

- [ ] **Step 2: 문서 3곳 문구 갱신**

- `README.md` env 표: `| \`R2_BUCKET\` | 상품 공개 버킷명 | ...` → `| \`R2_BUCKET\` | 공개 버킷명(상품·공지 사진) | ...`
- `docs/environment-variables.md`: `| \`R2_BUCKET\` | ⚙️ 운영 필수 | 버킷 이름. 기본 \`oshikore-products-dev\` |` → 설명을 `공개 버킷 이름(상품·공지 사진 — 공지는 notices/ prefix). 기본 \`oshikore-products-dev\``로
- `docs/r2-adoption.md` Step 2 버킷 표의 `oshikore-products-prod` 행 용도: `어드민이 등록하는 상품 이미지` → `어드민이 등록하는 상품 이미지·공지 첨부(notices/)`

- [ ] **Step 3: 전체 검증**

Run: `npm run validate`
Expected: lint·typecheck·테스트 전부 그린

Run: `npm run db:reset`
Expected: 클린 적용 (notice_photo 포함)

- [ ] **Step 4: Commit**

```bash
git add 'app/(shop)/notices/[publicCode]/page.tsx' README.md docs/environment-variables.md docs/r2-adoption.md
git commit -m "feat: 공지 상세에 첨부 사진 표시 — 공개 버킷 용도 문서 갱신

- 본문 아래 display_order 순 나열, R2 공개 URL 직서빙
- R2_BUCKET 용도 문구 3곳을 상품·공지 공용으로 정정"
```

- [ ] **Step 5: 수동 확인 (선택 — 로컬 스택 필요)**

`npm run dev:all` 후: 로그인 → `UPDATE account SET is_admin = TRUE, updated_at = now() WHERE id = '<본인 id>';` → `/admin/notices/new`에서 사진 2장 첨부·등록 → 공개 상세에서 본문 아래 표시 확인 → 수정 화면에서 1장 제거 후 저장 → 반영 확인.
