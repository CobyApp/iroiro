# 커뮤니티 Plan 3 — 사진 파이프라인 구현 계획

> **상태: 실행 완료(2026-08-01).** 이 문서는 더 이상 실행 지시가 아니라 **과거 실행 기록**이다.
> Task 0~14를 순서대로 수행했고 각 태스크는 개별 커밋으로 남아 있다. 재실행하지 말 것 —
> 코드의 단일 진실은 저장소의 현재 상태이고, 이 문서와 어긋나면 코드가 맞다.
>
> **구현 중 계획과 달라진 결정**
> - Task 3의 게이트 테스트 헬퍼 2건(204 null-body, fake timer 경합)과 Task 12의 ref 갱신 패턴이
>   실제로 동작하지 않아 수정했다. 계획 코드를 그대로 옮기면 실패한다.
> - Task 5의 "typecheck를 Task 10까지 미룬다"는 지시는 이 저장소에서 성립하지 않는다 —
>   훅이 typecheck 실패 시 Bash를 차단해 커밋이 불가능하다. `queries.ts`에서 즉시 해소했다.
> - 계획에 없던 통합 검증을 추가했다(`tests/integration/`) — 단위 테스트가 fetch·tx를 mock해
>   실 인프라와의 계약이 한 번도 확인되지 않던 구멍을 닫았다.
> - 구현 리뷰 반영으로 UGC 자격증명 분리·소비 시점 합계 강제·복사 시도 키 보상을 추가했다
>   (스펙 §구현 중 확정된 변경 참조).

**Goal:** 자유게시판 글에 사진 첨부(비공개 UGC 버킷 + presigned PUT 크기 강제 + claim 소유권 + ETag 조건부 복사 + 서명 GET 서빙)와 글 수정 정책(§11 — 댓글 후 잠금·`edited_at`·lockedReason)을 구현한다.

**Architecture:** 스펙 = `docs/superpowers/specs/2026-07-19-community-design.md` §결정 8(사진)·§결정 11(수정 정책). 업로드는 클라 재인코딩→최종 Blob 검증→claim·presign(Content-Length 서명)→임시 키 PUT, 제출 시 claim 원자 소비(짧은 tx)→R2 실측 검증·ETag 조건부 복사(tx 밖)→post+photo INSERT(tx)→실패 시 최종 객체 보상 삭제. 서빙은 서명 GET URL(15분)·`next/image` 미사용. 신고 스냅샷은 v2(사진 키 포함)로 확장, admin 증거 signer 분리.

**Tech Stack:** Next.js 16 · Prisma 7(adapter-pg) · Supabase Postgres · aws4fetch(R2/MinIO) · zod v4 · uuid v7 · Vitest

## Global Constraints

스펙에서 그대로 가져온 구속 값 — 모든 태스크에 암묵 적용:

- **업로드 정책**: 글당 최대 **10장** · 파일당 **5MB**(5\*1024\*1024) · 글 합계 **30MB** · `image/jpeg`·`image/png`·`image/webp`만. **HEIC 미지원** — `accept`에 heic **절대 금지**(Safari 17+ 역변환), 거부 시 `console.warn("[heic-reject]")`. 크기·장수·형식은 **재인코딩된 최종 Blob 기준**.
- **순서(P1-1)**: 파일 선택 → 재인코딩·리사이즈(긴 변 **4096px** 상한) → 최종 Blob 확정 → Blob 검증 → claim·presign → **동일 Blob** PUT.
- **presign 서명**: `allHeaders: true`로 **`Content-Length`·`Content-Type`·`If-None-Match: *`를 서명에 포함**(크기 강제 스파이크 2026-07-24 실증). PUT TTL **600초(10분)**, claim `expires_at`도 10분.
- **키 체계**: 임시 `posts/tmp/{uuidv7}.{ext}` → 최종 `posts/{uuidv7}.{ext}`(같은 uuid, prefix만 제거). 최종 키는 presign 발급 이력 없음 → 클라 쓰기 불가.
- **제출 검증(ETag 고정)**: HEAD 실측(선언 `content_type`·`size_bytes` 대조) → range GET(`If-Match`) 매직바이트 + 픽셀 헤더 파싱(상한 **8000×8000**, WebP는 VP8·VP8L·VP8X 3형식, JPEG SOF 탐색 상한 **64KB**, fail-closed) → CopyObject(`x-amz-copy-source-if-match`, **`Content-Type`+`Cache-Control: private, no-store` 메타 명시**). 412·검증 실패 → "사진 업로드를 다시 진행해주세요" + 임시 객체 삭제.
- **다중 사진 보상(P1-7)**: claim 전체를 **하나의 짧은 tx에서 원자 소비**(하나라도 불통과 → 전체 롤백) → tx 밖 R2 검증·복사 → 실패 시 **누적 최종 객체 전체 보상 삭제** → 최종 DB tx → 커밋 후 임시 객체 삭제 시도(실패는 lifecycle fallback). 소비된 claim은 복구하지 않음(새 업로드 요구). 보상 삭제 실패 키는 `[photo-orphan]` 구조화 로그.
- **R2 요청 견고성 수치(P2-2 확정)**: 요청별 timeout **10초**(`AbortSignal.timeout`) · 전체 파이프라인 상한 **60초** · bounded concurrency **3** · 재시도 **최대 2회**(네트워크·5xx만, 4xx·412 금지) · backoff 300ms→900ms + jitter ≤100ms. 클라 PUT은 네트워크 오류 시 **1회 재시도, 재시도 412 = 최초 성공 간주**(서버 검증이 최종 판정), 최초 412는 실패. **실 R2 게이트 발견(2026-08-01)**: SigV4 서명 실패 응답(`403 SignatureDoesNotMatch`)에 CORS 헤더가 없어 크기 계약 위반이 브라우저에 **네트워크 오류로 도착**한다 — 따라서 `4xx는 재시도 없이 실패` 분기는 실 R2의 크기 위반에 적용되지 않고, 위반은 네트워크 오류 경로로 1회 재시도 후 실패한다(rate limit·lifecycle이 있는 MVP에서 불필요한 1회는 수용). 규칙 자체는 그대로 두되 **실패 문구는 원인을 단정하지 않는다**. **412 가시성 확인 완료(5차 리뷰 P1-2 — 2026-08-01 브라우저 게이트)**: 동일 키 재업로드에서 브라우저가 `412`를 **상태코드로 그대로 읽었다**. 이번 게이트에서 관측한 두 시나리오에서는 `SignatureDoesNotMatch` 응답은 판독할 수 없었고 `PreconditionFailed` 412 응답은 판독할 수 있었다 — **모든 R2 오류 응답에 대한 일반 규칙이 아니다**. 재시도 계약은 이 관측된 412 시나리오에 한정해 **그대로 유지한다**. 관련 목 테스트(`network → 412 → success`)도 유효하다.
- **rate limit**: presign **30/시간·100/일 — 생성 claim 수 기준 배치 검사**(`현재 + 요청 장수 <= 상한`). claim 행은 24h+ 보존(정리는 §후속 — 이번 범위 아님).
- **서빙**: 서명 GET TTL **900초(15분)** · **`next/image` 금지, 네이티브 `<img>`** · 숨김·삭제 글은 신규 URL 미발급.
- **공개 signer(IDOR)**: 클라 `r2Key` 불신뢰 — 한 조회로 `post.public_code + hidden/deleted null + post_photo.post_id = post.id + photo deleted null` 검증 후 키 도출. **admin 증거 signer**: `requireAdmin()`을 **입력 파싱보다 먼저**, snapshot에 실제 포함된 키만 서명.
- **수정 정책(§11)**: 잠금 대상 `topic`·`title`·`body` 전부. 동시성 = ① tx → ② post `FOR UPDATE` → ③ 소유·숨김·삭제 재검증 → ④ 미삭제 댓글 확인(숨김 댓글도 카운트) → ⑤ 무변경이면 no-op / 변경 시 갱신 → ⑥ `edited_at`+`updated_at` 같은 now로 커밋. **lockedReason 우선순위: `hidden_at IS NOT NULL` → `"moderation"`, else 미삭제 댓글 ≥1 → `"has_comments"`, else `null`** — capability·getEditablePost·PostForm·mutation 4곳 동일. 에러 문구: moderation = "운영 검토 중인 글은 수정할 수 없습니다" / has_comments = "댓글이 작성된 글은 수정할 수 없습니다". 두 상태 모두 삭제 허용. 사진은 생성 시에만(수정 화면에 사진 없음).
- **신고 스냅샷**: Plan 3 배포 후 글 신고는 사진 없어도 **항상 `version: 2, photos: []`**. v1은 읽기 호환. 댓글 신고는 v1 유지(사진 없음).
- **deletePost**: 같은 tx에서 활성 사진 soft delete(`updated_at` 동반 갱신). admin 숨김은 사진 soft delete 아님(signer 차단으로 처리).
- **DB 규칙**: `post_photo`는 GRANT DELETE 미부여(soft delete 강제). 썸네일 partial unique = `WHERE is_thumbnail = true AND deleted_at IS NULL`. RLS 미적용(공개물 — 신고 2테이블만 RLS, Plan 2 기존).
- **에러 계약**: 예상 오류는 `DomainError` → `runAction`이 `ok:false` 반환. zod는 `parseActionInput`. P2002는 `isUniqueViolationOn`.
- **커밋**: `agent/rules/commit-message.md` — `<type>: 한국어 제목 70자 미만`, Co-Authored-By 금지, 본문 불릿은 "왜". 태스크당 1커밋.
- **테스트**: `agent/rules/test-policy.md` — `tests/` 미러, 기존 파일 패턴(mock db DI·`vi.hoisted` auth 스텁) 준수. `npm run validate`로 검증.

## 파일 구조

**신규:**

| 파일 | 역할 |
|---|---|
| `supabase/migrations/<ts>_init_post_photo.sql` | post_photo·post_photo_claim + GRANT |
| `lib/r2/ugc.ts` | UGC 버킷 전용: presign PUT(크기 서명)·서명 GET·HEAD·range GET·조건부 copy·delete + timeout/재시도 |
| `modules/posts/lib/image-header.ts` | 매직바이트 sniff + JPEG/PNG/WebP 픽셀 헤더 파서(순수 함수) |
| `modules/posts/lib/photo-claim.ts` | claim 발급(rate limit 배치)·원자 소비·실측 검증·최종 복사·보상 삭제 |
| `modules/posts/lib/photo-upload-client.ts` | 클라 순수 로직: 재인코딩→검증→presign→PUT(재시도 규칙) — DI로 단위 테스트 |
| `modules/posts/components/PostPhotoUploader.tsx` | 작성 화면 사진 업로더(생성 시에만) |
| `modules/posts/actions/photo.ts` | `presignPostPhotos` + `signReportEvidencePhoto`(admin) |
| `docs/superpowers/verification/2026-07-26-posts-edit-lock/edit-lock.mjs` | updatePost↔createComment 실 DB 양방향 직렬화 검증 |
| `docs/superpowers/verification/2026-07-26-posts-edit-lock/claim-consume.mjs` | claim 원자 소비 조건·동시 소비 실 DB 검증 |
| `docs/superpowers/spikes/2026-07-26-real-r2-gate/` | **Task 0** 실 R2 착수 게이트 스크립트 + CORS 계약 템플릿 |

**수정:** `supabase/migrations/20260722002059_init_post.sql`(post에 `edited_at` in-place — 사용자 결정 B, pre-launch `db:reset` 재적용) · `prisma/schema.prisma` · `lib/env.ts` · `lib/r2/client.ts` · `compose.yml`(Task 0) · `modules/posts/{types,lib/{schema,rate-limit,mutations,queries,transform},actions/{post,index}}.ts` · `modules/posts/components/{PostForm,PostDetail,PostCard,ReportQueue}.tsx` · `app/(shop)/posts/[publicCode]/edit/page.tsx` · `docs/environment-variables.md`

**이번 범위 아님(§후속):** claim 만료 행 정리 잡 · 삭제 사진 R2 정리 잡 · 사진 편집 · HEIC 디코더 · 서버 EXIF 제거 · revision history ·
**목록 썸네일용 클라 파생 썸네일**(Slack 방식 — 업로드 시 400px 축소본을 함께 올려 목록에 노출. 이번엔 개수 뱃지만) ·
**서명 GET URL 안정화 + `max-age` 캐시 완화**(서명이 매 렌더 바뀌어 캐시가 무력화되는 문제. 지금은 스펙의 `no-store`를 그대로 따른다).

> **작업 순서 주의:** **Task 0(실 R2 게이트)이 하드 게이트**였다(§결정 8 선행 항목). **2026-08-01 통과**해 Task 1 이후 착수가 열렸다 — 게이트 판정 기준과 실행 기록은 Task 0 절 참조.

---

### Task 0: 실 Cloudflare R2 선행 게이트 (하드 게이트 — **완료**)

> **이 태스크는 실행 완료됐다. 코드 전문은 이 문서에 두지 않는다.**
> Task 0의 **단일 진실은 커밋된 파일**이며, 계획서는 목적·판정 기준·실행 기록만 남긴다.
> 과거 이 자리에 있던 전문은 실제 파일과 드리프트를 일으켰다(5차 리뷰 지적) — 다시 복원하지 말 것.
>
> - 스크립트: `docs/superpowers/spikes/2026-07-26-real-r2-gate/gate.mjs`
> - 브라우저 게이트: `docs/superpowers/spikes/2026-07-26-real-r2-gate/browser-gate.mjs`
> - CORS 템플릿: `docs/superpowers/spikes/2026-07-26-real-r2-gate/cors.json`
> - 절차·시나리오·실행 기록: `docs/superpowers/spikes/2026-07-26-real-r2-gate/README.md`
> - 로컬 UGC 버킷·`posts/tmp/` lifecycle: `compose.yml` (이 태스크 소관)
> - 커밋: `070b950`(스크립트 추가) · `0a8b296`(실 R2 실행 결과·판정 기준 보정)

**목적:** 사진 파이프라인의 근간인 **업로드 시점 크기 강제**와 **ETag 고정 조건부 복사**가 실
Cloudflare R2에서 성립하는지를 구현 착수 전에 확인한다. 성립하지 않으면 스펙 §MVP 원칙에 따라 사진을
de-scope한다. 로컬 MinIO 스모크는 스크립트 검증일 뿐 게이트 통과로 인정하지 않는다.

- [x] **Step 1~4: 스크립트·CORS 템플릿·README 작성 + 로컬 MinIO 스모크** — 16 PASS / 0 FAIL / 1 SKIP
      (SKIP은 MinIO가 모든 origin을 허용하는 특성상 예상된 항목). 커밋 `070b950`.
- [x] **Step 5: 실 R2 스크립트 게이트** — 2026-08-01, **17 PASS / 0 FAIL / 0 SKIP**.
- [x] **Step 6: 실 R2 브라우저 게이트** — 2026-08-01 PASS. 5차 리뷰 반영으로 판정 기준을 강화한 뒤
      **같은 날 재실행해 재차 PASS**(정직한 키 200·1024B·`image/jpeg` 저장 / 초과 크기 키 정확히 404 /
      동일 키 재업로드 412 가시). 기준은 아래 "브라우저 게이트 판정 기준" 참조.
- [x] **Step 7: Commit** — `070b950` · `0a8b296`.

**사전 설정(실 R2 버킷):** 비공개 버킷 생성(공개 도메인 연결 금지) · `cors.json` 적용 ·
`posts/tmp/` prefix 1일 만료 lifecycle 규칙 `Staged Upload Expiration Rule` 추가 · **게이트 전용 토큰
2종** — UGC 버킷을 스코프에 포함한 Object Read & Write 토큰(G1~G12) + G13 전용 Admin Read only
토큰(버킷 설정 조회는 Object 등급 불가, Admin은 버킷 스코프 지정 불가). **둘 다 게이트 통과 후 폐기하며,
앱 런타임 자격증명으로 재사용하지 않는다** — 작업 로그·셸 인자·기록에 노출된 적 있는 키는 런타임에
쓰지 않는다(6차 리뷰). 런타임용 Object Read & Write 토큰은 UGC 버킷 최소 권한으로 별도 발급한다.

**실행:** 자격증명은 저장소 밖 임시 env 파일에 두고 `dotenv`로 주입한다(shell history·git 잔존 방지,
실행 후 삭제).

```bash
./node_modules/.bin/dotenv -e <저장소 밖 경로>/gate.env -- \
  node docs/superpowers/spikes/2026-07-26-real-r2-gate/gate.mjs
# gate.env: GATE_MODE=r2 · GATE_ENDPOINT · GATE_BUCKET · GATE_ACCESS_KEY_ID · GATE_SECRET_ACCESS_KEY
#           · GATE_ADMIN_ACCESS_KEY_ID · GATE_ADMIN_SECRET_ACCESS_KEY(G13 전용) · GATE_ORIGIN

./node_modules/.bin/dotenv -e <저장소 밖 경로>/gate.env -- \
  node docs/superpowers/spikes/2026-07-26-real-r2-gate/browser-gate.mjs
# 그 다음 브라우저로 http://localhost:8789 접속 — 서버는 127.0.0.1에만 bind하지만 Origin 헤더는
# 주소창 호스트명을 따르므로, CORS AllowedOrigins에 등록한 형태(localhost)로 열어야 한다.
```

**스크립트 게이트 시나리오(G1~G13):**

| ID | 계약 | 기대 |
|---|---|---|
| G1 | 서명 헤더 구성 | `content-length`·`content-type`·`if-none-match` 포함 |
| G2 | 정확한 크기·MIME PUT | 200/204 + ETag |
| G3 | 서명과 다른 크기 | 403 |
| G4 | 서명과 다른 MIME | 403 |
| G5 | 동일 키 재업로드 | 412 |
| G6 | 서명 없는 GET | **400(`InvalidArgument` 코드 확인) · 401 · 403** — 404는 제외(객체 부재를 차단으로 오인 방지), 429·5xx도 제외(판정 불능) |
| G7 | 서명 GET | 200 + `Cache-Control: private, no-store` |
| G8 | 현재 ETag 조건부 복사 | 200 |
| G9 | 불일치 ETag 조건부 복사 | 412 |
| G10 | 만료된 서명 GET | 403 |
| G11 | 허용 origin preflight | ACAO가 origin과 정확히 일치 · PUT 허용 · 필요한 헤더 허용 |
| G12 | 비허용 origin preflight | ACAO 없음 |
| G13 | 임시 객체 lifecycle | 같은 규칙에 `posts/tmp/` prefix + 1일 만료 (**`GATE_ADMIN_*` 필요**) |

**브라우저 게이트 판정 기준(5차 리뷰 반영):** Node는 `Content-Length`를 코드로 지정할 수 있으므로
"브라우저가 자동 설정하는 헤더도 서명에 묶이는가"는 실제 브라우저로만 확인된다. 다만 **브라우저가
보고하는 상태코드는 보조 증거로만 쓴다** — R2의 SigV4 실패 응답에 CORS 헤더가 없어 브라우저가 거부를
읽지 못하기 때문이다. 판정은 게이트 서버의 서명 HEAD가 한다.

| 확인 | 기준 |
|---|---|
| 정직한 업로드(서명 크기와 동일) | 브라우저 200/204 **및** 응답 판독 성공(= CORS 동작) |
| 정직한 키의 저장 상태 | 서명 HEAD가 **정확히 200** + `Content-Length`가 서명 크기와 일치 + 서명 content type |
| 크기 속인 업로드(4배 전송) | 브라우저에서 성공으로 읽히지 않음(403 또는 fetch 오류 — 둘을 구분하지 않음) |
| 초과 크기 키의 부재 | 서명 HEAD가 **정확히 404**. 403·429·5xx·전송 오류는 부재의 증거가 아니라 **판정 불능 → FAIL** |
| 동일 키 재업로드 | **정확히 412**여야 통과(6차 리뷰 반영 — 관측에서 판정 조건으로 승격). `FETCH_ERROR`·200·403·429·5xx는 모두 FAIL. 이 전제가 깨지면 "재시도 412 = 최초 성공 간주" 계약을 유지할 수 없으므로 게이트가 막는다 |

객체 부재는 단독 증거가 아니다 — 요청이 R2에 도달조차 못 한 경우와 구분되지 않는다. **G3의 Node 계층
거부 실증**과 **정직한 업로드가 정확한 크기로 저장된 사실**과 결합해야 "R2가 크기 계약을 강제했다"가
성립한다. 서버는 루프백에만 bind하고(페이지가 서명 PUT URL을 담는다), `/result`는 실행별 nonce를
요구한다(외부 페이지의 위조 판정 차단).

**실패 시 분기(이력 — 발동하지 않음):** 크기 강제(G3·G4) 또는 조건부 복사(G8·G9) 실패는 설계 근간이
성립하지 않는다는 뜻이므로 **여기서 멈추고** 사진 de-scope 또는 별도 업로드 게이트웨이를 사용자와
재논의한다. CORS(G11·G12)·lifecycle(G13) 실패는 버킷 설정 문제이므로 설정을 고쳐 재실행한다.

---

### Task 1: 인프라 — UGC 비공개 버킷 + env

**Files:**
- Modify: `lib/env.ts`, `lib/r2/client.ts`, `docs/environment-variables.md` (`compose.yml`은 Task 0 소관)
- Test: `tests/lib/env.test.ts`(기존 파일에 케이스 추가)

**Interfaces:**
- Produces: `env.R2_UGC_BUCKET`(기본 `oshikore-ugc-dev`), `r2UgcBucket`(lib/r2/client) — Task 3이 사용.

- [x] **Step 1: env 테스트 추가** — `tests/lib/env.test.ts`의 기존 describe 안에 추가(기존 스타일 그대로 `vi.resetModules()` + dynamic import 패턴을 따른다):

```ts
it("R2_UGC_BUCKET 기본값은 oshikore-ugc-dev", async () => {
  const { env } = await import("@/lib/env");
  expect(env.R2_UGC_BUCKET).toBe("oshikore-ugc-dev");
});
```

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/lib/env.test.ts` → Expected: FAIL (`R2_UGC_BUCKET` 없음)

- [x] **Step 3: env·client 구현** — `lib/env.ts`의 `R2_PUBLIC_BASE` 항목 바로 아래에 추가:

```ts
    // UGC 전용 비공개 버킷(§결정 8) — products 공개 버킷과 분리. 서빙은 서명 GET만.
    R2_UGC_BUCKET: z.string().min(1).default("oshikore-ugc-dev"),
```

`lib/r2/client.ts` 마지막 줄에 추가:

```ts
export const r2UgcBucket = env.R2_UGC_BUCKET;
```

- [x] **Step 4: 검증** — Run:

```bash
npx vitest run tests/lib/env.test.ts        # PASS
npm run typecheck                           # PASS
```

(로컬 UGC 버킷·`posts/tmp/` lifecycle·비공개 확인은 **Task 0에서 이미 수행·커밋**했다 — `compose.yml`은
Task 0 소관이므로 이 태스크에서 다시 건드리지 않는다.)

- [x] **Step 5: env 문서** — `docs/environment-variables.md`의 `R2_PUBLIC_BASE` 행 아래에 추가:

```markdown
| `R2_UGC_BUCKET` | ⚙️ 운영 필수 | UGC 사진 전용 **비공개** 버킷. 기본 `oshikore-ugc-dev`. 운영: R2 비공개 버킷(공개 도메인 연결 금지) |
```

- [x] **Step 6: Commit**

```bash
git add lib/env.ts lib/r2/client.ts docs/environment-variables.md tests/lib/env.test.ts
git commit -m "feat: UGC 사진 전용 비공개 버킷 env 추가"
```

---

### Task 2: DB — `edited_at`(in-place) + `init_post_photo` 마이그레이션 + Prisma 모델

**Files:**
- Modify: `supabase/migrations/20260722002059_init_post.sql`, `prisma/schema.prisma`
- Create: `supabase/migrations/<ts>_init_post_photo.sql` (`<ts>` = `date +%Y%m%d%H%M%S` 실행 시각)

**Interfaces:**
- Produces: Prisma `Post.editedAt`, `PostPhoto`, `PostPhotoClaim` 모델 — 이후 모든 태스크가 사용.

- [x] **Step 1: `init_post.sql`에 `edited_at` in-place 추가** (사용자 결정 B — pre-launch, `db:reset` 재적용). post CREATE TABLE에서 `body` 줄 다음에:

```sql
    edited_at     TIMESTAMPTZ,            -- 작성자 콘텐츠(topic/title/body) 편집 시각 — '수정됨' 표시 전용(§11 P1-2)
```

`COMMENT ON COLUMN post.body …` 줄 다음에:

```sql
COMMENT ON COLUMN post.edited_at IS '작성자 콘텐츠 편집 시각 (수정됨 표시 전용 — updated_at과 분리)';
```

- [x] **Step 2: `init_post_photo.sql` 생성** — `supabase/migrations/$(date +%Y%m%d%H%M%S)_init_post_photo.sql` 전문:

```sql
-- ============================================================================
-- init_post_photo: 게시판 사진 (Plan 3)
--   - post_photo = 등록 사진(최종 키만) — soft delete, R2 객체 비삭제(§결정 8)
--   - post_photo_claim = presign claim(임시 키·선언값·만료·소비) — rate limit COUNT 근거라 24h+ 보존
--   - 인가: 앱 DAL. RLS 미적용(공개물 — 스펙 §GRANT/RLS). FK 미사용(저장소 규칙)
-- ============================================================================

CREATE TABLE post_photo
(
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id       BIGINT      NOT NULL,
    r2_key        TEXT        NOT NULL,
    display_order INT         NOT NULL DEFAULT 0,
    is_thumbnail  BOOLEAN     NOT NULL DEFAULT false,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX post_photo_r2_key_unique        ON post_photo (r2_key);
-- 활성 사진만 글당 1썸네일(P1-5 — soft delete 정합)
CREATE UNIQUE INDEX post_photo_one_thumbnail_unique ON post_photo (post_id) WHERE is_thumbnail = true AND deleted_at IS NULL;
CREATE INDEX post_photo_post_idx       ON post_photo (post_id, display_order);
CREATE INDEX post_photo_created_at_idx ON post_photo (created_at);
CREATE INDEX post_photo_updated_at_idx ON post_photo (updated_at);

COMMENT ON TABLE post_photo IS '게시판 글 사진 (최종 키 등록분)';
COMMENT ON COLUMN post_photo.id IS 'PK';
COMMENT ON COLUMN post_photo.post_id IS '소속 글 ID';
COMMENT ON COLUMN post_photo.r2_key IS 'R2 최종 객체 키 (posts/{uuidv7}.{ext})';
COMMENT ON COLUMN post_photo.display_order IS '표시 순서 (0부터)';
COMMENT ON COLUMN post_photo.is_thumbnail IS '대표(썸네일) 여부 — 활성분 글당 1개';
COMMENT ON COLUMN post_photo.deleted_at IS '삭제 시각 (soft delete — R2 객체는 보존, 정리 잡 후속)';
COMMENT ON COLUMN post_photo.created_at IS '생성일';
COMMENT ON COLUMN post_photo.updated_at IS '수정일';

CREATE TABLE post_photo_claim
(
    id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id   UUID        NOT NULL,
    r2_key       TEXT        NOT NULL,
    content_type TEXT        NOT NULL,
    size_bytes   INT         NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE post_photo_claim ADD CONSTRAINT post_photo_claim_size_positive CHECK (size_bytes > 0);
CREATE UNIQUE INDEX post_photo_claim_r2_key_unique       ON post_photo_claim (r2_key);
CREATE INDEX post_photo_claim_account_created_at_idx ON post_photo_claim (account_id, created_at);  -- presign rate limit
CREATE INDEX post_photo_claim_expires_at_idx  ON post_photo_claim (expires_at);  -- 만료 claim 정리(후속 잡) 선반영
CREATE INDEX post_photo_claim_created_at_idx  ON post_photo_claim (created_at);
CREATE INDEX post_photo_claim_updated_at_idx  ON post_photo_claim (updated_at);

COMMENT ON TABLE post_photo_claim IS '사진 presign claim — 소유권·선언값·만료·소비 추적';
COMMENT ON COLUMN post_photo_claim.id IS 'PK';
COMMENT ON COLUMN post_photo_claim.account_id IS 'presign 요청 회원 ID (소유권)';
COMMENT ON COLUMN post_photo_claim.r2_key IS 'R2 임시 객체 키 (posts/tmp/{uuidv7}.{ext})';
COMMENT ON COLUMN post_photo_claim.content_type IS '선언 MIME — 제출 시 HEAD 실측과 대조';
COMMENT ON COLUMN post_photo_claim.size_bytes IS '선언 크기(바이트) — Content-Length 서명값이자 HEAD 대조값';
COMMENT ON COLUMN post_photo_claim.expires_at IS 'presign·claim 만료 시각 (10분)';
COMMENT ON COLUMN post_photo_claim.consumed_at IS '소비 시각 — 원자 소비(조건부 UPDATE)로만 세팅';
COMMENT ON COLUMN post_photo_claim.created_at IS '생성일 (rate limit COUNT 기준 — 행은 24h+ 보존)';
COMMENT ON COLUMN post_photo_claim.updated_at IS '수정일';

-- GRANT — app 롤만. post_photo는 DELETE 미부여(soft delete 강제, P1-5).
-- post_photo_claim은 만료 행 정리 잡(후속)이 hard delete하므로 DELETE 부여.
REVOKE ALL ON post_photo, post_photo_claim FROM anon, authenticated, app;
GRANT SELECT, INSERT, UPDATE         ON post_photo       TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON post_photo_claim TO app;
```

- [x] **Step 3: Prisma 모델** — `prisma/schema.prisma`의 `Post` 모델에서 `body String` 다음 줄에 `editedAt` 추가 + relation 필드 추가:

```prisma
  editedAt     DateTime?     @map("edited_at") @db.Timestamptz(6)
```

`Post`의 `comments PostComment[]` 줄 다음에:

```prisma
  photos       PostPhoto[]
```

`PostCommentReport` 모델 아래에 두 모델 추가(ProductPhoto의 partial unique `where: raw` 문법 선례):

```prisma
model PostPhoto {
  id           BigInt    @id @default(autoincrement())
  postId       BigInt    @map("post_id")
  r2Key        String    @map("r2_key")
  displayOrder Int       @default(0) @map("display_order")
  isThumbnail  Boolean   @default(false) @map("is_thumbnail")
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz(6)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)
  post         Post      @relation(fields: [postId], references: [id])

  @@unique([r2Key], map: "post_photo_r2_key_unique")
  @@unique([postId], map: "post_photo_one_thumbnail_unique", where: raw("(is_thumbnail = true AND deleted_at IS NULL)"))
  @@index([postId, displayOrder], map: "post_photo_post_idx")
  @@index([createdAt], map: "post_photo_created_at_idx")
  @@index([updatedAt], map: "post_photo_updated_at_idx")
  @@map("post_photo")
}

model PostPhotoClaim {
  id          BigInt    @id @default(autoincrement())
  accountId   String    @map("account_id") @db.Uuid
  r2Key       String    @map("r2_key")
  contentType String    @map("content_type")
  sizeBytes   Int       @map("size_bytes")
  expiresAt   DateTime  @map("expires_at") @db.Timestamptz(6)
  consumedAt  DateTime? @map("consumed_at") @db.Timestamptz(6)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  @@unique([r2Key], map: "post_photo_claim_r2_key_unique")
  @@index([accountId, createdAt], map: "post_photo_claim_account_created_at_idx")
  @@index([expiresAt], map: "post_photo_claim_expires_at_idx")
  @@index([createdAt], map: "post_photo_claim_created_at_idx")
  @@index([updatedAt], map: "post_photo_claim_updated_at_idx")
  @@map("post_photo_claim")
}
```

- [x] **Step 4: 적용·검증**

```bash
npm run db:reset                          # Expected: 전체 마이그레이션 재적용 성공
npm run db:generate                       # Expected: Prisma Client 생성 성공
npm run typecheck                         # Expected: PASS
dotenv -e .env.local -- psql "$DATABASE_URL" -c "\d post_photo" | grep -E "one_thumbnail|r2_key"
# Expected: partial unique에 (is_thumbnail = true AND deleted_at IS NULL) 조건 표시
dotenv -e .env.local -- psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='post' AND column_name='edited_at'"
# Expected: edited_at 1행
```

(참고: psql 호출이 환경상 어려우면 `npx prisma db pull --print`로 스키마 드리프트 없음을 확인해도 된다.)

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/20260722002059_init_post.sql supabase/migrations/*_init_post_photo.sql prisma/schema.prisma
git commit -m "feat: post_photo·claim 테이블과 edited_at 컬럼 추가"
```

---

### Task 3: `lib/r2/ugc.ts` — UGC 버킷 R2 유틸(서명·HEAD·range·copy·delete + 재시도)

**Files:**
- Create: `lib/r2/ugc.ts`
- Test: `tests/lib/r2/ugc.test.ts`

**Interfaces:**
- Produces(이후 태스크 사용):
  - `UGC_PUT_TTL_SECONDS = 600` · `UGC_GET_TTL_SECONDS = 900` · `UGC_CACHE_CONTROL = "private, no-store"`
  - `presignUgcPut(key: string, contentType: string, sizeBytes: number): Promise<string>`
  - `getSignedUgcGetUrl(key: string, expiresInSeconds?: number): Promise<string>`
  - `type R2CallOptions = { signal?: AbortSignal }` — 아래 4개 함수의 마지막 선택 인자(전체 예산 주입, P1-3)
  - `headUgcObject(key, options?): Promise<{ etag: string; contentType: string | null; contentLength: number | null } | null>` (404 → null)
  - `getUgcObjectRange(key, etag, start, endInclusive, options?): Promise<Uint8Array>` (412 → `R2ConditionFailedError`)
  - `copyUgcObject(srcKey, destKey, etag, contentType, options?): Promise<void>` (412 → `R2ConditionFailedError`)
  - `deleteUgcObject(key, options?): Promise<boolean>` (404도 성공 취급 — 멱등)
  - `class R2ConditionFailedError` · `class R2RequestError extends Error { status: number }`
- Consumes: `r2`·`r2Endpoint`·`r2UgcBucket`(Task 1).

- [x] **Step 1: 실패하는 테스트 작성** — `tests/lib/r2/ugc.test.ts` 전문. `presign.test.ts` 선례(client 모듈 mock)를 따르되, HEAD/GET/copy/delete는 **global fetch mock**으로 상태·헤더 매핑과 재시도를 검증한다. 재시도 backoff는 fake timers로 소진:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AwsClient } from "aws4fetch";

// 실제 서명 로직 검증을 위해 진짜 AwsClient를 쓴다(로컬 키 — 네트워크 미발생).
vi.mock("@/lib/r2/client", () => ({
  r2: new AwsClient({
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    service: "s3",
    region: "auto",
  }),
  r2Endpoint: "http://localhost:9000",
  r2UgcBucket: "test-ugc",
}));

function res(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return new Response(body, { status, headers });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("presignUgcPut", () => {
  it("Content-Length·Content-Type·If-None-Match가 SignedHeaders에 포함된다(크기 강제 계약)", async () => {
    const { presignUgcPut } = await import("@/lib/r2/ugc");
    const url = new URL(await presignUgcPut("posts/tmp/a.jpg", "image/jpeg", 1234));
    const signed = url.searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed).toContain("content-length");
    expect(signed).toContain("content-type");
    expect(signed).toContain("if-none-match");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.pathname).toBe("/test-ugc/posts/tmp/a.jpg");
  });
});

describe("getSignedUgcGetUrl", () => {
  it("기본 TTL 900초 서명 GET URL", async () => {
    const { getSignedUgcGetUrl } = await import("@/lib/r2/ugc");
    const url = new URL(await getSignedUgcGetUrl("posts/a.jpg"));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.has("X-Amz-Signature")).toBe(true);
    expect(url.pathname).toBe("/test-ugc/posts/a.jpg");
  });
});

describe("headUgcObject", () => {
  it("200이면 etag·contentType·contentLength 반환", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      res(200, { etag: '"abc"', "content-type": "image/jpeg", "content-length": "1234" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    await expect(headUgcObject("posts/tmp/a.jpg")).resolves.toEqual({
      etag: '"abc"', contentType: "image/jpeg", contentLength: 1234,
    });
    expect(fetchMock.mock.calls[0][0].method).toBe("HEAD");
  });

  it("404면 null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(404)));
    const { headUgcObject } = await import("@/lib/r2/ugc");
    await expect(headUgcObject("posts/tmp/none.jpg")).resolves.toBeNull();
  });

  it("5xx는 최대 2회 재시도 후 성공을 수용한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(500))
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200, { etag: '"e"' }));
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    const pending = headUgcObject("posts/tmp/a.jpg");
    await vi.runAllTimersAsync();               // backoff 소진
    await expect(pending).resolves.toMatchObject({ etag: '"e"' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("네트워크 오류도 재시도하고, 3회 모두 실패하면 throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    const pending = headUgcObject("posts/tmp/a.jpg").catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("4xx(400)는 재시도 없이 즉시 throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(400));
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject, R2RequestError } = await import("@/lib/r2/ugc");
    await expect(headUgcObject("posts/tmp/a.jpg")).rejects.toBeInstanceOf(R2RequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("전체 예산 signal이 abort되면 5xx여도 재시도하지 않고 즉시 중단(P1-3)", async () => {
    const controller = new AbortController();
    // 첫 응답을 받는 순간 예산이 소진된 상황을 재현한다.
    const fetchMock = vi.fn().mockImplementation(async () => {
      controller.abort(new Error("파이프라인 예산 초과"));
      return res(503);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    const pending = headUgcObject("posts/tmp/a.jpg", { signal: controller.signal }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1); // backoff가 abort로 즉시 reject
  });

  it("이미 abort된 signal이면 fetch 자체를 시도하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    await expect(
      headUgcObject("posts/tmp/a.jpg", { signal: AbortSignal.abort(new Error("이미 소진")) }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getUgcObjectRange", () => {
  it("Range·If-Match 헤더로 요청하고 바이트를 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(206, {}, "\xff\xd8\xff"));
    vi.stubGlobal("fetch", fetchMock);
    const { getUgcObjectRange } = await import("@/lib/r2/ugc");
    const bytes = await getUgcObjectRange("posts/tmp/a.jpg", '"abc"', 0, 65535);
    expect(bytes.length).toBeGreaterThan(0);
    const req: Request = fetchMock.mock.calls[0][0];
    expect(req.headers.get("range")).toBe("bytes=0-65535");
    expect(req.headers.get("if-match")).toBe('"abc"');
  });

  it("412면 R2ConditionFailedError(재시도 없음)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(412));
    vi.stubGlobal("fetch", fetchMock);
    const { getUgcObjectRange, R2ConditionFailedError } = await import("@/lib/r2/ugc");
    await expect(getUgcObjectRange("k", '"e"', 0, 10)).rejects.toBeInstanceOf(R2ConditionFailedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("copyUgcObject", () => {
  it("copy-source·if-match·REPLACE·Content-Type·Cache-Control 메타를 명시한다(P2-1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, {}, "<CopyObjectResult/>"));
    vi.stubGlobal("fetch", fetchMock);
    const { copyUgcObject } = await import("@/lib/r2/ugc");
    await copyUgcObject("posts/tmp/a.jpg", "posts/a.jpg", '"abc"', "image/jpeg");
    const req: Request = fetchMock.mock.calls[0][0];
    expect(req.method).toBe("PUT");
    expect(new URL(req.url).pathname).toBe("/test-ugc/posts/a.jpg");
    expect(req.headers.get("x-amz-copy-source")).toBe("/test-ugc/posts/tmp/a.jpg");
    expect(req.headers.get("x-amz-copy-source-if-match")).toBe('"abc"');
    expect(req.headers.get("x-amz-metadata-directive")).toBe("REPLACE");
    expect(req.headers.get("content-type")).toBe("image/jpeg");
    expect(req.headers.get("cache-control")).toBe("private, no-store");
  });

  it("412면 R2ConditionFailedError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(412)));
    const { copyUgcObject, R2ConditionFailedError } = await import("@/lib/r2/ugc");
    await expect(copyUgcObject("s", "d", '"e"', "image/png")).rejects.toBeInstanceOf(R2ConditionFailedError);
  });

  it("200 응답 바디의 <Error>도 실패로 처리한다(S3 copy 관례)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200, {}, "<Error><Code>InternalError</Code></Error>")));
    const { copyUgcObject, R2RequestError } = await import("@/lib/r2/ugc");
    await expect(copyUgcObject("s", "d", '"e"', "image/png")).rejects.toBeInstanceOf(R2RequestError);
  });
});

describe("deleteUgcObject", () => {
  it("204는 true, 404도 true(멱등), 500 소진 후 false 아님 — throw 대신 false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(204)));
    let mod = await import("@/lib/r2/ugc");
    await expect(mod.deleteUgcObject("k")).resolves.toBe(true);

    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(404)));
    mod = await import("@/lib/r2/ugc");
    await expect(mod.deleteUgcObject("k")).resolves.toBe(true);

    vi.resetModules();
    const failing = vi.fn().mockResolvedValue(res(500));
    vi.stubGlobal("fetch", failing);
    mod = await import("@/lib/r2/ugc");
    const pending = mod.deleteUgcObject("k");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(false);   // 삭제 실패는 호출부가 로그(보상 경로)
    expect(failing).toHaveBeenCalledTimes(3);
  });
});
```

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/lib/r2/ugc.test.ts` → Expected: FAIL (모듈 없음)

- [x] **Step 3: 구현** — `lib/r2/ugc.ts` 전문:

```ts
import "server-only";

import { r2, r2Endpoint, r2UgcBucket } from "./client";

// §결정 8 상수 — 값 변경은 스펙 개정과 함께.
export const UGC_PUT_TTL_SECONDS = 600;   // presigned PUT·claim 10분
export const UGC_GET_TTL_SECONDS = 900;   // 서명 GET 15분(숨김·삭제 후 잔여 접근 상한)
export const UGC_CACHE_CONTROL = "private, no-store"; // 캐시 계약(P1-2) — 최적화·공유 캐시 차단

// R2 요청 견고성 수치(P2-2 확정) — 재시도는 네트워크·5xx만, 4xx(412 포함) 금지.
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 300; // 300ms → 900ms (+ jitter ≤100ms)

export class R2ConditionFailedError extends Error {}
export class R2RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "R2RequestError";
  }
}

// 파이프라인 전체 예산 signal을 호출부(photo-claim)가 주입한다(P1-3) — 요청별 timeout과 결합해
// "min(요청 10초, 남은 전체 예산)"으로 동작하고, 예산 소진 시 진행 중 요청도 중단된다.
export type R2CallOptions = { signal?: AbortSignal };

function objectUrl(key: string): string {
  return `${r2Endpoint}/${r2UgcBucket}/${key}`;
}

// 백오프도 예산 signal에 반응해야 한다 — 안 그러면 예산 소진 후에도 재시도 대기가 남는다.
function backoff(attempt: number, signal?: AbortSignal): Promise<void> {
  const ms = BACKOFF_BASE_MS * 3 ** attempt + Math.random() * 100;
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// 서명된 Request를 요청별 timeout으로 실행. 5xx·네트워크 오류만 재시도(최대 2회).
// 전체 예산 signal이 abort되면 재시도 없이 즉시 중단한다.
async function fetchWithRetry(request: Request, options: R2CallOptions = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const response = await fetch(request.clone(), { signal });
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await backoff(attempt, options.signal);
        continue;
      }
      return response;
    } catch (error) {
      if (options.signal?.aborted) throw error; // 예산 소진 — 재시도 금지
      if (attempt < MAX_RETRIES) {
        await backoff(attempt, options.signal);
        continue;
      }
      throw error;
    }
  }
}

// 임시 키 presign — Content-Length·Content-Type·If-None-Match를 서명에 고정(allHeaders).
// 크기 강제 스파이크(2026-07-24) 실증: 선언과 다른 크기는 403 SignatureDoesNotMatch.
export async function presignUgcPut(
  key: string,
  contentType: string,
  sizeBytes: number,
): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(UGC_PUT_TTL_SECONDS));
  const signed = await r2.sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(sizeBytes),
        "If-None-Match": "*", // 최초 업로드 후 동일 키 덮어쓰기 차단
      },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

// 비공개 버킷 서빙용 서명 GET — 발급 여부(노출 판단)는 호출부(queries·admin signer) 책임.
export async function getSignedUgcGetUrl(
  key: string,
  expiresInSeconds = UGC_GET_TTL_SECONDS,
): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await r2.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export type UgcObjectHead = {
  etag: string;
  contentType: string | null;
  contentLength: number | null;
};

export async function headUgcObject(
  key: string,
  options: R2CallOptions = {},
): Promise<UgcObjectHead | null> {
  const signed = await r2.sign(new Request(objectUrl(key), { method: "HEAD" }));
  const response = await fetchWithRetry(signed, options);
  if (response.status === 404) return null;
  if (!response.ok) throw new R2RequestError(`HEAD 실패: ${key}`, response.status);
  const etag = response.headers.get("etag");
  if (!etag) throw new R2RequestError(`ETag 없음: ${key}`, response.status);
  const length = response.headers.get("content-length");
  return {
    etag,
    contentType: response.headers.get("content-type"),
    contentLength: length !== null ? Number(length) : null,
  };
}

// 검증용 헤더 바이트 — If-Match(ETag 고정)로 "검증 후 교체" TOCTOU 차단(§결정 8).
export async function getUgcObjectRange(
  key: string,
  etag: string,
  start: number,
  endInclusive: number,
  options: R2CallOptions = {},
): Promise<Uint8Array> {
  const signed = await r2.sign(
    new Request(objectUrl(key), {
      method: "GET",
      headers: { Range: `bytes=${start}-${endInclusive}`, "If-Match": etag },
    }),
  );
  const response = await fetchWithRetry(signed, options);
  if (response.status === 412) throw new R2ConditionFailedError(`ETag 불일치: ${key}`);
  if (response.status !== 200 && response.status !== 206) {
    throw new R2RequestError(`range GET 실패: ${key}`, response.status);
  }
  return new Uint8Array(await response.arrayBuffer());
}

// 조건부 복사(임시 → 최종) — x-amz-copy-source-if-match(ETag 고정) + 최종 객체 메타 명시(REPLACE):
// Content-Type·Cache-Control(private, no-store — P2-1 캐시 계약).
export async function copyUgcObject(
  srcKey: string,
  destKey: string,
  etag: string,
  contentType: string,
  options: R2CallOptions = {},
): Promise<void> {
  const signed = await r2.sign(
    new Request(objectUrl(destKey), {
      method: "PUT",
      headers: {
        "x-amz-copy-source": `/${r2UgcBucket}/${srcKey}`,
        "x-amz-copy-source-if-match": etag,
        "x-amz-metadata-directive": "REPLACE",
        "Content-Type": contentType,
        "Cache-Control": UGC_CACHE_CONTROL,
      },
    }),
  );
  const response = await fetchWithRetry(signed, options);
  if (response.status === 412) throw new R2ConditionFailedError(`복사 ETag 불일치: ${srcKey}`);
  if (!response.ok) throw new R2RequestError(`복사 실패: ${destKey}`, response.status);
  // S3 CopyObject는 200 응답 바디에 오류를 담을 수 있다 — <Error> 감지 시 실패 처리.
  const body = await response.text();
  if (body.includes("<Error>")) throw new R2RequestError(`복사 실패(응답 오류): ${destKey}`, response.status);
}

// 멱등 삭제 — 404도 성공. 실패는 throw 대신 false(호출부가 보상 로그 판단).
export async function deleteUgcObject(
  key: string,
  options: R2CallOptions = {},
): Promise<boolean> {
  try {
    const signed = await r2.sign(new Request(objectUrl(key), { method: "DELETE" }));
    const response = await fetchWithRetry(signed, options);
    return response.ok || response.status === 404;
  } catch {
    return false; // 예산 중단·네트워크 실패 포함 — 호출부가 보상 로그로 처리
  }
}
```

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/lib/r2/ugc.test.ts` → Expected: PASS (전 케이스)

- [x] **Step 5: Commit**

```bash
git add lib/r2/ugc.ts tests/lib/r2/ugc.test.ts
git commit -m "feat: UGC 버킷 R2 유틸 추가(크기 서명 presign·조건부 copy·재시도)"
```

---

### Task 4: `image-header.ts` — 매직바이트 + 픽셀 헤더 파서

**Files:**
- Create: `modules/posts/lib/image-header.ts`
- Test: `tests/modules/posts/lib/image-header.test.ts`

**Interfaces:**
- Produces:
  - `JPEG_SOF_SCAN_LIMIT = 65536` — range GET 길이와 일치(Task 6이 `0 ~ LIMIT-1` 요청)
  - `sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null`
  - `parseImageDimensions(bytes: Uint8Array, type): { width: number; height: number } | null` — **fail-closed**(파싱 불가 → null)

- [x] **Step 1: 실패하는 테스트 작성** — `tests/modules/posts/lib/image-header.test.ts` 전문. 픽스처는 바이트 빌더로 직접 구성:

```ts
import { describe, expect, it } from "vitest";
import {
  JPEG_SOF_SCAN_LIMIT,
  parseImageDimensions,
  sniffImageType,
} from "@/modules/posts/lib/image-header";

// ---- 픽스처 빌더 ----
function bytes(...parts: (number[] | Uint8Array)[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p instanceof Uint8Array ? p : new Uint8Array(p), offset); offset += p.length; }
  return out;
}
const u16be = (v: number) => [v >> 8, v & 0xff];
const u32be = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const u16le = (v: number) => [v & 0xff, v >> 8];
const u24le = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
const u32le = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// PNG: 시그니처(8) + IHDR 청크(len 13 + "IHDR" + width + height + …5바이트)
function pngFixture(width: number, height: number, chunkType = "IHDR"): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32be(13), ascii(chunkType), u32be(width), u32be(height), [8, 6, 0, 0, 0],
  );
}

// JPEG: SOI + (선행 세그먼트들) + SOF 마커 + [len, precision, height, width, …]
function jpegFixture(width: number, height: number, sofMarker = 0xc0, prefixSegments: Uint8Array = new Uint8Array(0)): Uint8Array {
  return bytes(
    [0xff, 0xd8], prefixSegments,
    [0xff, sofMarker], u16be(11), [8], u16be(height), u16be(width), [3, 0x11, 0x22],
  );
}
// 임의 길이의 APP1 필러 세그먼트(마커 포함 총 2 + 2 + dataLen 바이트)
function appSegment(dataLen: number): Uint8Array {
  return bytes([0xff, 0xe1], u16be(dataLen + 2), new Uint8Array(dataLen));
}

const riff = (fourcc: string, payload: Uint8Array) =>
  bytes(ascii("RIFF"), u32le(4 + 8 + payload.length), ascii("WEBP"), ascii(fourcc), u32le(payload.length), payload);

// WebP VP8(손실): 프레임 태그 3B + 시작 코드 9D 01 2A + width(14bit LE) + height(14bit LE)
function webpVp8(width: number, height: number): Uint8Array {
  return riff("VP8 ", bytes([0, 0, 0], [0x9d, 0x01, 0x2a], u16le(width), u16le(height)));
}
// WebP VP8L(무손실): 0x2F + 32bit LE(14bit width-1, 14bit height-1)
function webpVp8l(width: number, height: number): Uint8Array {
  const packed = (width - 1) | ((height - 1) << 14);
  return riff("VP8L", bytes([0x2f], u32le(packed)));
}
// WebP VP8X(확장): flags(1) + reserved(3) + canvas width-1(24LE) + height-1(24LE)
function webpVp8x(width: number, height: number): Uint8Array {
  return riff("VP8X", bytes([0x10, 0, 0, 0], u24le(width - 1), u24le(height - 1)));
}

describe("sniffImageType", () => {
  it("JPEG·PNG·WebP 매직바이트를 식별한다", () => {
    expect(sniffImageType(jpegFixture(10, 10))).toBe("image/jpeg");
    expect(sniffImageType(pngFixture(10, 10))).toBe("image/png");
    expect(sniffImageType(webpVp8(10, 10))).toBe("image/webp");
  });
  it("그 외(SVG/HTML/짧은 바이트)는 null", () => {
    expect(sniffImageType(new Uint8Array(ascii("<svg xmlns=")))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff]))).toBeNull();
    // RIFF지만 WEBP가 아니면(WAV) null
    expect(sniffImageType(bytes(ascii("RIFF"), u32le(4), ascii("WAVE")))).toBeNull();
  });
});

describe("parseImageDimensions — PNG", () => {
  it("IHDR에서 width·height", () => {
    expect(parseImageDimensions(pngFixture(800, 600), "image/png")).toEqual({ width: 800, height: 600 });
  });
  it("IHDR 아닌 첫 청크는 null(구조 검증)", () => {
    expect(parseImageDimensions(pngFixture(800, 600, "IDAT"), "image/png")).toBeNull();
  });
});

describe("parseImageDimensions — JPEG", () => {
  it("SOF0(baseline)·SOF2(progressive)에서 치수", () => {
    expect(parseImageDimensions(jpegFixture(1024, 768, 0xc0), "image/jpeg")).toEqual({ width: 1024, height: 768 });
    expect(parseImageDimensions(jpegFixture(320, 240, 0xc2), "image/jpeg")).toEqual({ width: 320, height: 240 });
  });
  it("DHT(0xC4)는 SOF로 오인하지 않는다", () => {
    // DHT 세그먼트 뒤에 SOF0 — DHT를 건너뛰고 SOF0에서 읽어야 한다.
    const dht = bytes([0xff, 0xc4], u16be(4), [0, 0]);
    expect(parseImageDimensions(jpegFixture(64, 32, 0xc0, dht), "image/jpeg")).toEqual({ width: 64, height: 32 });
  });
  it("SOF가 64KB 탐색 상한 밖이면 null(fail-closed)", () => {
    // 필러 APP1 세그먼트로 SOF를 65536 바이트 밖으로 밀어낸다.
    const filler = bytes(appSegment(60_000), appSegment(10_000));
    expect(parseImageDimensions(jpegFixture(10, 10, 0xc0, filler), "image/jpeg")).toBeNull();
  });
  it("잘린 바이트는 null", () => {
    expect(parseImageDimensions(jpegFixture(10, 10).slice(0, 6), "image/jpeg")).toBeNull();
  });
});

describe("parseImageDimensions — WebP 3형식(§결정 8)", () => {
  it("VP8 / VP8L / VP8X 모두 치수 파싱", () => {
    expect(parseImageDimensions(webpVp8(640, 480), "image/webp")).toEqual({ width: 640, height: 480 });
    expect(parseImageDimensions(webpVp8l(333, 222), "image/webp")).toEqual({ width: 333, height: 222 });
    expect(parseImageDimensions(webpVp8x(9000, 100), "image/webp")).toEqual({ width: 9000, height: 100 });
  });
  it("VP8 시작 코드 불일치·미지 청크는 null", () => {
    const bad = riff("VP8 ", bytes([0, 0, 0], [0x00, 0x01, 0x2a], u16le(10), u16le(10)));
    expect(parseImageDimensions(bad, "image/webp")).toBeNull();
    expect(parseImageDimensions(riff("ANMF", new Uint8Array(10)), "image/webp")).toBeNull();
  });
  it("형식별 최소 길이 — 정상 VP8L은 25바이트로 통과, 잘린 청크는 null(P1-6)", () => {
    expect(webpVp8l(333, 222).length).toBe(25);          // 공통 30바이트 가드였다면 오거부
    expect(parseImageDimensions(webpVp8l(333, 222).slice(0, 23), "image/webp")).toBeNull();
    expect(parseImageDimensions(webpVp8(640, 480).slice(0, 28), "image/webp")).toBeNull();
  });
});

it("JPEG_SOF_SCAN_LIMIT은 64KB", () => {
  expect(JPEG_SOF_SCAN_LIMIT).toBe(65_536);
});
```

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/image-header.test.ts` → Expected: FAIL (모듈 없음)

- [x] **Step 3: 구현** — `modules/posts/lib/image-header.ts` 전문 (클라 코드에서도 재사용 가능하도록 `server-only` 미포함, 순수 함수만):

```ts
// 이미지 헤더 파싱 — 픽셀 상한 검증 수단이며 전체 이미지 디코딩과 동등하지 않다(§결정 8).
// fail-closed: 지원 형식이라도 치수를 확인할 수 없으면 null → 호출부가 거부한다.

export const JPEG_SOF_SCAN_LIMIT = 65_536; // SOF 탐색 상한 64KB — 초과 시 거부(스펙)

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";
export type ImageDimensions = { width: number; height: number };

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const asciiAt = (b: Uint8Array, o: number, len: number) =>
  String.fromCharCode(...b.subarray(o, o + len));

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function parseImageDimensions(
  bytes: Uint8Array,
  type: SniffedImageType,
): ImageDimensions | null {
  switch (type) {
    case "image/png": return parsePng(bytes);
    case "image/jpeg": return parseJpeg(bytes);
    case "image/webp": return parseWebp(bytes);
  }
}

// PNG — 시그니처 직후 첫 청크가 IHDR(길이 13)이어야 한다(구조 검증).
function parsePng(b: Uint8Array): ImageDimensions | null {
  if (b.length < 24) return null;
  if (u32be(b, 8) !== 13 || asciiAt(b, 12, 4) !== "IHDR") return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// JPEG — 마커 스트림에서 SOF(프레임 시작) 세그먼트를 찾아 치수를 읽는다.
// SOF = 0xC0~0xCF 중 DHT(0xC4)·JPG(0xC8)·DAC(0xCC) 제외. 탐색 상한 64KB(초과 시 null).
function parseJpeg(b: Uint8Array): ImageDimensions | null {
  const limit = Math.min(b.length, JPEG_SOF_SCAN_LIMIT);
  let offset = 2; // SOI(FFD8) 건너뜀
  while (offset + 3 < limit) {
    if (b[offset] !== 0xff) return null; // 마커 정렬 깨짐 — fail-closed
    let marker = b[offset + 1];
    while (marker === 0xff && offset + 2 < limit) { offset++; marker = b[offset + 1]; } // fill 바이트
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2; // 길이 없는 마커
      continue;
    }
    if (offset + 4 > limit) return null;
    const segmentLength = u16be(b, offset + 2);
    if (segmentLength < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > b.length) return null;
      const height = u16be(b, offset + 5);
      const width = u16be(b, offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + segmentLength;
  }
  return null; // SOF 미발견(상한 초과 포함) — fail-closed
}

// WebP — RIFF 컨테이너의 첫 청크로 판정. VP8(손실)·VP8L(무손실)·VP8X(확장) 3형식 모두 지원(스펙).
// 최소 길이는 형식별로 다르다: VP8L payload는 5바이트(총 25바이트)라 공통 30바이트로 막으면
// 정상 VP8L을 오거부한다(P1-6 리뷰 반영).
const WEBP_PAYLOAD_OFFSET = 20; // RIFF 헤더 12 + 청크 헤더 8
function parseWebp(b: Uint8Array): ImageDimensions | null {
  if (b.length < WEBP_PAYLOAD_OFFSET + 5) return null; // 최소 payload = VP8L 5바이트
  const fourcc = asciiAt(b, 12, 4);
  const declaredPayload = u32le(b, 16);
  // 형식별 최소 payload 확인. 선언 길이가 최소치 미만이면 손상(fail-closed).
  // "선언 > 실제"는 헤더만 받는 range GET에서 정상이므로 실제 길이는 별도로 본다.
  const need = (payloadBytes: number) =>
    declaredPayload >= payloadBytes && b.length >= WEBP_PAYLOAD_OFFSET + payloadBytes;
  if (fourcc === "VP8 ") {
    // 프레임 태그 3B 후 시작 코드 9D 01 2A, 이어서 14bit width·height(LE). payload ≥ 10.
    if (!need(10)) return null;
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    const width = u16le(b, 26) & 0x3fff;
    const height = u16le(b, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (fourcc === "VP8L") {
    if (!need(5)) return null; // 0x2f + 32bit packed
    if (b[20] !== 0x2f) return null; // 시그니처
    const packed = u32le(b, 21);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >>> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (fourcc === "VP8X") {
    if (!need(10)) return null; // flags 1 + reserved 3 + canvas 3+3
    const width = u24le(b, 24) + 1;
    const height = u24le(b, 27) + 1;
    return { width, height };
  }
  return null; // 미지 청크 — fail-closed
}
```

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/image-header.test.ts` → Expected: PASS

- [x] **Step 5: Commit**

```bash
git add modules/posts/lib/image-header.ts tests/modules/posts/lib/image-header.test.ts
git commit -m "feat: 이미지 매직바이트·픽셀 헤더 파서 추가(fail-closed)"
```

---

### Task 5: 도메인 코어 — types·schema(사진 상수·스냅샷 v2)·rate-limit 배치

**Files:**
- Modify: `modules/posts/types.ts`, `modules/posts/lib/schema.ts`, `modules/posts/lib/rate-limit.ts`
- Test: `tests/modules/posts/lib/schema.test.ts`, `tests/modules/posts/lib/rate-limit.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Produces:
  - types: `LockedReason = "moderation" | "has_comments" | null` · `PostPhotoView = { id; url; displayOrder; isThumbnail }` · `Post`에 `editedAt: string | null`·`photoCount: number` 추가 · `PostDetailView`에 `photos: PostPhotoView[]` 추가
  - schema: `PHOTO_MAX_COUNT = 10` · `PHOTO_MAX_FILE_BYTES = 5*1024*1024` · `PHOTO_MAX_TOTAL_BYTES = 30*1024*1024` · `PHOTO_ALLOWED_TYPES = ["image/jpeg","image/png","image/webp"] as const` · `PHOTO_MAX_DIMENSION = 8000` · `PHOTO_CLIENT_MAX_DIMENSION = 4096` · `PHOTO_RETRY_CODE = "photo_retry"` · `RATE_LIMITS.presign` · `presignPhotosSchema` · `postCreateSchema.photos`(update에는 없음) · `evidenceSchema` · `postReportSnapshotV2` · `postReportSnapshot`(v1|v2 union)
  - rate-limit: `assertWithinRateLimit(windows, counter, requested = 1)` — `count + requested > max`면 거부(기존 호출부 하위호환: requested 1)

- [x] **Step 1: 실패하는 테스트 작성** — `tests/modules/posts/lib/rate-limit.test.ts`에 추가:

```ts
describe("배치 requested(P1-3 — presign은 생성 claim 수 기준)", () => {
  it("현재 25 + 요청 10 > 상한 30 → 거부", async () => {
    const counter = vi.fn().mockResolvedValue(25);
    await expect(
      assertWithinRateLimit([{ seconds: 3600, max: 30 }], counter, 10),
    ).rejects.toThrow(/너무 잦습니다/);
  });
  it("현재 20 + 요청 10 = 30 → 허용(<= 상한)", async () => {
    const counter = vi.fn().mockResolvedValue(20);
    await expect(
      assertWithinRateLimit([{ seconds: 3600, max: 30 }], counter, 10),
    ).resolves.toBeUndefined();
  });
  it("requested 생략 시 기존 동작(count >= max 거부) 유지", async () => {
    const counter = vi.fn().mockResolvedValue(29);
    await expect(
      assertWithinRateLimit([{ seconds: 3600, max: 30 }], counter),
    ).resolves.toBeUndefined();
  });
});
```

`tests/modules/posts/lib/schema.test.ts`에 추가(기존 import 스타일에 맞춰 스키마·상수 import 확장):

```ts
describe("presignPhotosSchema", () => {
  const file = (over: Partial<{ contentType: string; sizeBytes: number }> = {}) => ({
    contentType: "image/jpeg", sizeBytes: 1024, ...over,
  });

  it("정상 1장 통과", () => {
    expect(presignPhotosSchema.safeParse({ files: [file()] }).success).toBe(true);
  });
  it("heic 등 미허용 MIME 거부(HEIC 미지원 — P2-4)", () => {
    const r = presignPhotosSchema.safeParse({ files: [file({ contentType: "image/heic" })] });
    expect(r.success).toBe(false);
  });
  it("파일당 5MB 초과 거부", () => {
    const r = presignPhotosSchema.safeParse({ files: [file({ sizeBytes: PHOTO_MAX_FILE_BYTES + 1 })] });
    expect(r.success).toBe(false);
  });
  it("11장 거부·합계 30MB 초과 거부", () => {
    expect(presignPhotosSchema.safeParse({ files: Array.from({ length: 11 }, () => file()) }).success).toBe(false);
    const sixFiveMb = Array.from({ length: 7 }, () => file({ sizeBytes: PHOTO_MAX_FILE_BYTES }));
    expect(presignPhotosSchema.safeParse({ files: sixFiveMb }).success).toBe(false); // 35MB
  });
});

describe("postCreateSchema.photos / postUpdateSchema", () => {
  it("photos 생략 시 빈 배열 기본값", () => {
    const r = postCreateSchema.parse({ topic: "talk", title: "t", body: "b" });
    expect(r.photos).toEqual([]);
  });
  it("photos claimId 중복 거부·10장 초과 거부", () => {
    const dup = { topic: "talk", title: "t", body: "b", photos: [{ claimId: 1 }, { claimId: 1 }] };
    expect(postCreateSchema.safeParse(dup).success).toBe(false);
    const eleven = { topic: "talk", title: "t", body: "b", photos: Array.from({ length: 11 }, (_, i) => ({ claimId: i + 1 })) };
    expect(postCreateSchema.safeParse(eleven).success).toBe(false);
  });
  it("수정 스키마는 photos를 받지 않는다(§11 — 사진은 생성 시에만)", () => {
    const r = postUpdateSchema.parse({ id: 1, topic: "talk", title: "t", body: "b", photos: [{ claimId: 1 }] } as never);
    expect("photos" in r).toBe(false); // strip
  });
});

describe("신고 스냅샷 v1|v2 union(P1-5)", () => {
  const base = { title: "t", body: "b", authorName: "a", authorCode: "c", updatedAt: "2026-07-26T00:00:00.000Z" };
  it("v1 파싱 호환 유지", () => {
    expect(postReportSnapshot.safeParse({ version: 1, ...base }).success).toBe(true);
  });
  it("v2는 photos(r2Key·displayOrder) 필수 — 빈 배열 허용", () => {
    expect(postReportSnapshot.safeParse({ version: 2, ...base, photos: [] }).success).toBe(true);
    expect(postReportSnapshot.safeParse({
      version: 2, ...base, photos: [{ r2Key: "posts/a.jpg", displayOrder: 0 }],
    }).success).toBe(true);
    expect(postReportSnapshot.safeParse({ version: 2, ...base }).success).toBe(false);
  });
});
```

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/schema.test.ts tests/modules/posts/lib/rate-limit.test.ts` → Expected: FAIL

- [x] **Step 3: rate-limit 구현** — `modules/posts/lib/rate-limit.ts`의 함수를 교체:

```ts
// 이중 윈도 COUNT — 어느 윈도든 (현재 + requested) > max면 도메인 에러.
// requested 기본 1 = 기존 "count >= max 거부"와 동치. presign은 생성 claim 수를 넘긴다(P1-3).
export async function assertWithinRateLimit(
  windows: readonly Window[],
  counter: Counter,
  requested = 1,
): Promise<void> {
  for (const w of windows) {
    const since = new Date(Date.now() - w.seconds * 1000);
    if ((await counter(since)) + requested > w.max) {
      throw new DomainError("요청이 너무 잦습니다. 잠시 후 다시 시도해주세요");
    }
  }
}
```

- [x] **Step 4: types 구현** — `modules/posts/types.ts` 수정. `Post` 타입에 필드 추가(`updatedAt: string;` 다음):

```ts
  editedAt: string | null; // 작성자 편집 시각(§11 '수정됨' 뱃지) — updated_at과 분리
  // 첨부 사진 수 — 목록은 개수 뱃지만 보여주고 이미지를 싣지 않는다. 비공개 버킷엔 원본 한 벌뿐이라
  // 목록 썸네일이 곧 원본(최대 5MB) 전송이 되기 때문(사용자 결정). 파생 썸네일은 §후속.
  photoCount: number;
```

`PostDetailView`를 교체:

```ts
// 상세 사진 — 서명 GET URL 포함(TTL 15분, 렌더 시점 발급).
export type PostPhotoView = {
  id: number;
  url: string;
  displayOrder: number;
  isThumbnail: boolean;
};

export type PostDetailView = {
  post: Post;
  capabilities: { canEdit: boolean; canDelete: boolean; canReport: boolean };
  comments: PostComment[];
  photos: PostPhotoView[];
};
```

`TargetStatus` 정의 위에 추가:

```ts
// 글 수정 잠금 사유(§11) — 우선순위: moderation(운영 숨김) → has_comments(미삭제 댓글) → null.
// capability·getEditablePost·PostForm·mutation 4곳이 동일 우선순위를 쓴다.
export type LockedReason = "moderation" | "has_comments" | null;
```

- [x] **Step 5: schema 구현** — `modules/posts/lib/schema.ts` 수정.

`POST_PAGE_SIZE` 아래에 사진 상수 추가:

```ts
// 사진 정책(§결정 8) — 재인코딩된 최종 Blob 기준으로 검사.
export const PHOTO_MAX_COUNT = 10;
export const PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024;   // 파일당 5MB
export const PHOTO_MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 글 합계 30MB
export const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const; // HEIC 미지원(P2-4)
export const PHOTO_MAX_DIMENSION = 8_000;        // 서버 픽셀 상한(방어선)
export const PHOTO_CLIENT_MAX_DIMENSION = 4_096; // 클라 canvas 리사이즈 상한(긴 변)
// 재업로드가 필요한 실패의 도메인 에러 코드(P2-3). 클라이언트 폼도 이 코드를 보고 첨부를 비우므로
// server-only인 photo-claim이 아니라 client-safe한 schema에 둔다.
export const PHOTO_RETRY_CODE = "photo_retry";
// 브라우저 PUT 상한(P2-2) — 멈춘 업로드가 폼을 영구 잠그지 않도록 요청 자체를 끊는다.
export const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
```

`RATE_LIMITS`에 presign 추가(§9 — 생성 claim 수 기준, mutations가 requested로 장수를 넘긴다):

```ts
  presign: [{ seconds: 3600, max: 30 }, { seconds: 86_400, max: 100 }],
```

`postCreateSchema`·`postUpdateSchema`를 교체(수정 스키마는 photos 미수용 — §11):

```ts
const postContentSchema = z.object({
  topic: z.enum(POST_TOPICS),
  title: trimmed(POST_TITLE_MAX, "제목"),
  body: trimmed(POST_BODY_MAX, "본문"),
});
export const postCreateSchema = postContentSchema.extend({
  photos: z
    .array(z.object({ claimId: positiveId }))
    .max(PHOTO_MAX_COUNT, `사진은 최대 ${PHOTO_MAX_COUNT}장입니다`)
    .default([])
    .refine(
      (photos) => new Set(photos.map((p) => p.claimId)).size === photos.length,
      "같은 사진이 중복 제출되었습니다",
    ),
});
export const postUpdateSchema = postContentSchema.extend({ id: positiveId });
```

`reportCreateSchema` 아래에 presign·증거 입력 스키마 추가:

```ts
// presign 입력 — 최종 Blob의 type·size(클라 재인코딩 후 확정값). 합계 30MB refine.
export const presignPhotosSchema = z
  .object({
    files: z
      .array(
        z.object({
          contentType: z.enum(PHOTO_ALLOWED_TYPES, {
            message: "지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)",
          }),
          sizeBytes: z
            .number()
            .int()
            .positive()
            .max(PHOTO_MAX_FILE_BYTES, "사진은 파일당 5MB 이하여야 합니다"),
        }),
      )
      .min(1, "사진이 없습니다")
      .max(PHOTO_MAX_COUNT, `사진은 최대 ${PHOTO_MAX_COUNT}장입니다`),
  })
  .refine(
    (v) => v.files.reduce((sum, f) => sum + f.sizeBytes, 0) <= PHOTO_MAX_TOTAL_BYTES,
    { message: "사진 합계는 30MB 이하여야 합니다" },
  );

// admin 증거 signer 입력(P1-4) — 글 신고 전용(댓글 스냅샷엔 사진이 없다).
export const evidenceSchema = z.object({
  reportId: positiveId,
  photoIndex: z.number().int().min(0),
});
```

스냅샷 v1 정의 아래에 v2·union 추가:

```ts
// 신고 스냅샷 v2 — 신고 당시 사진 키·표시 순서 동결(P1-5). Plan 3 배포 후 글 신고는
// 사진이 없어도 항상 v2(photos: [])로 저장하고, v1은 읽기 호환만 유지한다.
export const postReportSnapshotV2 = postReportSnapshotV1.omit({ version: true }).extend({
  version: z.literal(2),
  photos: z.array(z.object({ r2Key: z.string(), displayOrder: z.number().int() })),
});
export const postReportSnapshot = z.discriminatedUnion("version", [
  postReportSnapshotV1,
  postReportSnapshotV2,
]);
```

- [x] **Step 6: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/schema.test.ts tests/modules/posts/lib/rate-limit.test.ts` → Expected: PASS. 이어서 `npm run typecheck` — **Post 타입 확장으로 transform·queries가 컴파일 에러가 나면 안 된다**: 이 시점에는 `toPost`가 아직 새 필드를 안 채우므로 타입 에러가 난다 → **Task 10에서 해소 예정이면 이 태스크에서는 `npx vitest run tests/modules/posts` 통과만 확인**하고, typecheck는 Task 10 완료 후 전체 실행한다. 단, 테스트가 컴파일을 요구하므로 `transform.ts`의 `toPost` 반환에 임시가 아닌 **실제 구현을 지금 추가**한다(아래 Step 7).

- [x] **Step 7: transform 선반영(컴파일 정합)** — `modules/posts/lib/transform.ts`의 `toPost`를 교체(Task 10에서 queries가 photoCount를 전달):

```ts
export function toPost(
  row: PrismaPost,
  commentCount: number,
  photoCount = 0,
): Post {
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
    editedAt: row.editedAt !== null ? row.editedAt.toISOString() : null,
    photoCount,
    commentCount,
  };
}
```

`tests/modules/posts/lib/transform.test.ts`의 기존 toPost 픽스처에 `editedAt: null`(Prisma row 필드)을 추가하고, 다음 케이스를 추가:

```ts
it("editedAt·photoCount — 편집 전 null, 전달 시 ISO·개수 반영", () => {
  const edited = toPost({ ...baseRow, editedAt: new Date("2026-07-26T01:00:00Z") } as never, 0, 3);
  expect(edited.editedAt).toBe("2026-07-26T01:00:00.000Z");
  expect(edited.photoCount).toBe(3);
  expect(toPost(baseRow as never, 0).editedAt).toBeNull();
  expect(toPost(baseRow as never, 0).photoCount).toBe(0); // 기본값 — 사진 없는 글
});
```

- [x] **Step 8: 통과 확인** — Run: `npx vitest run tests/modules/posts` → Expected: PASS (queries·mutations 기존 테스트는 아직 이전 계약 그대로 — 이 태스크는 스키마·타입만)

- [x] **Step 9: Commit**

```bash
git add modules/posts/types.ts modules/posts/lib/schema.ts modules/posts/lib/rate-limit.ts modules/posts/lib/transform.ts tests/modules/posts/lib/schema.test.ts tests/modules/posts/lib/rate-limit.test.ts tests/modules/posts/lib/transform.test.ts
git commit -m "feat: 사진 정책 스키마·스냅샷 v2·rate limit 배치 검사 추가"
```

---

### Task 6: `photo-claim.ts` — claim 발급·원자 소비·실측 검증·보상

**Files:**
- Create: `modules/posts/lib/photo-claim.ts`
- Test: `tests/modules/posts/lib/photo-claim.test.ts`

**Interfaces:**
- Consumes: Task 3(`lib/r2/ugc`), Task 4(`image-header`), Task 5(`schema`·`rate-limit`)
- Produces(mutations·actions가 사용):
  - `PHOTO_UPLOAD_RETRY_MESSAGE = "사진 업로드를 다시 진행해주세요"`(코드는 schema의 `PHOTO_RETRY_CODE` — P2-3)
  - `issuePhotoClaims(accountId: string, files: { contentType: string; sizeBytes: number }[], db?): Promise<IssuedClaim[]>` — `IssuedClaim = { claimId: number; r2Key: string; uploadUrl: string }`
  - `consumePhotoClaims(accountId: string, claimIds: number[], db?): Promise<ConsumedClaim[]>` — `ConsumedClaim = { id: bigint; r2Key: string; contentType: string; sizeBytes: number }`, 입력 순서 유지
  - `finalizeClaimedPhotos(claims: ConsumedClaim[], options?: { budget?: AbortSignal; cleanupBudget?: AbortSignal }): Promise<string[]>` — 최종 키 배열(claims 순서), 부분 실패·예산 소진 시 누적분 보상 삭제 후 throw. 두 signal은 테스트 주입 seam(기본 60초 / 정리 15초, 정리 예산은 첫 실패 시점부터)
  - `compensateFinalObjects(keys: string[], cleanupBudget?: AbortSignal): Promise<void>` — 실패 키 `[photo-orphan]` 로그
  - `cleanupTmpObjects(keys: string[]): Promise<void>` — best-effort(커밋 후 임시 삭제)

- [x] **Step 1: 실패하는 테스트 작성** — `tests/modules/posts/lib/photo-claim.test.ts` 전문. `lib/r2/ugc`를 모듈 mock, db는 DI(mutations 테스트 선례):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ugc } = vi.hoisted(() => ({
  ugc: {
    presignUgcPut: vi.fn(),
    headUgcObject: vi.fn(),
    getUgcObjectRange: vi.fn(),
    copyUgcObject: vi.fn(),
    deleteUgcObject: vi.fn(),
  },
}));
vi.mock("@/lib/r2/ugc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2/ugc")>();
  return {
    ...actual, // R2ConditionFailedError·상수는 실제 사용
    presignUgcPut: ugc.presignUgcPut,
    headUgcObject: ugc.headUgcObject,
    getUgcObjectRange: ugc.getUgcObjectRange,
    copyUgcObject: ugc.copyUgcObject,
    deleteUgcObject: ugc.deleteUgcObject,
  };
});

// 유효한 1000x800 JPEG 헤더 바이트(image-header 테스트 픽스처와 동일 구성)
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x03, 0x20, 0x03, 0xe8, 0x03, 0x11, 0x22,
]); // height=0x0320(800), width=0x03e8(1000)

const claimCount = vi.fn();
const claimCreate = vi.fn();
const queryRaw = vi.fn();
const tx = { $queryRaw: queryRaw };
const db = {
  postPhotoClaim: { count: claimCount, create: claimCreate },
  $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
} as never;

function consumedRow(id: number, key = `posts/tmp/${id}.jpg`) {
  return { id: BigInt(id), r2_key: key, content_type: "image/jpeg", size_bytes: 14 };
}

beforeEach(() => {
  vi.clearAllMocks();
  claimCount.mockResolvedValue(0);
  let nextId = 1;
  claimCreate.mockImplementation(async () => ({ id: BigInt(nextId++) }));
  ugc.presignUgcPut.mockResolvedValue("https://signed-put");
  ugc.headUgcObject.mockResolvedValue({ etag: '"e"', contentType: "image/jpeg", contentLength: 14 });
  ugc.getUgcObjectRange.mockResolvedValue(JPEG_BYTES);
  ugc.copyUgcObject.mockResolvedValue(undefined);
  ugc.deleteUgcObject.mockResolvedValue(true);
});

describe("issuePhotoClaims", () => {
  it("claim 기록 + posts/tmp 키 + presign URL 반환", async () => {
    const { issuePhotoClaims } = await import("@/modules/posts/lib/photo-claim");
    const out = await issuePhotoClaims("acc-1", [{ contentType: "image/jpeg", sizeBytes: 14 }], db);
    expect(out).toHaveLength(1);
    expect(out[0].r2Key).toMatch(/^posts\/tmp\/.+\.jpg$/);
    expect(out[0].uploadUrl).toBe("https://signed-put");
    const data = claimCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ accountId: "acc-1", contentType: "image/jpeg", sizeBytes: 14 });
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("배치 rate limit — 현재 25 + 10장 요청 → 거부(P1-3)", async () => {
    claimCount.mockResolvedValue(25);
    const { issuePhotoClaims } = await import("@/modules/posts/lib/photo-claim");
    const files = Array.from({ length: 10 }, () => ({ contentType: "image/jpeg", sizeBytes: 1 }));
    await expect(issuePhotoClaims("acc-1", files, db)).rejects.toThrow(/너무 잦습니다/);
    expect(claimCreate).not.toHaveBeenCalled();
  });
});

describe("consumePhotoClaims — 원자 소비", () => {
  it("전건 반환 시 입력 순서로 매핑", async () => {
    queryRaw.mockResolvedValue([consumedRow(2), consumedRow(1)]); // DB 반환 순서 뒤섞임
    const { consumePhotoClaims } = await import("@/modules/posts/lib/photo-claim");
    const out = await consumePhotoClaims("acc-1", [1, 2], db);
    expect(out.map((c) => Number(c.id))).toEqual([1, 2]);
  });

  it("하나라도 조건 불통과(만료·타계정·기소비)면 전체 거부 → tx 롤백(P1-7)", async () => {
    queryRaw.mockResolvedValue([consumedRow(1)]); // 2건 요청, 1건만 갱신
    const { consumePhotoClaims, PHOTO_UPLOAD_RETRY_MESSAGE } = await import("@/modules/posts/lib/photo-claim");
    await expect(consumePhotoClaims("acc-1", [1, 2], db)).rejects.toThrow(PHOTO_UPLOAD_RETRY_MESSAGE);
  });
});

describe("finalizeClaimedPhotos — 검증·복사·보상", () => {
  it("성공 시 최종 키 배열(tmp prefix 제거·순서 유지)", async () => {
    const { finalizeClaimedPhotos } = await import("@/modules/posts/lib/photo-claim");
    const keys = await finalizeClaimedPhotos([
      { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      { id: 2n, r2Key: "posts/tmp/b.jpg", contentType: "image/jpeg", sizeBytes: 14 },
    ]);
    expect(keys).toEqual(["posts/a.jpg", "posts/b.jpg"]);
    expect(ugc.copyUgcObject).toHaveBeenCalledTimes(2);
  });

  it("HEAD 실측이 선언값과 다르면 거부 + 임시 객체 삭제", async () => {
    ugc.headUgcObject.mockResolvedValue({ etag: '"e"', contentType: "image/jpeg", contentLength: 999 });
    const { finalizeClaimedPhotos, PHOTO_UPLOAD_RETRY_MESSAGE } = await import("@/modules/posts/lib/photo-claim");
    await expect(
      finalizeClaimedPhotos([{ id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 }]),
    ).rejects.toThrow(PHOTO_UPLOAD_RETRY_MESSAGE);
    // 실패 경로 삭제는 cleanup 예산 signal과 함께 호출된다(P1-3).
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith(
      "posts/tmp/a.jpg",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(ugc.copyUgcObject).not.toHaveBeenCalled();
  });

  it("매직바이트 불일치(선언 jpeg·실제 png) 거부", async () => {
    ugc.getUgcObjectRange.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const { finalizeClaimedPhotos } = await import("@/modules/posts/lib/photo-claim");
    await expect(
      finalizeClaimedPhotos([{ id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 }]),
    ).rejects.toThrow(/다시 진행/);
  });

  it("픽셀 상한 초과(9000px) 거부 — fail-closed", async () => {
    // width=0x2328(9000)
    ugc.getUgcObjectRange.mockResolvedValue(new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x23, 0x28, 0x03, 0x11, 0x22,
    ]));
    const { finalizeClaimedPhotos } = await import("@/modules/posts/lib/photo-claim");
    await expect(
      finalizeClaimedPhotos([{ id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 }]),
    ).rejects.toThrow(/다시 진행/);
  });

  it("복사 412(ETag 불일치)면 도메인 에러로 변환", async () => {
    const { R2ConditionFailedError } = await import("@/lib/r2/ugc");
    ugc.copyUgcObject.mockRejectedValue(new R2ConditionFailedError("mismatch"));
    const { finalizeClaimedPhotos } = await import("@/modules/posts/lib/photo-claim");
    await expect(
      finalizeClaimedPhotos([{ id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 }]),
    ).rejects.toThrow(/다시 진행/);
  });

  it("부분 실패 시 이미 복사된 최종 객체 전체를 보상 삭제(P1-7)", async () => {
    ugc.copyUgcObject
      .mockResolvedValueOnce(undefined)          // a 복사 성공
      .mockRejectedValueOnce(new Error("boom")); // b 복사 실패
    const { finalizeClaimedPhotos } = await import("@/modules/posts/lib/photo-claim");
    await expect(
      finalizeClaimedPhotos([
        { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
        { id: 2n, r2Key: "posts/tmp/b.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      ]),
    ).rejects.toThrow();
    // 누적 최종 키 보상 — 보상 삭제도 cleanup 예산 signal과 함께 호출된다.
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith(
      "posts/a.jpg",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("전체 예산 소진 시 진행 중 요청 중단·신규 미시작·완료분 보상(P1-3)", async () => {
    // a만 즉시 성공하고 나머지는 "예산 signal이 abort될 때 실패하는 진행 중 요청"을 재현한다.
    ugc.headUgcObject.mockImplementation(
      async (key: string, options?: { signal?: AbortSignal }) => {
        if (key === "posts/tmp/a.jpg") {
          return { etag: '"e"', contentType: "image/jpeg", contentLength: 14 };
        }
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    );
    const claims = ["a", "b", "c", "d", "e"].map((name, index) => ({
      id: BigInt(index + 1),
      r2Key: `posts/tmp/${name}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 14,
    }));

    const { finalizeClaimedPhotos } = await import("@/modules/posts/lib/photo-claim");
    const { PHOTO_RETRY_CODE } = await import("@/modules/posts/lib/schema"); // 코드는 schema 소관
    const budget = new AbortController();
    const pending = finalizeClaimedPhotos(claims, { budget: budget.signal }).catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 0)); // a 완료 → d 디스패치까지 진행
    budget.abort(new Error("파이프라인 예산 초과"));
    const error = await pending;

    expect(error).toMatchObject({ code: PHOTO_RETRY_CODE }); // 사용자에겐 재업로드 안내
    // 동시성 3 — a 완료 후 d가 투입되고, e는 예산 소진으로 시작조차 하지 않는다.
    const started = ugc.headUgcObject.mock.calls.map((call) => call[0]);
    expect(started).toContain("posts/tmp/d.jpg");
    expect(started).not.toContain("posts/tmp/e.jpg");
    // 이미 복사된 최종 객체는 보상 삭제된다.
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith("posts/a.jpg", expect.anything());
  });

  it("예산 소진 후 정리 DELETE가 지연돼도 cleanup 예산으로 끊긴다(P1-3)", async () => {
    // 실패 경로 정리가 "끝나지 않는 DELETE"인 상황 — cleanup signal이 없으면 요청 10초 × 3회가
    // 사진마다 더해져 전체 응답이 예산을 크게 넘긴다.
    // HEAD는 try 밖이라 여기서 실패시키면 catch에 진입하지 못한다 → copy에서 실패시킨다.
    ugc.copyUgcObject.mockRejectedValue(new Error("복사 실패"));
    ugc.deleteUgcObject.mockImplementation(
      (_key: string, options?: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          options?.signal?.addEventListener("abort", () => resolve(false), { once: true });
        }),
    );

    const { finalizeClaimedPhotos } = await import("@/modules/posts/lib/photo-claim");
    const cleanup = new AbortController();
    const pending = finalizeClaimedPhotos(
      [{ id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 }],
      { cleanupBudget: cleanup.signal },
    ).catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    cleanup.abort(new Error("정리 예산 초과"));

    // 정리가 매달려 있어도 전체가 끝난다(끊기지 않으면 이 await가 반환되지 않는다).
    expect(await pending).toBeInstanceOf(Error);
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith("posts/tmp/a.jpg", expect.anything());
  });

  it("보상 삭제 실패 키는 [photo-orphan] 구조화 로그", async () => {
    ugc.deleteUgcObject.mockResolvedValue(false);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { compensateFinalObjects } = await import("@/modules/posts/lib/photo-claim");
    await compensateFinalObjects(["posts/x.jpg"]);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[photo-orphan]"), expect.anything());
    errSpy.mockRestore();
  });
});
```

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/photo-claim.test.ts` → Expected: FAIL

- [x] **Step 3: 구현** — `modules/posts/lib/photo-claim.ts` 전문:

```ts
import "server-only";
import { Prisma } from "@prisma/client";
import { v7 as uuidv7 } from "uuid";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import {
  R2ConditionFailedError,
  UGC_PUT_TTL_SECONDS,
  copyUgcObject,
  deleteUgcObject,
  getUgcObjectRange,
  headUgcObject,
  presignUgcPut,
} from "@/lib/r2/ugc";
import { JPEG_SOF_SCAN_LIMIT, parseImageDimensions, sniffImageType } from "./image-header";
import { assertWithinRateLimit } from "./rate-limit";
import { PHOTO_MAX_DIMENSION, PHOTO_RETRY_CODE, RATE_LIMITS } from "./schema";

type Db = typeof defaultDb;

export const PHOTO_UPLOAD_RETRY_MESSAGE = "사진 업로드를 다시 진행해주세요";
// 코드는 client-safe한 schema에 정의돼 있다(폼이 이 코드로 첨부를 비운다 — P2-3).
const retryError = () => new DomainError(PHOTO_UPLOAD_RETRY_MESSAGE, PHOTO_RETRY_CODE);

// 파이프라인 견고성 수치(P2-2 확정) — 사진 10장 = 30회+ 외부 요청.
const PIPELINE_CONCURRENCY = 3;        // bounded concurrency(무제한 병렬 금지)
const PIPELINE_BUDGET_MS = 60_000;     // 검증·복사 전체 상한
const COMPENSATION_BUDGET_MS = 15_000; // 보상·정리 전용 별도 상한(P1-3)

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function buildTmpKey(contentType: string): string {
  return `posts/tmp/${uuidv7()}.${EXT_BY_TYPE[contentType] ?? "bin"}`;
}
// 최종 키 = 임시 키에서 tmp/ prefix 제거(uuid 유지 — 추적 가능·재서명 불필요).
// 최종 키는 presign이 발급된 적 없어 클라이언트 쓰기가 원천 불가(§결정 8).
export function finalKeyOf(tmpKey: string): string {
  return tmpKey.replace(/^posts\/tmp\//, "posts/");
}

export type IssuedClaim = { claimId: number; r2Key: string; uploadUrl: string };

// presign + claim 기록 — rate limit은 "생성되는 claim 수" 기준 배치 검사(§9, P1-3).
export async function issuePhotoClaims(
  accountId: string,
  files: { contentType: string; sizeBytes: number }[],
  db: Db = defaultDb,
): Promise<IssuedClaim[]> {
  await assertWithinRateLimit(
    RATE_LIMITS.presign,
    (since) => db.postPhotoClaim.count({ where: { accountId, createdAt: { gte: since } } }),
    files.length,
  );
  const expiresAt = new Date(Date.now() + UGC_PUT_TTL_SECONDS * 1000);
  return Promise.all(
    files.map(async (file) => {
      const r2Key = buildTmpKey(file.contentType);
      const claim = await db.postPhotoClaim.create({
        data: {
          accountId,
          r2Key,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          expiresAt,
        },
        select: { id: true },
      });
      const uploadUrl = await presignUgcPut(r2Key, file.contentType, file.sizeBytes);
      return { claimId: Number(claim.id), r2Key, uploadUrl };
    }),
  );
}

export type ConsumedClaim = {
  id: bigint;
  r2Key: string;
  contentType: string;
  sizeBytes: number;
};

// 원자 소비 — 소유권·미소비·미만료를 하나의 조건부 UPDATE로(§결정 8). 갱신 행 수가 요청과
// 다르면 throw → 짧은 tx 전체 롤백(P1-7 전체 롤백 계약). 같은 claim 동시 제출도 직렬화.
export async function consumePhotoClaims(
  accountId: string,
  claimIds: number[],
  db: Db = defaultDb,
): Promise<ConsumedClaim[]> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: bigint; r2_key: string; content_type: string; size_bytes: number }[]
    >`
      UPDATE post_photo_claim
      SET consumed_at = now(), updated_at = now()
      WHERE id IN (${Prisma.join(claimIds.map(BigInt))})
        AND account_id = ${accountId}::uuid
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id, r2_key, content_type, size_bytes`;
    if (rows.length !== claimIds.length) throw retryError();
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    return claimIds.map((claimId) => {
      const row = byId.get(claimId)!;
      return {
        id: row.id,
        r2Key: row.r2_key,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
      };
    });
  });
}

// 실측 검증(ETag 고정) → 조건부 복사. 실패 시 임시 객체 즉시 삭제(미등록 상태 — 증거 이슈 없음).
// signal = 파이프라인 전체 예산 — 모든 R2 호출에 전달해 진행 중 요청도 함께 중단시킨다(P1-3).
// cleanupSignal = 실패 경로 정리 전용 예산 — 예산 소진 후에도 정리는 시도하되, 무제한으로 늘어지지
// 않게 상한을 건다(예산 없이 두면 요청 10초 × 3회가 사진마다 더해져 전체 응답이 100초를 넘길 수 있다).
async function validateAndCopy(
  claim: ConsumedClaim,
  signal: AbortSignal,
  cleanupSignal: () => AbortSignal,
): Promise<string> {
  const head = await headUgcObject(claim.r2Key, { signal });
  if (!head) throw retryError(); // 미업로드
  try {
    // ① 선언값 대조 — presign 서명값(Content-Length·Type)과 실측이 다르면 거부.
    if (head.contentType !== claim.contentType || head.contentLength !== claim.sizeBytes) {
      throw retryError();
    }
    // ② 매직바이트 + ③ 픽셀 헤더(fail-closed) — range GET은 If-Match(ETag 고정).
    const bytes = await getUgcObjectRange(claim.r2Key, head.etag, 0, JPEG_SOF_SCAN_LIMIT - 1, { signal });
    const sniffed = sniffImageType(bytes);
    if (sniffed !== claim.contentType) throw retryError();
    const dims = parseImageDimensions(bytes, sniffed);
    if (!dims || dims.width > PHOTO_MAX_DIMENSION || dims.height > PHOTO_MAX_DIMENSION) {
      throw retryError();
    }
    // ④ 조건부 복사(임시→최종) — Copy 412는 "검증 후 교체" 시도 → 거부.
    const finalKey = finalKeyOf(claim.r2Key);
    await copyUgcObject(claim.r2Key, finalKey, head.etag, claim.contentType, { signal });
    return finalKey;
  } catch (error) {
    // 임시 객체 삭제는 파이프라인 예산이 아니라 cleanup 예산으로 시도한다 — 예산이 소진된 뒤에도
    // 정리 기회를 주되 총 시간을 묶는다(실패해도 posts/tmp/ lifecycle이 fallback).
    await deleteUgcObject(claim.r2Key, { signal: cleanupSignal() });
    if (error instanceof R2ConditionFailedError) throw retryError();
    throw error;
  }
}

// bounded concurrency 실행기 — 첫 실패 또는 예산 소진 시 신규 디스패치 중단, 진행 중 항목은
// settle 대기(진행 중 요청 자체는 signal이 중단시킨다).
async function mapBounded<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  let failure: unknown = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (failure === null && signal?.aborted !== true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await fn(items[index], index);
      } catch (error) {
        failure = failure ?? error;
      }
    }
  });
  await Promise.all(workers);
  if (failure !== null) throw failure;
  signal?.throwIfAborted(); // 실패 없이 예산만 소진된 경우
}

// 다중 사진 확정 — 부분 실패 시 누적 최종 객체 전체 보상 삭제(P1-7). 소비된 claim은
// 복구하지 않는다(새 업로드 요구 — UX 계약).
// budget·cleanupBudget은 테스트 주입 seam이다 — `AbortSignal.timeout`은 Node 내부 타이머라
// fake timer로 제어되지 않으므로, 테스트는 자체 AbortController를 넘겨 소진을 결정적으로 재현한다.
export async function finalizeClaimedPhotos(
  claims: ConsumedClaim[],
  options: { budget?: AbortSignal; cleanupBudget?: AbortSignal } = {},
): Promise<string[]> {
  // 전체 예산은 signal로 강제한다(P1-3) — 디스패치 직전 검사만으로는 이미 시작된 요청의
  // 재시도가 예산을 넘길 수 있다. 이 signal이 모든 R2 호출의 timeout과 결합된다.
  const budget = options.budget ?? AbortSignal.timeout(PIPELINE_BUDGET_MS);
  // 정리 예산은 "첫 실패 시점"부터 센다 — 파이프라인 시작 시각에 걸면 예산 소진 후에는 이미
  // 만료돼 정리 기회가 사라진다.
  let cleanup: AbortSignal | undefined = options.cleanupBudget;
  const cleanupSignal = () => (cleanup ??= AbortSignal.timeout(COMPENSATION_BUDGET_MS));

  const finalKeys: (string | undefined)[] = new Array(claims.length);
  try {
    await mapBounded(
      claims,
      PIPELINE_CONCURRENCY,
      async (claim, index) => {
        finalKeys[index] = await validateAndCopy(claim, budget, cleanupSignal);
      },
      budget,
    );
    return finalKeys as string[];
  } catch (error) {
    await compensateFinalObjects(
      finalKeys.filter((k): k is string => k !== undefined),
      cleanupSignal(),
    );
    // 예산 초과(AbortError 등)는 사용자에겐 재업로드 안내로 환원한다.
    if (budget.aborted && !(error instanceof DomainError)) throw retryError();
    throw error;
  }
}

// 보상 삭제 — 실패 키는 구조화 로그(버킷↔DB anti-join 정리 잡의 수거 대상, §후속).
// 검증·복사와 별도 예산·동시성 상한을 쓴다(P1-3) — 원 파이프라인 예산이 소진된 뒤 실행되기 때문.
export async function compensateFinalObjects(
  keys: string[],
  cleanupBudget?: AbortSignal,
): Promise<void> {
  if (keys.length === 0) return;
  const budget = cleanupBudget ?? AbortSignal.timeout(COMPENSATION_BUDGET_MS);
  await mapBounded(keys, PIPELINE_CONCURRENCY, async (key) => {
    let deleted = false;
    try {
      deleted = await deleteUgcObject(key, { signal: budget });
    } catch {
      deleted = false;
    }
    if (!deleted) console.error("[photo-orphan] 보상 삭제 실패 — 정리 잡 대상:", key);
  }).catch(() => {
    // 보상 단계의 예산 소진이 원래 실패 원인을 덮지 않게 흡수한다(로그는 위에서 남겼다).
  });
}

// DB 커밋 성공 후 임시 객체 정리(best-effort) — 실패는 posts/tmp/ lifecycle이 fallback.
// 절대 throw하지 않는다: 커밋된 글의 최종 객체를 보상 삭제하는 경로로 새어 나가면 안 된다(P2-1).
export async function cleanupTmpObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const budget = AbortSignal.timeout(COMPENSATION_BUDGET_MS);
  await mapBounded(keys, PIPELINE_CONCURRENCY, async (key) => {
    try {
      await deleteUgcObject(key, { signal: budget });
    } catch {
      // lifecycle fallback
    }
  }).catch(() => {});
}
```

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/photo-claim.test.ts` → Expected: PASS

- [x] **Step 5: Commit**

```bash
git add modules/posts/lib/photo-claim.ts tests/modules/posts/lib/photo-claim.test.ts
git commit -m "feat: 사진 claim 발급·원자 소비·실측 검증·보상 파이프라인 추가"
```

---

### Task 7: mutations — `createPost` 사진 파이프라인 통합

**Files:**
- Modify: `modules/posts/lib/mutations.ts`
- Test: `tests/modules/posts/lib/mutations.post.test.ts` (케이스 추가)

**Interfaces:**
- Consumes: Task 6 `consumePhotoClaims`·`finalizeClaimedPhotos`·`compensateFinalObjects`·`cleanupTmpObjects`
- Produces: `createPost(author, input: { topic; title; body; photos?: { claimId: number }[] }, db?)` — 사진 없으면 기존 경로 그대로(plain create), 있으면 소비→검증·복사→tx(post+photo INSERT)→커밋 후 임시 삭제.

- [x] **Step 1: 실패하는 테스트 작성** — `tests/modules/posts/lib/mutations.post.test.ts`에 추가. 파일 상단에 photo-claim 모듈 mock(`vi.hoisted` + `vi.mock`)을 추가하고, 기존 `makeDb()`에 `postPhoto.createMany`·`$transaction`을 보강한다:

```ts
const { photoClaim } = vi.hoisted(() => ({
  photoClaim: {
    consumePhotoClaims: vi.fn(),
    finalizeClaimedPhotos: vi.fn(),
    compensateFinalObjects: vi.fn(),
    cleanupTmpObjects: vi.fn(),
  },
}));
vi.mock("@/modules/posts/lib/photo-claim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/posts/lib/photo-claim")>();
  return { ...actual, ...photoClaim };
});
```

추가 케이스:

```ts
describe("createPost — 사진(§결정 8·P1-7)", () => {
  beforeEach(() => {
    photoClaim.consumePhotoClaims.mockResolvedValue([
      { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      { id: 2n, r2Key: "posts/tmp/b.jpg", contentType: "image/jpeg", sizeBytes: 14 },
    ]);
    photoClaim.finalizeClaimedPhotos.mockResolvedValue(["posts/a.jpg", "posts/b.jpg"]);
    photoClaim.compensateFinalObjects.mockResolvedValue(undefined);
    photoClaim.cleanupTmpObjects.mockResolvedValue(undefined);
  });

  it("사진 없으면 기존 경로(plain create) — 소비·tx 미호출", async () => {
    const db = makeDb();
    await createPost(author, { topic: "talk", title: "t", body: "b" }, db);
    expect(photoClaim.consumePhotoClaims).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("소비 → 검증·복사 → tx에서 post+photo INSERT(순서·썸네일=첫 장) → 임시 삭제", async () => {
    const db = makeDb();
    await createPost(author, {
      topic: "talk", title: "t", body: "b",
      photos: [{ claimId: 1 }, { claimId: 2 }],
    }, db);
    expect(photoClaim.consumePhotoClaims).toHaveBeenCalledWith(author.id, [1, 2], db);
    const created = db.tx.postPhoto.createMany.mock.calls[0][0].data;
    expect(created).toEqual([
      expect.objectContaining({ r2Key: "posts/a.jpg", displayOrder: 0, isThumbnail: true }),
      expect.objectContaining({ r2Key: "posts/b.jpg", displayOrder: 1, isThumbnail: false }),
    ]);
    expect(photoClaim.cleanupTmpObjects).toHaveBeenCalledWith(["posts/tmp/a.jpg", "posts/tmp/b.jpg"]);
    expect(photoClaim.compensateFinalObjects).not.toHaveBeenCalled();
  });

  it("최종 tx 실패(코드 재시도 소진 포함) 시 최종 객체 전체 보상 삭제 후 rethrow(P1-7)", async () => {
    const db = makeDb();
    db.tx.post.create.mockRejectedValue(new Error("insert fail"));
    await expect(
      createPost(author, { topic: "talk", title: "t", body: "b", photos: [{ claimId: 1 }, { claimId: 2 }] }, db),
    ).rejects.toThrow("insert fail");
    expect(photoClaim.compensateFinalObjects).toHaveBeenCalledWith(["posts/a.jpg", "posts/b.jpg"]);
    expect(photoClaim.cleanupTmpObjects).not.toHaveBeenCalled();
  });

  it("커밋 후 임시 정리가 실패해도 등록된 최종 객체는 보상 삭제하지 않는다(P2-1)", async () => {
    const db = makeDb();
    photoClaim.cleanupTmpObjects.mockRejectedValue(new Error("cleanup boom"));
    await expect(
      createPost(author, { topic: "talk", title: "t", body: "b", photos: [{ claimId: 1 }] }, db),
    ).rejects.toThrow("cleanup boom"); // 정리 실패는 그대로 드러나되
    expect(photoClaim.compensateFinalObjects).not.toHaveBeenCalled(); // 최종 객체는 보존
  });
});
```

`makeDb()`는 기존 헬퍼를 다음 형태로 보강한다(사진 tx 경로 — 기존 케이스와 호환되게 `tx`를 노출):

```ts
function makeDb() {
  const tx = {
    post: { create: vi.fn().mockResolvedValue({ id: 10n, publicCode: "code-1" }) },
    postPhoto: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return {
    tx,
    post: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ publicCode: "code-1" }), findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as never;
}
```

(기존 테스트가 자체 mock 셋을 쓰고 있으면 그 파일의 기존 구성 방식을 유지하면서 위 필드만 추가한다 — 테스트 파일 내 기존 케이스는 수정하지 않는 것이 원칙.)

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/mutations.post.test.ts` → Expected: 신규 케이스 FAIL

- [x] **Step 3: 구현** — `modules/posts/lib/mutations.ts`의 `createPost`를 교체하고 import 추가:

```ts
import {
  cleanupTmpObjects,
  compensateFinalObjects,
  consumePhotoClaims,
  finalizeClaimedPhotos,
} from "./photo-claim";
```

```ts
export async function createPost(
  author: Author,
  input: { topic: string; title: string; body: string; photos?: { claimId: number }[] },
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  await assertWithinRateLimit(RATE_LIMITS.post, (since) =>
    db.post.count({ where: { accountId: author.id, createdAt: { gte: since } } }),
  );

  const claimIds = (input.photos ?? []).map((p) => p.claimId);
  // 사진: ① claim 원자 소비(짧은 tx) → ② tx 밖 R2 검증·복사(§결정 8 — I/O 동안 DB tx 미유지).
  const consumed = claimIds.length ? await consumePhotoClaims(author.id, claimIds, db) : [];
  const finalKeys = consumed.length ? await finalizeClaimedPhotos(consumed) : [];

  const baseData = () => ({
    accountId: author.id,
    publicCode: generatePublicCode(),
    topic: input.topic,
    title: input.title,
    body: input.body,
    authorName: author.displayName,
    authorCode: author.publicCode,
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
    // ④ DB 반영 실패에 한해 누적 최종 객체 전체 보상 삭제(P1-7). 소비 claim은 미복구(새 업로드 요구).
    await compensateFinalObjects(finalKeys);
    throw error;
  }

  // ⑤ 커밋 성공 이후 단계는 보상 catch 밖에 둔다(P2-1) — 임시 객체 정리에서 무슨 일이 생겨도
  //    이미 글이 참조하는 최종 객체를 삭제하는 경로로 새어 나가면 안 된다.
  await cleanupTmpObjects(consumed.map((c) => c.r2Key));
  return { postPublicCode: created.publicCode };
}
```

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/mutations.post.test.ts` → Expected: PASS (기존 케이스 포함)

- [x] **Step 5: Commit**

```bash
git add modules/posts/lib/mutations.ts tests/modules/posts/lib/mutations.post.test.ts
git commit -m "feat: createPost에 사진 소비·검증·등록·보상 파이프라인 연결"
```

---

### Task 8: mutations — `updatePost` 잠금 계약(§11) + `deletePost` 사진 soft delete

**Files:**
- Modify: `modules/posts/lib/mutations.ts`
- Test: `tests/modules/posts/lib/mutations.post.test.ts` (케이스 추가·기존 updatePost 케이스 교체) · `tests/modules/posts/actions/post.test.ts` (**공통 tx mock 완성** — Task 11이 이 객체를 재사용)

**Interfaces:**
- Produces:
  - `updatePost` — tx + `FOR UPDATE` + 우선순위(moderation → has_comments) + 무변경 no-op + `edited_at`·`updated_at` 동시 갱신. 에러 문구: "글을 찾을 수 없습니다" / "운영 검토 중인 글은 수정할 수 없습니다" / "댓글이 작성된 글은 수정할 수 없습니다"
  - `deletePost` — tx로 post soft delete + 활성 사진 soft delete(`updated_at` 동반 갱신)

- [x] **Step 1: 실패하는 테스트 작성** — 기존 updatePost 케이스를 새 계약에 맞게 교체하고 추가한다. tx mock은 `$queryRaw`(FOR UPDATE row)·`postComment.count`·`post.update`·`postPhoto.updateMany`를 갖춘다:

```ts
function makeUpdateDb(row: {
  public_code?: string; topic?: string; title?: string; body?: string; hidden_at?: Date | null;
} | null, commentCount = 0) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(row === null ? [] : [{
      public_code: "code-1", topic: "talk", title: "t", body: "b", hidden_at: null, ...row,
    }]),
    postComment: { count: vi.fn().mockResolvedValue(commentCount) },
    post: { update: vi.fn().mockResolvedValue({}) , updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    postPhoto: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return {
    tx,
    post: { findFirst: vi.fn().mockResolvedValue({ publicCode: "code-1", hiddenAt: null }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as never;
}

describe("updatePost — §11 잠금 계약", () => {
  it("미존재·타인·삭제(FOR UPDATE 0행)는 같은 not-found 에러", async () => {
    const db = makeUpdateDb(null);
    await expect(updatePost("acc-1", { id: 1, topic: "talk", title: "t2", body: "b2" }, db))
      .rejects.toThrow("글을 찾을 수 없습니다");
  });

  it("운영 숨김은 moderation 에러 — 댓글이 있어도 moderation 우선", async () => {
    const db = makeUpdateDb({ hidden_at: new Date() }, 3);
    await expect(updatePost("acc-1", { id: 1, topic: "talk", title: "t2", body: "b2" }, db))
      .rejects.toThrow("운영 검토 중인 글은 수정할 수 없습니다");
  });

  it("미삭제 댓글 1개↑면 has_comments 에러(숨김 댓글도 카운트 — deletedAt null 조건만)", async () => {
    const db = makeUpdateDb({}, 1) as never as { tx: { postComment: { count: ReturnType<typeof vi.fn> } } };
    await expect(updatePost("acc-1", { id: 1, topic: "talk", title: "t2", body: "b2" }, db as never))
      .rejects.toThrow("댓글이 작성된 글은 수정할 수 없습니다");
    expect(db.tx.postComment.count.mock.calls[0][0].where).toEqual({ postId: 1n, deletedAt: null });
  });

  it("변경 시 edited_at·updated_at을 같은 now로 갱신(P2-1)", async () => {
    const db = makeUpdateDb({}) as never as { tx: { post: { update: ReturnType<typeof vi.fn> } } };
    await updatePost("acc-1", { id: 1, topic: "info", title: "t2", body: "b2" }, db as never);
    const data = db.tx.post.update.mock.calls[0][0].data;
    expect(data.editedAt).toBeInstanceOf(Date);
    expect(data.updatedAt).toBe(data.editedAt); // 같은 Date 인스턴스
  });

  it("무변경 저장은 성공 no-op — update 미호출·edited_at 미갱신(P2-2)", async () => {
    const db = makeUpdateDb({ topic: "talk", title: "t", body: "b" }) as never as { tx: { post: { update: ReturnType<typeof vi.fn> } } };
    const result = await updatePost("acc-1", { id: 1, topic: "talk", title: "t", body: "b" }, db as never);
    expect(result).toEqual({ postPublicCode: "code-1" });
    expect(db.tx.post.update).not.toHaveBeenCalled();
  });
});

describe("deletePost — 사진 동반 soft delete(P1-5)", () => {
  it("같은 tx에서 활성 사진을 soft delete하고 updated_at도 갱신", async () => {
    const db = makeUpdateDb({}) as never as {
      tx: { post: { updateMany: ReturnType<typeof vi.fn> }; postPhoto: { updateMany: ReturnType<typeof vi.fn> } };
      $transaction: ReturnType<typeof vi.fn>;
    };
    await deletePost("acc-1", 1, db as never);
    expect(db.$transaction).toHaveBeenCalled();
    const photoCall = db.tx.postPhoto.updateMany.mock.calls[0][0];
    expect(photoCall.where).toEqual({ postId: 1n, deletedAt: null });
    expect(photoCall.data.deletedAt).toBeInstanceOf(Date);
    expect(photoCall.data.updatedAt).toBe(photoCall.data.deletedAt);
  });
});
```

(기존 updatePost 테스트 중 `requireOwnedPost`·`updateMany` 기반 케이스는 새 계약과 충돌하므로 위 케이스로 **대체**한다 — 삭제 근거: §11이 계약 자체를 바꿨다.)

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/mutations.post.test.ts` → Expected: 신규·교체 케이스 FAIL

- [x] **Step 3: 구현** — `mutations.ts`의 `updatePost`·`deletePost`를 교체:

```ts
// §11 동시성 계약: ① tx → ② post FOR UPDATE → ③ 소유·숨김·삭제 재검증 → ④ 미삭제 댓글 확인
// → ⑤ 무변경 no-op / 변경 갱신 → ⑥ edited_at·updated_at 동시 커밋.
// createComment도 post를 먼저 잠그므로 update 선행/comment 선행 양방향이 직렬화된다.
export async function updatePost(
  accountId: string,
  input: { id: number; topic: string; title: string; body: string },
  db: Db = defaultDb,
): Promise<{ postPublicCode: string }> {
  const id = BigInt(input.id);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{
      public_code: string; topic: string; title: string; body: string; hidden_at: Date | null;
    }[]>`
      SELECT public_code, topic, title, body, hidden_at
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
    // 실제 변경 시에만 edited_at 갱신(P2-2) — 무변경 저장은 성공 no-op.
    const changed =
      post.topic !== input.topic || post.title !== input.title || post.body !== input.body;
    if (changed) {
      const now = new Date();
      await tx.post.update({
        where: { id },
        data: { topic: input.topic, title: input.title, body: input.body, editedAt: now, updatedAt: now },
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
```

- [x] **Step 4: `actions/post.test.ts`의 공통 트랜잭션 mock 완성** — 이 파일은 실제 mutations를 통과하므로
`updatePost`·`deletePost`가 tx 경로로 바뀌면 기존 케이스가 깨진다. **Task 11에서 다시 정의하지 않고
여기서 한 번만 만든다**(Task 11은 이 객체에 필드만 추가). 파일 상단 mock과 `beforeEach`를 이렇게 둔다:

```ts
// 공통 tx mock — update/delete(Task 8)와 사진 생성(Task 11)이 같은 객체를 공유한다.
const txQueryRaw = vi.fn();
const txCommentCount = vi.fn();
const txPostUpdate = vi.fn();
const txPostUpdateMany = vi.fn();
const txPhotoUpdateMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    post: { count, create, findFirst, updateMany },
    $transaction: transaction,
  },
}));
```

`beforeEach`에 추가:

```ts
  txQueryRaw.mockReset().mockResolvedValue([
    { public_code: "existing-code", topic: "talk", title: "제목", body: "본문", hidden_at: null },
  ]);
  txCommentCount.mockReset().mockResolvedValue(0);
  txPostUpdate.mockReset().mockResolvedValue({});
  txPostUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txPhotoUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txQueryRaw,
      post: { update: txPostUpdate, updateMany: txPostUpdateMany },
      postComment: { count: txCommentCount },
      postPhoto: { updateMany: txPhotoUpdateMany },
    }),
  );
```

**기존 케이스의 assertion도 tx 경로로 옮긴다** — write가 최상위 `updateMany`에서 tx 내부로 이동했으므로,
그대로 두면 happy path 2건이 실패하고 미호출 단언은 아무것도 보장하지 못한다:

| 대상 케이스 | 기존 | 변경 |
|---|---|---|
| `updatePost` happy | `expect(updateMany).toHaveBeenCalledTimes(1)` | `expect(txPostUpdate).toHaveBeenCalledTimes(1)` |
| `deletePost` happy | `expect(updateMany).toHaveBeenCalledTimes(1)` | `expect(txPostUpdateMany).toHaveBeenCalledTimes(1)` + `expect(txPhotoUpdateMany).toHaveBeenCalledTimes(1)` |
| update·delete 비로그인 | `expect(updateMany).not.toHaveBeenCalled()` | `expect(transaction).not.toHaveBeenCalled()` |
| update·delete zod 실패(id 0) | `expect(updateMany).not.toHaveBeenCalled()` | `expect(transaction).not.toHaveBeenCalled()` |

기존 최상위 `updateMany` 미호출 단언은 보조 검증으로 남겨도 되지만, **핵심 검증은 실제 write 경로인
tx mock을 대상으로 한다**. `deletePost`의 `requireOwnedPost`는 여전히 최상위 `findFirst`를 쓰므로
`publicCode: "existing-code"` 기대값은 그대로 유효하고, `updatePost`의 반환 코드는 `txQueryRaw`가
돌려주는 `public_code`에서 온다.

- [x] **Step 5: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/mutations.post.test.ts tests/modules/posts/actions/post.test.ts` → Expected: 양쪽 PASS(계약 문구는 기존과 동일).

- [x] **Step 6: Commit**

```bash
git add modules/posts/lib/mutations.ts tests/modules/posts/lib/mutations.post.test.ts tests/modules/posts/actions/post.test.ts
git commit -m "feat: 글 수정 잠금 계약과 edited_at·사진 동반 삭제 적용"
```

---

### Task 9: mutations — 신고 스냅샷 v2

**Files:**
- Modify: `modules/posts/lib/mutations.ts` (`createPostReport`만)
- Test: `tests/modules/posts/lib/mutations.report.test.ts` (케이스 추가)

**Interfaces:**
- Produces: `createPostReport`가 `version: 2` 스냅샷(photos 포함 — 없으면 `[]`) 저장. 댓글 신고는 v1 유지. post FOR UPDATE 잠금 아래에서 본문·사진 목록 동결(P1-5).

- [x] **Step 1: 실패하는 테스트 작성** — `mutations.report.test.ts`의 fakeTx에 `postPhoto.findMany`를 추가하고 케이스 추가:

```ts
it("글 신고 스냅샷은 v2 — 사진 키·표시 순서 동결(post 잠금 하)", async () => {
  tx.postPhoto.findMany.mockResolvedValue([
    { r2Key: "posts/a.jpg", displayOrder: 0 },
    { r2Key: "posts/b.jpg", displayOrder: 1 },
  ]);
  await createPostReport("reporter-1", { targetId: 1, reason: "spam" }, db);
  const snapshot = tx.postReport.create.mock.calls[0][0].data.snapshot;
  expect(snapshot.version).toBe(2);
  expect(snapshot.photos).toEqual([
    { r2Key: "posts/a.jpg", displayOrder: 0 },
    { r2Key: "posts/b.jpg", displayOrder: 1 },
  ]);
  expect(tx.postPhoto.findMany.mock.calls[0][0].where).toEqual({ postId: 1n, deletedAt: null });
});

it("사진 없는 글도 항상 v2·photos:[] (P1-5 — 신규 신고는 v1로 저장하지 않는다)", async () => {
  tx.postPhoto.findMany.mockResolvedValue([]);
  await createPostReport("reporter-1", { targetId: 1, reason: "spam" }, db);
  const snapshot = tx.postReport.create.mock.calls[0][0].data.snapshot;
  expect(snapshot).toMatchObject({ version: 2, photos: [] });
});

it("댓글 신고 스냅샷은 v1 유지(사진 없음)", async () => {
  await createCommentReport("reporter-1", { targetId: 5, reason: "abuse" }, db);
  expect(tx.postCommentReport.create.mock.calls[0][0].data.snapshot.version).toBe(1);
});
```

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/mutations.report.test.ts` → Expected: FAIL

- [x] **Step 3: 구현** — `createPostReport`의 tx 본문에서 `tx.postReport.create` 직전에 사진 조회를 추가하고 snapshot을 v2로 교체:

```ts
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
```

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/mutations.report.test.ts` → Expected: PASS

- [x] **Step 5: Commit**

```bash
git add modules/posts/lib/mutations.ts tests/modules/posts/lib/mutations.report.test.ts
git commit -m "feat: 글 신고 스냅샷을 v2로 확장(사진 키·순서 동결)"
```

---

### Task 10: queries — 사진 서명 URL·`lockedReason`·capability·증거 조회

**Files:**
- Modify: `modules/posts/lib/queries.ts`
- Test: `tests/modules/posts/lib/queries.test.ts` (케이스 추가·getEditablePost 케이스 교체)

**Interfaces:**
- Consumes: `getSignedUgcGetUrl`(Task 3), `postReportSnapshot`(Task 5), `LockedReason`(Task 5)
- Produces:
  - `listPosts` — 활성 사진 **개수만** 집계(`Post.photoCount`). 목록에선 서명 URL을 발급하지 않는다
  - `getPostByPublicCode` — `PostDetailView.photos`(활성 사진, display_order ASC, 서명 URL) + `capabilities.canEdit = isOwner && 미삭제 댓글 0`(visible 글만 조회되므로 moderation은 자연 배제). 사진 조회는 **글 노출·소속을 같은 조회에서 재확인하는 단일 JOIN**(P1-2)
  - `getEditablePost(publicCode, accountId, db?): Promise<{ post: Post; lockedReason: LockedReason } | null>` — 우선순위 moderation → has_comments → null
  - `getReportEvidencePhotoUrl(reportId: number, photoIndex: number, db?): Promise<string>` — snapshot v2의 photos[photoIndex] 키만 서명(admin 액션 전용, DomainError로 미존재·범위 밖·v1 거부)

- [x] **Step 1: 실패하는 테스트 작성** — `tests/modules/posts/lib/queries.test.ts` 상단에 ugc mock 추가:

```ts
vi.mock("@/lib/r2/ugc", () => ({
  getSignedUgcGetUrl: vi.fn(async (key: string) => `signed:${key}`),
  UGC_GET_TTL_SECONDS: 900,
}));
```

케이스 추가. 이 describe들은 자체 db 팩토리를 쓰므로 파일의 기존 케이스와 독립이다(기존 케이스는 수정하지 않는다). 파일에 `beforeEach(() => vi.clearAllMocks())`가 없으면 추가한다:

```ts
// 사진·잠금 케이스 전용 db 팩토리 — 기존 케이스의 mock 구성과 섞이지 않도록 분리한다.
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
          id: 1n, accountId: "owner-1", publicCode: "code-1", topic: "talk", title: "t", body: "b",
          editedAt: null, authorName: "a", authorCode: "AC1",
          hiddenAt: null, hiddenReason: null, hiddenBy: null, deletedAt: null,
          createdAt: new Date("2026-07-26T00:00:00Z"), updatedAt: new Date("2026-07-26T00:00:00Z"),
          ...over.post,
        };
  const commentRows = (over.comments ?? []).map((c, index) => ({
    id: BigInt(index + 1), postId: 1n, accountId: "other-1", parentId: null, body: "c",
    authorName: "n", authorCode: "OC1", hiddenReason: null, hiddenBy: null,
    createdAt: new Date("2026-07-26T00:10:00Z"), updatedAt: new Date("2026-07-26T00:10:00Z"),
    ...c,
  }));
  return {
    post: {
      findFirst: vi.fn().mockResolvedValue(postRow),
      findMany: vi.fn().mockResolvedValue(postRow ? [postRow] : []),
      count: vi.fn().mockResolvedValue(postRow ? 1 : 0),
    },
    postComment: {
      findMany: vi.fn().mockResolvedValue(commentRows),
      count: vi.fn().mockResolvedValue(
        over.commentCount ?? commentRows.filter((c) => c.deletedAt === null).length,
      ),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    postPhoto: {
      groupBy: vi.fn().mockResolvedValue([{ postId: 1n, _count: { _all: over.photoCount ?? 2 } }]),
    },
    postReport: { findFirst: vi.fn().mockResolvedValue(over.report ?? null) },
    $queryRaw: vi.fn().mockResolvedValue(over.photoRows ?? []),
  } as never;
}
const mockOf = (db: unknown, path: string) =>
  path.split(".").reduce<never>((acc, key) => (acc as never as Record<string, never>)[key], db as never) as unknown as ReturnType<typeof vi.fn>;

describe("사진 서빙 — 서명 URL 발급 규칙(§결정 8·P1-2)", () => {
  const photoRows = [
    { id: 1n, r2_key: "posts/a.jpg", display_order: 0, is_thumbnail: true },
    { id: 2n, r2_key: "posts/b.jpg", display_order: 1, is_thumbnail: false },
  ];

  it("상세: 활성 사진을 display_order ASC로 서명 URL 발급", async () => {
    const db = makeQueriesDb({ photoRows });
    const view = await getPostByPublicCode("code-1", null, db);
    expect(view!.photos).toEqual([
      { id: 1, url: "signed:posts/a.jpg", displayOrder: 0, isThumbnail: true },
      { id: 2, url: "signed:posts/b.jpg", displayOrder: 1, isThumbnail: false },
    ]);
    expect(view!.post.photoCount).toBe(2);
  });

  it("사진 키는 글 노출·소속을 함께 검증하는 단일 JOIN에서 도출한다(P1-2)", async () => {
    const db = makeQueriesDb({ photoRows });
    await getPostByPublicCode("code-1", null, db);
    const sql = (mockOf(db, "$queryRaw").mock.calls[0][0] as string[]).join("?");
    expect(sql).toContain("JOIN post p ON p.id = ph.post_id"); // 소속 검증
    expect(sql).toContain("p.hidden_at IS NULL");
    expect(sql).toContain("p.deleted_at IS NULL");
    expect(sql).toContain("ph.deleted_at IS NULL");
  });

  it("미발급: 글 미존재·숨김·삭제면 상세가 null이고 서명 쿼리 자체를 하지 않는다", async () => {
    const db = makeQueriesDb({ post: null }); // VISIBLE 필터에 걸린 숨김·삭제도 동일하게 0행
    expect(await getPostByPublicCode("code-1", null, db)).toBeNull();
    expect(mockOf(db, "post.findFirst").mock.calls[0][0].where).toMatchObject({
      publicCode: "code-1", hiddenAt: null, deletedAt: null,
    });
    expect(mockOf(db, "$queryRaw")).not.toHaveBeenCalled();
  });

  it("미발급: 사진 미존재·soft delete·타 글 소속이면 JOIN이 0행 → photos 빈 배열", async () => {
    const db = makeQueriesDb({ photoRows: [], photoCount: 0 });
    const view = await getPostByPublicCode("code-1", null, db);
    expect(view!.photos).toEqual([]);
    expect(view!.post.photoCount).toBe(0);
  });

  it("목록: 서명 URL을 발급하지 않고 사진 개수만 싣는다", async () => {
    const { getSignedUgcGetUrl } = await import("@/lib/r2/ugc");
    const db = makeQueriesDb({ photoCount: 3 });
    const page = await listPosts({}, db);
    expect(page.items[0].photoCount).toBe(3);
    expect(getSignedUgcGetUrl).not.toHaveBeenCalled();
  });
});

describe("capability·getEditablePost — lockedReason 우선순위(§11)", () => {
  it("canEdit: 본인이어도 미삭제 댓글이 있으면 false(숨김 댓글도 카운트), 삭제는 허용", async () => {
    const db = makeQueriesDb({ comments: [{ hiddenAt: new Date(), deletedAt: null }] });
    const view = await getPostByPublicCode("code-1", "owner-1", db);
    expect(view!.capabilities.canEdit).toBe(false);
    expect(view!.capabilities.canDelete).toBe(true);
  });

  it("canEdit: 삭제된 댓글만 있으면 true", async () => {
    const db = makeQueriesDb({ comments: [{ hiddenAt: null, deletedAt: new Date() }] });
    const view = await getPostByPublicCode("code-1", "owner-1", db);
    expect(view!.capabilities.canEdit).toBe(true);
  });

  it("getEditablePost: 숨김이면서 댓글도 있으면 moderation 우선", async () => {
    const db = makeQueriesDb({ post: { hiddenAt: new Date() }, commentCount: 3 });
    const result = await getEditablePost("code-1", "owner-1", db);
    expect(result!.lockedReason).toBe("moderation");
  });

  it("getEditablePost: 댓글만이면 has_comments, 둘 다 없으면 null", async () => {
    const withComments = makeQueriesDb({ commentCount: 1 });
    expect((await getEditablePost("code-1", "owner-1", withComments))!.lockedReason).toBe("has_comments");

    const clean = makeQueriesDb({ commentCount: 0 });
    expect((await getEditablePost("code-1", "owner-1", clean))!.lockedReason).toBeNull();
    // 숨김 댓글도 잠금 사유에 포함되도록 deletedAt만 거른다.
    expect(mockOf(clean, "postComment.count").mock.calls[0][0].where).toEqual({
      postId: 1n, deletedAt: null,
    });
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
    await expect(getReportEvidencePhotoUrl(1, 0, db)).resolves.toBe("signed:posts/a.jpg");
  });

  it("범위 밖 photoIndex는 거부한다", async () => {
    const db = makeQueriesDb({ report: { snapshot: snapshotV2 } });
    await expect(getReportEvidencePhotoUrl(1, 5, db)).rejects.toThrow("증거 사진을 찾을 수 없습니다");
  });

  it("v1 스냅샷·미존재 신고는 거부한다", async () => {
    const v1Db = makeQueriesDb({ report: { snapshot: snapshotV1 } });
    await expect(getReportEvidencePhotoUrl(1, 0, v1Db)).rejects.toThrow("사진 증거가 없는 신고입니다");
    const missing = makeQueriesDb({ report: null });
    await expect(getReportEvidencePhotoUrl(9, 0, missing)).rejects.toThrow("신고를 찾을 수 없습니다");
  });

  it("대상이 숨김·삭제된 뒤에도 증거는 발급된다(공개 signer와 분리 — §7)", async () => {
    const db = makeQueriesDb({ post: { hiddenAt: new Date() }, report: { snapshot: snapshotV2 } });
    await expect(getReportEvidencePhotoUrl(1, 0, db)).resolves.toBe("signed:posts/a.jpg");
  });
});
```

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/queries.test.ts` → Expected: FAIL

- [x] **Step 3: 구현** — `modules/posts/lib/queries.ts` 수정.

import 추가:

```ts
import { DomainError } from "@/lib/action-result";
import { getSignedUgcGetUrl } from "@/lib/r2/ugc";
import { postReportSnapshot } from "./schema";
import type { LockedReason, PostPhotoView } from "../types";
```

`listPosts`의 `counts` 계산 다음에 썸네일 조회를 추가하고 `items` 매핑을 교체:

```ts
  // 사진은 개수만 집계한다 — 목록은 뱃지만 노출하므로 서명 URL을 발급하지 않는다(대역폭·서명 비용 0).
  const photoCounts = rows.length
    ? await db.postPhoto.groupBy({
        by: ["postId"],
        where: { postId: { in: rows.map((r) => r.id) }, deletedAt: null },
        _count: { _all: true },
      })
    : [];
  const photoCountByPost = new Map(photoCounts.map((c) => [c.postId.toString(), c._count._all]));
  return {
    items: rows.map((r) =>
      toPost(r, countByPost.get(r.id.toString()) ?? 0, photoCountByPost.get(r.id.toString()) ?? 0),
    ),
    total, page, pageSize: POST_PAGE_SIZE,
  };
```

`getPostByPublicCode`를 교체:

```ts
export async function getPostByPublicCode(
  code: string,
  viewerAccountId: string | null,
  db: Db = defaultDb,
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
  return {
    post: toPost(row, visibleCount, photos.length),
    capabilities: {
      canEdit: isOwner && undeletedCount === 0,
      canDelete: isOwner,
      canReport: viewerAccountId !== null && !isOwner,
    },
    comments: buildCommentTree(commentRows, viewerAccountId),
    photos,
  };
}
```

`getEditablePost`를 교체:

```ts
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
  return { post: toPost(row, 0), lockedReason };
}
```

파일 끝에 admin 증거 조회 추가:

```ts
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
```

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/queries.test.ts && npm run typecheck` → Expected: PASS (Task 5의 타입 확장이 여기서 완전 해소)

- [x] **Step 5: Commit**

```bash
git add modules/posts/lib/queries.ts tests/modules/posts/lib/queries.test.ts
git commit -m "feat: 사진 서명 서빙·잠금 사유·admin 증거 조회를 읽기 계층에 추가"
```

---

### Task 11: actions — `photo.ts`(presign·admin 증거) + 재노출

**Files:**
- Create: `modules/posts/actions/photo.ts`
- Modify: `modules/posts/actions/index.ts`
- Test: `tests/modules/posts/actions/photo.test.ts` (신규), `tests/modules/posts/actions/post.test.ts` (photos 통과 케이스 추가)

**Interfaces:**
- Produces:
  - `presignPostPhotos(input: unknown): Promise<ActionResult<IssuedClaim[]>>` — 로그인 → zod(presignPhotosSchema) → `issuePhotoClaims`
  - `signReportEvidencePhoto(input: unknown): Promise<ActionResult<{ url: string }>>` — **`requireAdmin()`을 parse보다 먼저**(P1-4) → zod(evidenceSchema) → `getReportEvidencePhotoUrl`

- [x] **Step 1: 실패하는 테스트 작성** — `tests/modules/posts/actions/photo.test.ts` 전문(기존 actions 테스트 패턴 — `vi.hoisted` auth·admin 스텁 + 모듈 mock):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentAccount, mockRequireAdmin, mockIssue, mockEvidenceUrl } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockIssue: vi.fn(),
  mockEvidenceUrl: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount: mockGetCurrentAccount }));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/modules/posts/lib/photo-claim", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/posts/lib/photo-claim")>()),
  issuePhotoClaims: mockIssue,
}));
vi.mock("@/modules/posts/lib/queries", () => ({ getReportEvidencePhotoUrl: mockEvidenceUrl }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));

beforeEach(() => {
  vi.resetModules();
  mockGetCurrentAccount.mockReset().mockResolvedValue({ id: "acc-1", displayName: "u", publicCode: "UC1" });
  mockRequireAdmin.mockReset().mockResolvedValue({ id: "admin-1", isAdmin: true });
  mockIssue.mockReset().mockResolvedValue([{ claimId: 1, r2Key: "posts/tmp/a.jpg", uploadUrl: "https://put" }]);
  mockEvidenceUrl.mockReset().mockResolvedValue("https://signed-get");
});

describe("presignPostPhotos", () => {
  it("미로그인은 /login 리다이렉트", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { presignPostPhotos } = await import("@/modules/posts/actions/photo");
    await expect(
      presignPostPhotos({ files: [{ contentType: "image/jpeg", sizeBytes: 1 }] }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("미허용 MIME·초과 크기는 invalid_input(ok:false)", async () => {
    const { presignPostPhotos } = await import("@/modules/posts/actions/photo");
    const result = await presignPostPhotos({ files: [{ contentType: "image/heic", sizeBytes: 1 }] });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("정상 입력이면 claim 목록 반환", async () => {
    const { presignPostPhotos } = await import("@/modules/posts/actions/photo");
    const result = await presignPostPhotos({ files: [{ contentType: "image/jpeg", sizeBytes: 100 }] });
    expect(result).toEqual({ ok: true, data: [{ claimId: 1, r2Key: "posts/tmp/a.jpg", uploadUrl: "https://put" }] });
    expect(mockIssue).toHaveBeenCalledWith("acc-1", [{ contentType: "image/jpeg", sizeBytes: 100 }]);
  });
});

describe("signReportEvidencePhoto — P1-4", () => {
  it("비관리자는 입력 파싱 전에 거부된다(requireAdmin 선실행)", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { signReportEvidencePhoto } = await import("@/modules/posts/actions/photo");
    await expect(signReportEvidencePhoto({ reportId: "잘못된 타입" })).rejects.toThrow(/관리자/);
    expect(mockEvidenceUrl).not.toHaveBeenCalled();
  });

  it("정상 입력이면 snapshot 키 서명 URL 반환", async () => {
    const { signReportEvidencePhoto } = await import("@/modules/posts/actions/photo");
    const result = await signReportEvidencePhoto({ reportId: 1, photoIndex: 0 });
    expect(result).toEqual({ ok: true, data: { url: "https://signed-get" } });
    expect(mockEvidenceUrl).toHaveBeenCalledWith(1, 0);
  });

  it("잘못된 photoIndex 형은 invalid_input", async () => {
    const { signReportEvidencePhoto } = await import("@/modules/posts/actions/photo");
    const result = await signReportEvidencePhoto({ reportId: 1, photoIndex: -1 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
  });
});
```

`tests/modules/posts/actions/post.test.ts`에 추가. 이 파일은 `@/lib/db`를 mock하고 **실제 mutations를 통과**하므로,
사진 경로를 태우려면 기존 db mock에 트랜잭션 계열을 보강해야 한다. 계정은 파일 상단의 `ACCOUNT`
fixture(UUID)를 그대로 쓴다 — 하드코딩한 문자열을 쓰면 실패한다:

**Task 8 Step 4의 `beforeEach`에 있는 transaction mock을 아래 최종 형태로 확장한다** — Task 8이 넣은
`$queryRaw`·`post.update`·`post.updateMany`·`postComment.count`·`postPhoto.updateMany`는 **모두 보존**하고
`post.create`·`postPhoto.createMany`만 더한다(이 필드들을 빠뜨린 채 대입하면 update·delete 케이스가 깨진다).
파일 상단에 두 mock을 추가하고:

```ts
const txPostCreate = vi.fn();
const txPhotoCreateMany = vi.fn();
```

`beforeEach`의 transaction mock을 다음 최종 형태로 만든다(Task 8 필드 보존 + 2개 추가):

```ts
  txPostCreate.mockReset().mockResolvedValue({ id: 10n, publicCode: "new-code" });
  txPhotoCreateMany.mockReset().mockResolvedValue({ count: 1 });
  transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txQueryRaw,
      post: { create: txPostCreate, update: txPostUpdate, updateMany: txPostUpdateMany },
      postComment: { count: txCommentCount },
      postPhoto: { createMany: txPhotoCreateMany, updateMany: txPhotoUpdateMany },
    }),
  );
```

케이스:

```ts
it("createPost 입력의 photos가 zod를 통과해 mutation까지 전달된다", async () => {
  const consume = vi.fn().mockResolvedValue([
    { id: 3n, r2Key: "posts/tmp/c.jpg", contentType: "image/jpeg", sizeBytes: 10 },
  ]);
  vi.doMock("@/modules/posts/lib/photo-claim", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/modules/posts/lib/photo-claim")>()),
    consumePhotoClaims: consume,
    finalizeClaimedPhotos: vi.fn().mockResolvedValue(["posts/c.jpg"]),
    cleanupTmpObjects: vi.fn().mockResolvedValue(undefined),
    compensateFinalObjects: vi.fn().mockResolvedValue(undefined),
  }));
  const { createPost } = await import("@/modules/posts/actions/post");

  const result = await createPost({ topic: "talk", title: "제목", body: "본문", photos: [{ claimId: 3 }] });

  expect(result).toEqual({ ok: true, data: { postPublicCode: "new-code" } });
  // claimId 목록이 세션 계정(UUID fixture)과 함께 그대로 전달된다.
  expect(consume).toHaveBeenCalledWith(ACCOUNT.id, [3], expect.anything());
  // 사진이 있으면 tx 경로로 들어가 post+photo가 함께 INSERT된다.
  expect(txPhotoCreateMany).toHaveBeenCalledTimes(1);
  expect(txPhotoCreateMany.mock.calls[0][0].data).toEqual([
    expect.objectContaining({ r2Key: "posts/c.jpg", displayOrder: 0, isThumbnail: true }),
  ]);
});

it("photos claimId가 중복이면 invalid_input으로 거부한다", async () => {
  const { createPost } = await import("@/modules/posts/actions/post");
  const result = await createPost({
    topic: "talk", title: "제목", body: "본문", photos: [{ claimId: 3 }, { claimId: 3 }],
  });
  expect(result).toMatchObject({ ok: false, code: "invalid_input" });
});
```

(`vi.doMock`은 이 파일이 케이스마다 `vi.resetModules()` 후 동적 import하는 기존 패턴과 맞물려 동작한다.)

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/actions/photo.test.ts` → Expected: FAIL

- [x] **Step 3: 구현** — `modules/posts/actions/photo.ts` 전문:

```ts
"use server";
import { redirect } from "next/navigation";
import { type ActionResult, parseActionInput, runAction } from "@/lib/action-result";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { evidenceSchema, presignPhotosSchema } from "../lib/schema";
import { type IssuedClaim, issuePhotoClaims } from "../lib/photo-claim";
import { getReportEvidencePhotoUrl } from "../lib/queries";

// presign — 재인코딩된 최종 Blob의 type·size를 받는다(P1-1 순서: Blob 확정 후 호출).
export async function presignPostPhotos(
  input: unknown,
): Promise<ActionResult<IssuedClaim[]>> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) redirect("/login");
    const data = parseActionInput(presignPhotosSchema, input);
    return issuePhotoClaims(account.id, data.files);
  });
}

// admin 증거 signer(P1-4) — requireAdmin을 입력 파싱보다 먼저 실행한다.
// snapshot에 실제 포함된 사진 키만 서명(임의 r2Key 클라 입력 서명 금지) — 조회는 queries가 담당.
export async function signReportEvidencePhoto(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(evidenceSchema, input);
    return { url: await getReportEvidencePhotoUrl(data.reportId, data.photoIndex) };
  });
}
```

`modules/posts/actions/index.ts`에 추가:

```ts
export { presignPostPhotos, signReportEvidencePhoto } from "./photo";
```

(`actions/post.ts`는 수정 불필요 — `postCreateSchema`가 photos를 포함하므로 `data`가 그대로 `m.createPost`로 흐른다.)

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/modules/posts/actions` → Expected: PASS

- [x] **Step 5: Commit**

```bash
git add modules/posts/actions/photo.ts modules/posts/actions/index.ts tests/modules/posts/actions/photo.test.ts tests/modules/posts/actions/post.test.ts
git commit -m "feat: 사진 presign·admin 증거 서명 액션 추가"
```

---

### Task 12: 클라 업로드 — `photo-upload-client.ts` + `PostPhotoUploader` + PostForm 통합

**Files:**
- Create: `modules/posts/lib/photo-upload-client.ts`, `modules/posts/components/PostPhotoUploader.tsx`
- Modify: `modules/posts/components/PostForm.tsx`
- Test: `tests/modules/posts/lib/photo-upload-client.test.ts`

리뷰어 P2-5 반영: 업로더의 비동기 로직(순서·재시도·HEIC 거부)은 **순수 모듈로 분리해 단위 테스트**하고, 컴포넌트는 얇은 배선만 담당한다(컴포넌트 테스트 인프라 미도입 유지 — collection 선례).

**Interfaces:**
- Produces:
  - `photo-upload-client.ts`(클라 전용, `server-only` 없음):
    - `type UploadedPhotoItem = { claimId: number; previewUrl: string; sizeBytes: number }`
    - `preparePhotos(files, ctx, deps)` — 재인코딩→Blob 검증→presign→PUT을 한 번에. `ctx = { existingCount: number; existingTotalBytes: number }`, `deps = { reencode; presign; put }`(DI). 반환 `{ items: UploadedPhotoItem[]; errors: string[] }`
    - `putWithRetry(put, url, blob)` — 재시도 규칙(Global Constraints)
    - `reencodeToBlob(file, maxDimension)` — canvas 재인코딩(브라우저 전용 — 테스트에서는 DI로 대체)
    - `revokePreviews(items)` — `URL.revokeObjectURL` 일괄 해제(P2-3)
  - `PostPhotoUploader` props: `{ items; onChange; disabled?; onUploadingChange?: (uploading: boolean) => void }` — 업로드 진행 상태를 부모에 올린다(P1-4)
  - `PostForm` props 변경: `locked?: boolean` → `lockedReason?: LockedReason` · new 모드에서 photos 제출 · **업로드 중에는 등록·취소·삭제 비활성**(P1-4) · `photo_retry` 코드 수신 시 첨부 상태 초기화(P2-3)

- [x] **Step 1: 실패하는 테스트 작성** — `tests/modules/posts/lib/photo-upload-client.test.ts` 전문:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { preparePhotos, putWithRetry } from "@/modules/posts/lib/photo-upload-client";

const jpegBlob = (size = 1000) =>
  new Blob([new Uint8Array(size)], { type: "image/jpeg" });
const file = (name: string, type: string) =>
  new File([new Uint8Array(10)], name, { type });

// jsdom 없이도 동작해야 하는 순수 로직 — previewUrl 생성은 DI가 아닌 URL.createObjectURL이므로 스텁.
beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:preview"),
  });
});

function makeDeps(over: Partial<Parameters<typeof preparePhotos>[2]> = {}) {
  return {
    reencode: vi.fn(async () => jpegBlob()),
    presign: vi.fn(async (files: { contentType: string; sizeBytes: number }[]) => ({
      ok: true as const,
      data: files.map((_, i) => ({ claimId: i + 1, r2Key: `posts/tmp/${i}.jpg`, uploadUrl: `https://put/${i}` })),
    })),
    put: vi.fn(async () => ({ status: 200 })),
    ...over,
  };
}

describe("preparePhotos — 순서 계약(P1-1)", () => {
  it("재인코딩→최종 Blob 확정→검증→presign→동일 Blob PUT 순서", async () => {
    const deps = makeDeps();
    const result = await preparePhotos([file("a.jpg", "image/jpeg")], { existingCount: 0, existingTotalBytes: 0 }, deps);
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([{ claimId: 1, previewUrl: "blob:preview", sizeBytes: 1000 }]);
    // presign 입력이 "재인코딩된 Blob"의 type·size여야 한다(원본 File 아님).
    expect(deps.presign).toHaveBeenCalledWith([{ contentType: "image/jpeg", sizeBytes: 1000 }]);
    // PUT은 presign과 같은 Blob 인스턴스.
    const putBlob = deps.put.mock.calls[0][1];
    expect(putBlob).toBe(await deps.reencode.mock.results[0].value);
    // 호출 순서: reencode가 presign보다 먼저.
    expect(deps.reencode.mock.invocationCallOrder[0]).toBeLessThan(deps.presign.mock.invocationCallOrder[0]);
  });

  it("HEIC는 선택 단계에서 거부 + [heic-reject] 로그(P2-4)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps();
    const result = await preparePhotos([file("a.heic", "image/heic")], { existingCount: 0, existingTotalBytes: 0 }, deps);
    expect(result.items).toEqual([]);
    expect(result.errors[0]).toContain("지원하지 않는 이미지 형식");
    expect(warn).toHaveBeenCalledWith("[heic-reject]", "image/heic");
    expect(deps.reencode).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("재인코딩 실패(디코딩 불가)도 파일 단위 오류로 수집", async () => {
    const deps = makeDeps({ reencode: vi.fn(async () => { throw new Error("decode fail"); }) });
    const result = await preparePhotos([file("broken.png", "image/png")], { existingCount: 0, existingTotalBytes: 0 }, deps);
    expect(result.items).toEqual([]);
    expect(result.errors[0]).toContain("처리할 수 없습니다");
  });

  it("최종 Blob 기준 5MB 초과·기존 합산 10장/30MB 초과 거부", async () => {
    const big = makeDeps({ reencode: vi.fn(async () => jpegBlob(5 * 1024 * 1024 + 1)) });
    const r1 = await preparePhotos([file("a.jpg", "image/jpeg")], { existingCount: 0, existingTotalBytes: 0 }, big);
    expect(r1.errors[0]).toContain("5MB");

    const deps = makeDeps();
    const r2 = await preparePhotos([file("a.jpg", "image/jpeg")], { existingCount: 10, existingTotalBytes: 0 }, deps);
    expect(r2.errors[0]).toContain("최대 10장");

    const r3 = await preparePhotos([file("a.jpg", "image/jpeg")], { existingCount: 0, existingTotalBytes: 30 * 1024 * 1024 }, deps);
    expect(r3.errors[0]).toContain("30MB");
  });

  it("presign 실패(ok:false)는 그대로 오류로 전달", async () => {
    const deps = makeDeps({ presign: vi.fn(async () => ({ ok: false as const, message: "요청이 너무 잦습니다" })) });
    const result = await preparePhotos([file("a.jpg", "image/jpeg")], { existingCount: 0, existingTotalBytes: 0 }, deps);
    expect(result.errors).toEqual(["요청이 너무 잦습니다"]);
  });
});

describe("putWithRetry — 재시도 규칙(P2-2 확정)", () => {
  // 이 403 분기는 same-origin·비-R2 저장소용 방어다. 실 R2에서 크기 계약 위반의 403은
  // CORS 헤더가 없어 브라우저가 읽지 못하고 fetch가 throw하므로, 아래 "네트워크 오류" 케이스가
  // 실제 위반 경로를 담당한다(2026-08-01 게이트 발견 — Global Constraints 참조).
  it("200/204 즉시 성공, 4xx(403)는 재시도 없이 실패", async () => {
    await expect(putWithRetry(vi.fn(async () => ({ status: 204 })), "u", jpegBlob())).resolves.toBeUndefined();
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
    const netThen412 = vi.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({ status: 412 });
    await expect(putWithRetry(netThen412, "u", jpegBlob())).resolves.toBeUndefined();

    const fiveThen200 = vi.fn()
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

- [x] **Step 2: 실패 확인** — Run: `npx vitest run tests/modules/posts/lib/photo-upload-client.test.ts` → Expected: FAIL

- [x] **Step 3: 구현** — `modules/posts/lib/photo-upload-client.ts` 전문:

```ts
// 클라 업로드 순수 로직(P1-1 순서 계약) — 컴포넌트는 이 모듈의 얇은 배선만 담당한다.
// deps DI(reencode·presign·put)로 브라우저 API 없이 단위 테스트한다(리뷰 P2-5).
import {
  PHOTO_ALLOWED_TYPES,
  PHOTO_MAX_COUNT,
  PHOTO_MAX_FILE_BYTES,
  PHOTO_MAX_TOTAL_BYTES,
} from "./schema";

export type UploadedPhotoItem = { claimId: number; previewUrl: string; sizeBytes: number };

export type PresignResult =
  | { ok: true; data: { claimId: number; r2Key: string; uploadUrl: string }[] }
  | { ok: false; message: string };

export type PreparePhotoDeps = {
  reencode: (file: File) => Promise<Blob>;
  presign: (files: { contentType: string; sizeBytes: number }[]) => Promise<PresignResult>;
  put: (url: string, blob: Blob) => Promise<{ status: number }>;
};

const HEIC_TYPES = ["image/heic", "image/heif"];
const UNSUPPORTED_TYPE_MESSAGE = "지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)";

// PUT 재시도 규칙(P2-2 확정): 네트워크 오류·5xx만 1회 재시도.
// 재시도 412 = 최초 PUT이 이미 성공(If-None-Match:*) 후 응답 유실 — 성공 간주(서버 검증이 최종 판정).
// 최초 412 = 새 임시 키가 이미 선점된 비정상 상태 — 실패.
// 실 R2 주의(2026-08-01 게이트): 실 R2에서 관측한 크기 계약 위반의 `403 SignatureDoesNotMatch`
// 응답에는 CORS 헤더가 없어 브라우저에 네트워크 오류로 전달된다(모든 R2 오류 응답의 일반 규칙이
// 아니다 — 같은 게이트에서 412는 판독됐다).
// 즉 위반은 아래 4xx 분기가 아니라 재시도 경로를 타고 실패한다.
// 강제는 서버에서 성립하므로(객체 미생성) 안전하고, 정상 사용자는 선언 크기 = 실제 Blob이라 무관하다.
// 따라서 실패 메시지는 원인을 단정하지 말 것 — "네트워크 오류" 단정 문구 금지.
export async function putWithRetry(
  put: PreparePhotoDeps["put"],
  url: string,
  blob: Blob,
): Promise<void> {
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

// 선택 → 재인코딩·리사이즈 → 최종 Blob 확정 → 검증(최종 Blob 기준) → presign → 동일 Blob PUT.
export async function preparePhotos(
  files: File[],
  ctx: { existingCount: number; existingTotalBytes: number },
  deps: PreparePhotoDeps,
): Promise<{ items: UploadedPhotoItem[]; errors: string[] }> {
  const errors: string[] = [];
  if (ctx.existingCount + files.length > PHOTO_MAX_COUNT) {
    return { items: [], errors: [`사진은 최대 ${PHOTO_MAX_COUNT}장입니다`] };
  }

  // ① 재인코딩 → 최종 Blob 확정(파일 단위 실패는 수집하고 계속).
  const blobs: Blob[] = [];
  for (const file of files) {
    if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
      errors.push(`${file.name}: ${UNSUPPORTED_TYPE_MESSAGE}`);
      continue;
    }
    try {
      const blob = await deps.reencode(file);
      if (blob.size > PHOTO_MAX_FILE_BYTES) {
        errors.push(`${file.name}: 사진은 파일당 5MB 이하여야 합니다`);
        continue;
      }
      blobs.push(blob);
    } catch {
      // 디코딩 실패(손상 파일·미지원 코덱). 확장자만 바꾼 HEIC도 여기서 걸린다.
      if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
      errors.push(`${file.name}: 이미지를 처리할 수 없습니다`);
    }
  }
  if (blobs.length === 0) return { items: [], errors };

  // ② 합계 검증(최종 Blob 기준 — P1-1).
  const totalBytes = blobs.reduce((sum, b) => sum + b.size, 0);
  if (ctx.existingTotalBytes + totalBytes > PHOTO_MAX_TOTAL_BYTES) {
    return { items: [], errors: [...errors, "사진 합계는 30MB 이하여야 합니다"] };
  }

  // ③ claim·presign — 최종 Blob의 type·size로 서명(Content-Length 강제의 근거값).
  const presigned = await deps.presign(
    blobs.map((b) => ({ contentType: b.type, sizeBytes: b.size })),
  );
  if (!presigned.ok) return { items: [], errors: [...errors, presigned.message] };

  // ④ 동일 Blob PUT(브라우저가 Content-Length를 Blob 크기로 자동 설정 → 서명과 일치).
  const items: UploadedPhotoItem[] = [];
  for (const [index, blob] of blobs.entries()) {
    const claim = presigned.data[index];
    try {
      await putWithRetry(deps.put, claim.uploadUrl, blob);
      items.push({
        claimId: claim.claimId,
        previewUrl: URL.createObjectURL(blob),
        sizeBytes: blob.size,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "사진 업로드에 실패했습니다");
    }
  }
  return { items, errors };
}

// 미리보기 blob URL 해제(P2-3) — 제거·재업로드 요구·언마운트 시 호출해 누수를 막는다.
export function revokePreviews(items: UploadedPhotoItem[]): void {
  for (const item of items) URL.revokeObjectURL(item.previewUrl);
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

- [x] **Step 4: 통과 확인** — Run: `npx vitest run tests/modules/posts/lib/photo-upload-client.test.ts` → Expected: PASS

- [x] **Step 5: `PostPhotoUploader.tsx` 구현** — 전문:

```tsx
"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presignPostPhotos } from "../actions";
import {
  PHOTO_CLIENT_MAX_DIMENSION,
  PHOTO_MAX_COUNT,
  PHOTO_UPLOAD_TIMEOUT_MS,
} from "../lib/schema";
import {
  preparePhotos,
  reencodeToBlob,
  type UploadedPhotoItem,
} from "../lib/photo-upload-client";

type Props = {
  items: UploadedPhotoItem[];
  onChange: (items: UploadedPhotoItem[]) => void;
  disabled?: boolean;
  /** 업로드 진행 상태를 부모에 알린다 — 폼이 업로드 중 제출을 막기 위해 필요(P1-4). */
  onUploadingChange?: (uploading: boolean) => void;
};

// 글 작성 화면 전용(§11 — 사진은 생성 시에만). accept에 heic 금지(Safari 17+ 역변환 — P2-4).
export function PostPhotoUploader({
  items,
  onChange,
  disabled = false,
  onUploadingChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function changeUploading(next: boolean) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    changeUploading(true);
    setErrors([]);
    try {
      const result = await preparePhotos(
        [...fileList],
        {
          existingCount: items.length,
          existingTotalBytes: items.reduce((sum, i) => sum + i.sizeBytes, 0),
        },
        {
          reencode: (file) => reencodeToBlob(file, PHOTO_CLIENT_MAX_DIMENSION),
          presign: (files) => presignPostPhotos({ files }),
          // 멈춘 요청이 uploading을 영구 true로 만들어 등록·취소가 잠기는 것을 막는다(P2-2).
          // timeout은 putWithRetry의 "네트워크 오류" 경로로 흘러 1회 재시도된다.
          put: async (url, blob) => {
            const response = await fetch(url, {
              method: "PUT",
              headers: { "Content-Type": blob.type, "If-None-Match": "*" },
              body: blob,
              signal: AbortSignal.timeout(PHOTO_UPLOAD_TIMEOUT_MS),
            });
            return { status: response.status };
          },
        },
      );
      if (result.items.length > 0) onChange([...items, ...result.items]);
      setErrors(result.errors);
    } catch (error) {
      // presign·PUT의 예상하지 못한 예외도 사용자에게 드러낸다(P1-4) — 무음 실패 금지.
      setErrors([error instanceof Error ? error.message : "사진 업로드 중 오류가 발생했습니다"]);
    } finally {
      changeUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    const next = [...items];
    URL.revokeObjectURL(next[index].previewUrl);
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
            <li key={item.claimId} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기 */}
              <img
                src={item.previewUrl}
                alt=""
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  대표
                </span>
              )}
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
          disabled={disabled || uploading || items.length >= PHOTO_MAX_COUNT}
        >
          <ImagePlus aria-hidden className="mr-1 h-4 w-4" />
          {uploading ? "업로드 중..." : `사진 추가 (${items.length}/${PHOTO_MAX_COUNT})`}
        </Button>
        <span className="text-xs text-muted-foreground">
          JPG·PNG·WebP, 장당 5MB · 첫 번째 사진이 대표로 표시됩니다
        </span>
      </div>
      {errors.map((message) => (
        <p key={message} className="text-sm text-destructive">{message}</p>
      ))}
    </div>
  );
}
```

- [x] **Step 6: PostForm 통합** — `modules/posts/components/PostForm.tsx` 수정:

Props·잠금 문구 교체:

```tsx
import { useEffect, useRef, useState, useTransition } from "react";
import { PostPhotoUploader } from "./PostPhotoUploader";
import { revokePreviews, type UploadedPhotoItem } from "../lib/photo-upload-client";
import { PHOTO_RETRY_CODE, POST_BODY_MAX, POST_TITLE_MAX } from "../lib/schema";
import type { LockedReason } from "../types";

type Props = {
  mode: "new" | "edit";
  post?: Post;
  /** 수정 잠금 사유(§11) — moderation(운영 숨김) | has_comments(댓글 존재) | null. */
  lockedReason?: LockedReason;
};

const LOCKED_MESSAGES: Record<Exclude<LockedReason, null>, string> = {
  moderation: "운영 검토 중인 글입니다. 수정할 수 없으며, 삭제만 가능합니다.",
  has_comments: "댓글이 작성된 글은 내용을 수정할 수 없습니다. 삭제는 가능합니다.",
};

export function PostForm({ mode, post, lockedReason = null }: Props) {
  const locked = lockedReason !== null;
  const [photos, setPhotos] = useState<UploadedPhotoItem[]>([]);
  // 업로드가 끝나기 전에 등록되면 사진 없는 글·일부만 담긴 글이 만들어진다(P1-4).
  const [uploading, setUploading] = useState(false);
  // 언마운트 시 미리보기 blob URL 해제(P2-3) — ref로 최신 목록을 잡아둔다.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => revokePreviews(photosRef.current), []);
```

기존 `locked &&` 배너를 사유별 문구로 교체:

```tsx
          {lockedReason !== null && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {LOCKED_MESSAGES[lockedReason]}
            </p>
          )}
```

`handleSubmit`의 제출·결과 처리 교체(new 모드에 photos 전달 + 재업로드 요구 처리).
버튼 비활성만으로는 Enter 제출·상태 반영 직전 경쟁을 막지 못하므로 **함수 시작에서도 재검증**한다(P2-1) —
기존 `if (!title.trim() || !body.trim())` 가드 바로 다음에 넣는다:

```tsx
    if (uploading) {
      toast.error("사진 업로드가 끝난 후 등록해주세요");
      return;
    }
```

```tsx
      const result =
        mode === "edit" && post
          ? await updatePost({ id: post.id, topic, title, body })
          : await createPost({
              topic, title, body,
              photos: photos.map((p) => ({ claimId: p.claimId })),
            });
      if (!result.ok) {
        // 소비된 claim은 복구되지 않는다(§결정 8) — 첨부를 비우고 다시 고르도록 안내한다(P2-3).
        if (result.code === PHOTO_RETRY_CODE) {
          revokePreviews(photos);
          setPhotos([]);
          toast.error(`${result.message} (첨부한 사진이 초기화되었습니다)`);
          return;
        }
        toast.error(result.message);
        return;
      }
      revokePreviews(photos); // 이동 전 미리보기 해제
      router.push(`/posts/${result.data.postPublicCode}`);
```

본문 Textarea 블록 다음에 업로더 추가(new 모드 전용 — §11 사진은 생성 시에만):

```tsx
          {mode === "new" && (
            <div className="space-y-2">
              <Label>사진 (선택)</Label>
              <PostPhotoUploader
                items={photos}
                onChange={setPhotos}
                disabled={pending}
                onUploadingChange={setUploading}
              />
            </div>
          )}
```

**업로드 중 버튼 비활성(P1-4)** — 등록·취소·삭제 세 버튼의 `disabled`에 `uploading`을 더한다:

```tsx
              <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)}
                disabled={pending || deleting || uploading}>삭제</Button>
              <Button type="button" variant="outline" onClick={() => router.push(cancelHref)}
                disabled={pending || deleting || uploading}>취소</Button>
              <Button type="submit"
                disabled={locked || pending || deleting || uploading || !title.trim() || !body.trim()}>
                {uploading ? "사진 업로드 중..." : submitLabel}
              </Button>
```

`cancelHref`는 moderation만 `/posts/my`(숨김 글 상세는 404), has_comments는 상세로:

```tsx
  const cancelHref =
    mode === "edit" && post
      ? lockedReason === "moderation"
        ? "/posts/my"
        : `/posts/${post.publicCode}`
      : "/posts";
```

(기존 `disabled={locked}` 필드 조건은 `locked` 파생 변수 그대로 유지.)

- [x] **Step 7: 검증** — Run: `npm run lint && npm run typecheck` → Expected: PASS. (edit 페이지가 아직 `locked` prop을 넘겨 타입 에러 — Task 13 Step 1에서 수정하므로, 이 태스크에서는 edit 페이지도 함께 수정해 커밋해도 된다: 아래 Task 13 Step 1 참조. **여기서 함께 수정한다.**)

- [x] **Step 8: Commit**

```bash
git add modules/posts/lib/photo-upload-client.ts modules/posts/components/PostPhotoUploader.tsx modules/posts/components/PostForm.tsx app/\(shop\)/posts/\[publicCode\]/edit/page.tsx tests/modules/posts/lib/photo-upload-client.test.ts
git commit -m "feat: 사진 업로더와 글 작성 폼 통합(재인코딩·잠금 사유 구분)"
```

---

### Task 13: UI 마무리 — 상세 갤러리·목록 사진 뱃지·수정됨 표기·신고 큐 v2

**Files:**
- Modify: `app/(shop)/posts/[publicCode]/edit/page.tsx`, `modules/posts/components/PostDetail.tsx`, `modules/posts/components/PostCard.tsx`, `modules/posts/components/ReportQueue.tsx`

**Interfaces:**
- Consumes: `PostDetailView.photos`·`Post.editedAt`·`Post.photoCount`(Task 10), `postReportSnapshot`(Task 5), `signReportEvidencePhoto`(Task 11)

- [x] **Step 1: edit 페이지** — `getEditablePost` 반환 계약 변경 반영:

```tsx
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PostForm mode="edit" post={result.post} lockedReason={result.lockedReason} />
    </div>
  );
```

(파일의 기존 래퍼 마크업 구조는 유지하고 `locked={result.locked}`만 `lockedReason={result.lockedReason}`으로 교체.)

- [x] **Step 2: PostDetail — 갤러리 + 수정됨 뱃지** — 작성자 줄의 `<p>`를 다음으로 교체:

```tsx
          <p className="text-sm text-muted-foreground">
            {post.authorName} #{post.authorCode} · {formatKstDateTime(post.createdAt)}
            {post.editedAt && (
              <span className="ml-1 text-xs">(수정됨 · {formatKstDateTime(post.editedAt)})</span>
            )}
          </p>
```

본문 `<div className="whitespace-pre-wrap ...">` 다음에 갤러리 추가:

```tsx
      {view.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {view.photos.map((photo) => (
            /* 서명 GET URL 직접 서빙 — next/image 최적화 캐시가 15분 TTL 계약을 깨므로 금지(§결정 8) */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.url}
              alt=""
              loading="lazy"
              className="w-full rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}
```

- [x] **Step 3: PostCard — 사진 개수 뱃지 + 수정됨 표기** — 제목 span 뒤에 뱃지, 그 뒤에 수정됨.
목록에는 이미지를 싣지 않는다(사용자 결정 — 비공개 버킷엔 원본뿐이라 목록 썸네일이 곧 원본 전송):

```tsx
      {post.photoCount > 0 && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-sm text-muted-foreground"
          title={`사진 ${post.photoCount}장`}
        >
          <ImageIcon aria-hidden className="h-3.5 w-3.5" />
          {post.photoCount}
        </span>
      )}
```

(`lucide-react`에서 `Image as ImageIcon`을 추가 import — 기존 `MessageSquare` import 줄에 함께.)

```tsx
      {post.editedAt && (
        <span className="shrink-0 text-xs text-muted-foreground" title={`수정됨 · ${formatKstDateTime(post.editedAt)}`}>
          (수정됨)
        </span>
      )}
```

(`formatKstDateTime` import 추가: `import { formatKstDateTime, formatKstRelative } from "@/lib/datetime";`)

- [x] **Step 4: ReportQueue — v1|v2 union 파싱 + 증거 열람** — import를 교체(`postReportSnapshotV1` → `postReportSnapshot`)하고, `SnapshotSummary`·`SnapshotDetail`의 post 분기 파싱을 `postReportSnapshot.safeParse(item.snapshot)`으로 교체(필드 접근은 동일 — v1/v2 공통 필드). `SnapshotDetail`의 "수정 시각" 블록 다음에 증거 사진 섹션 추가:

```tsx
        {parsed.data.version === 2 && parsed.data.photos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              증거 사진 {parsed.data.photos.length}장
            </p>
            <EvidencePhotos reportId={item.id} count={parsed.data.photos.length} />
          </div>
        )}
```

같은 파일에 컴포넌트 추가(admin 전용 서명 GET — 클라 r2Key 미전달, index만):

```tsx
// 신고 스냅샷 증거 사진 — 버튼 클릭 시 admin signer 액션으로 서명 URL 발급(숨김·삭제 후에도 열람).
function EvidencePhotos({ reportId, count }: { reportId: number; count: number }) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [pending, startTransition] = useTransition();

  function load(photoIndex: number) {
    startTransition(async () => {
      const result = await signReportEvidencePhoto({ reportId, photoIndex });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setUrls((prev) => ({ ...prev, [photoIndex]: result.data.url }));
    });
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: count }, (_, i) => (
          <Button
            key={i}
            type="button"
            variant="outline"
            size="sm"
            // 서명 URL은 15분이면 만료된다 — 이미 본 사진도 다시 눌러 재발급받을 수 있어야 한다(P2-3).
            disabled={pending}
            onClick={() => load(i)}
          >
            {urls[i] !== undefined ? `사진 ${i + 1} 새로 보기` : `사진 ${i + 1} 보기`}
          </Button>
        ))}
      </div>
      {Object.entries(urls).map(([index, url]) => (
        /* eslint-disable-next-line @next/next/no-img-element -- admin 증거 서명 GET 직접 서빙 */
        <img key={index} src={url} alt={`증거 사진 ${Number(index) + 1}`} className="max-h-64 rounded border border-border" />
      ))}
    </div>
  );
}
```

import에 `signReportEvidencePhoto` 추가: `import { dismissReport, hideComment, hidePost, signReportEvidencePhoto } from "../actions";`

- [x] **Step 5: 검증** — Run: `npm run validate` → Expected: lint·typecheck·전체 테스트 PASS

- [x] **Step 6: Commit**

```bash
git add app/\(shop\)/posts/\[publicCode\]/edit/page.tsx modules/posts/components/PostDetail.tsx modules/posts/components/PostCard.tsx modules/posts/components/ReportQueue.tsx
git commit -m "feat: 사진 갤러리·썸네일·수정됨 표기·신고 증거 열람 UI 추가"
```

---

### Task 14: 실 DB 검증 — 수정 잠금 동시성 + claim 원자 소비

**Files:**
- Create: `docs/superpowers/verification/2026-07-26-posts-edit-lock/edit-lock.mjs`
- Create: `docs/superpowers/verification/2026-07-26-posts-edit-lock/claim-consume.mjs`

vitest가 아닌 실 DB 하네스다(Plan 2 `2026-07-23-posts-concurrency-rls` 선례). 두 가지를 검증한다:
**①** §11 수정 잠금의 양방향 직렬화(P1-7), **②** claim 원자 소비 SQL의 실제 조건과 동시 소비(P1-5 — 단위
테스트는 `$queryRaw`를 mock하므로 소유권·미소비·미만료 조건이 빠져도 통과한다). 대기 여부는 sleep이
아니라 `pg_blocking_pids()`로 결정적으로 관측한다. FK가 없으므로 임의 UUID 계정으로 직접 INSERT해 픽스처를 만든다.

- [x] **Step 1: `edit-lock.mjs` 작성** — 전문:

```js
// §11 수정 잠금 동시성 — updatePost(FOR UPDATE) ↔ createComment(FOR UPDATE) 양방향 검증.
// 대기 판정은 pg_blocking_pids()로 한다(sleep 후 플래그 확인은 "아직 도착도 안 한 상태"를 통과시킨다).
// 실행: dotenv -e .env.local -- node docs/superpowers/verification/2026-07-26-posts-edit-lock/edit-lock.mjs
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL 필요 — dotenv -e .env.local 로 실행"); process.exit(2); }
if (!/localhost|127\.0\.0\.1/.test(url)) { console.error("로컬 DB에서만 실행"); process.exit(2); }

const a = new pg.Client({ connectionString: url }); // 작성자(updatePost)
const b = new pg.Client({ connectionString: url }); // 댓글 작성(createComment)
const o = new pg.Client({ connectionString: url }); // 관찰자(잠금 대기 판정·정리)

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ACCOUNT = "00000000-0000-4000-8000-0000000000aa";
const OTHER   = "00000000-0000-4000-8000-0000000000bb";
const PREFIX  = `vrf-editlock-${Date.now()}`;

const pidOf = async (client) => (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

// 지정 백엔드가 실제로 잠금 대기 중인지 관측한다. 대기 중이면 blocker pid 배열, 아니면 null.
async function blockersOf(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await o.query("SELECT pg_blocking_pids($1) AS blockers", [pid]);
    if (rows[0].blockers.length > 0) return rows[0].blockers;
    await sleep(25);
  }
  return null;
}

async function makePost(code) {
  const { rows } = await o.query(
    `INSERT INTO post (account_id, public_code, topic, title, body, author_name, author_code)
     VALUES ($1, $2, 'talk', '원제목', '원본문', '검증계정', 'VRF1') RETURNING id`, [ACCOUNT, code]);
  return rows[0].id;
}
// updatePost의 ② 잠금 쿼리
const lockAsAuthor = (client, id) => client.query(
  `SELECT public_code, topic, title, body, hidden_at FROM post
   WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL FOR UPDATE`, [id, ACCOUNT]);
// createComment의 ① 잠금 쿼리
const lockAsCommenter = (client, id) => client.query(
  `SELECT public_code FROM post
   WHERE id = $1 AND hidden_at IS NULL AND deleted_at IS NULL FOR UPDATE`, [id]);
const liveComments = async (client, id) =>
  (await client.query(
    `SELECT count(*)::int AS c FROM post_comment WHERE post_id = $1 AND deleted_at IS NULL`, [id])).rows[0].c;

await a.connect(); await b.connect(); await o.connect();
const aPid = await pidOf(a), bPid = await pidOf(b);
try {
  // ── S1: update 선행 → comment 대기 → update 커밋 → comment 성공 ──────────────
  const id1 = await makePost(`${PREFIX}-s1`);
  await a.query("BEGIN");
  check("S1-1 A: 작성자 FOR UPDATE 잠금 획득", (await lockAsAuthor(a, id1)).rows.length === 1);

  let bDone = false;
  const bWork = (async () => {
    await b.query("BEGIN");
    await lockAsCommenter(b, id1);                 // A 커밋까지 여기서 대기
    await b.query(
      `INSERT INTO post_comment (post_id, account_id, body, author_name, author_code)
       VALUES ($1, $2, '댓글', '타인', 'OTH1')`, [id1, OTHER]);
    await b.query("COMMIT");
    bDone = true;
  })();

  const s1Blockers = await blockersOf(bPid);
  check("S1-2 B: 실제로 A의 잠금을 대기한다(pg_blocking_pids)",
    s1Blockers !== null && s1Blockers.includes(aPid),
    s1Blockers ? `blockers=${s1Blockers}` : "대기 관측 실패(5초)");
  check("S1-3 B: 아직 커밋되지 않음", bDone === false);
  check("S1-4 A: 잠금 하 미삭제 댓글 0 관측 → 수정 허용", (await liveComments(a, id1)) === 0);

  await a.query(
    `UPDATE post SET title = '수정제목', edited_at = now(), updated_at = now() WHERE id = $1`, [id1]);
  await a.query("COMMIT");
  await bWork;
  check("S1-5 B: A 커밋 후 댓글 삽입 완료", bDone === true);
  const s1 = (await o.query(
    `SELECT p.title, p.edited_at,
            (SELECT count(*)::int FROM post_comment c WHERE c.post_id = p.id) AS comments
     FROM post p WHERE p.id = $1`, [id1])).rows[0];
  check("S1-6 최종: 수정 반영 + edited_at 세팅 + 댓글 1",
    s1.title === "수정제목" && s1.edited_at !== null && s1.comments === 1);

  // ── S2: comment 선행(잠금 유지) → update 대기 → comment 커밋 → update 거부 ────
  const id2 = await makePost(`${PREFIX}-s2`);
  await b.query("BEGIN");
  await lockAsCommenter(b, id2);
  await b.query(
    `INSERT INTO post_comment (post_id, account_id, body, author_name, author_code)
     VALUES ($1, $2, '선행 댓글', '타인', 'OTH1')`, [id2, OTHER]);   // 아직 커밋하지 않는다

  let aLocked = false;
  const aWork = (async () => {
    await a.query("BEGIN");
    await lockAsAuthor(a, id2);                    // B 커밋까지 대기
    aLocked = true;
  })();
  const s2Blockers = await blockersOf(aPid);
  check("S2-1 A: 반대 방향에서도 B의 잠금을 대기한다",
    s2Blockers !== null && s2Blockers.includes(bPid),
    s2Blockers ? `blockers=${s2Blockers}` : "대기 관측 실패(5초)");
  check("S2-2 A: 아직 잠금 미획득", aLocked === false);

  await b.query("COMMIT");
  await aWork;
  check("S2-3 A: B 커밋 후 잠금 획득", aLocked === true);
  check("S2-4 A: 잠금 하 미삭제 댓글 1 관측 → 수정 거부(has_comments)", (await liveComments(a, id2)) === 1);
  await a.query("ROLLBACK");   // 앱은 DomainError("댓글이 작성된 글은 수정할 수 없습니다")
  const s2 = (await o.query(`SELECT title, edited_at FROM post WHERE id = $1`, [id2])).rows[0];
  check("S2-5 최종: 본문 미수정 + edited_at null 유지",
    s2.title === "원제목" && s2.edited_at === null);

  // ── S3 음성대조: FOR UPDATE를 빼면 대기가 사라진다(위 대기가 잠금 때문임을 확인) ──
  const id3 = await makePost(`${PREFIX}-s3`);
  await b.query("BEGIN");
  await lockAsCommenter(b, id3);
  const plain = await a.query(`SELECT title FROM post WHERE id = $1`, [id3]); // 즉시 반환
  check("S3-1 음성대조: 잠금 없는 읽기는 대기하지 않는다", plain.rows.length === 1);
  const idle = (await o.query("SELECT pg_blocking_pids($1) AS b", [aPid])).rows[0].b;
  check("S3-2 음성대조: A는 대기 상태가 아니다", idle.length === 0, `blockers=${idle}`);
  await b.query("ROLLBACK");
} finally {
  // 세션 tx 종료와 데이터 정리를 서로 독립적으로 처리한다(하나가 실패해도 나머지는 수행).
  for (const client of [a, b]) {
    try { await client.query("ROLLBACK"); } catch { /* 진행 중 tx 없음 */ }
  }
  try {
    await o.query(
      `DELETE FROM post_comment WHERE post_id IN (SELECT id FROM post WHERE public_code LIKE $1)`,
      [`${PREFIX}%`]);
    await o.query(`DELETE FROM post WHERE public_code LIKE $1`, [`${PREFIX}%`]);
  } finally {
    await Promise.allSettled([a.end(), b.end(), o.end()]);
  }
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
```

- [x] **Step 2: `claim-consume.mjs` 작성** — 전문:

```js
// claim 원자 소비 SQL의 실 DB 검증(P1-5) — 단위 테스트는 $queryRaw를 mock하므로
// 소유권·미소비·미만료 조건이 SQL에서 빠져도 통과한다. 여기서 실제 조건과 직렬화를 확인한다.
// 실행: dotenv -e .env.local -- node docs/superpowers/verification/2026-07-26-posts-edit-lock/claim-consume.mjs
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL 필요 — dotenv -e .env.local 로 실행"); process.exit(2); }
if (!/localhost|127\.0\.0\.1/.test(url)) { console.error("로컬 DB에서만 실행"); process.exit(2); }

const x = new pg.Client({ connectionString: url });
const y = new pg.Client({ connectionString: url });
const o = new pg.Client({ connectionString: url });

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OWNER  = "00000000-0000-4000-8000-0000000000aa";
const OTHER  = "00000000-0000-4000-8000-0000000000bb";
const PREFIX = `posts/tmp/vrf-claim-${Date.now()}`;

// photo-claim.consumePhotoClaims와 동일한 술어 집합(Prisma의 IN 대신 = ANY — 의미 동일).
const CONSUME_SQL = `
  UPDATE post_photo_claim
  SET consumed_at = now(), updated_at = now()
  WHERE id = ANY($1::bigint[])
    AND account_id = $2::uuid
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING id, r2_key, content_type, size_bytes`;

const pidOf = async (client) => (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
async function blockersOf(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await o.query("SELECT pg_blocking_pids($1) AS blockers", [pid]);
    if (rows[0].blockers.length > 0) return rows[0].blockers;
    await sleep(25);
  }
  return null;
}
async function makeClaim({ account = OWNER, minutes = 10, consumed = false, suffix }) {
  const { rows } = await o.query(
    `INSERT INTO post_photo_claim (account_id, r2_key, content_type, size_bytes, expires_at, consumed_at)
     VALUES ($1, $2, 'image/jpeg', 1024, now() + ($3 || ' minutes')::interval, $4)
     RETURNING id`,
    [account, `${PREFIX}-${suffix}.jpg`, String(minutes), consumed ? new Date() : null]);
  return rows[0].id;
}
const isConsumed = async (id) =>
  (await o.query(`SELECT consumed_at FROM post_photo_claim WHERE id = $1`, [id])).rows[0].consumed_at !== null;

await x.connect(); await y.connect(); await o.connect();
const xPid = await pidOf(x), yPid = await pidOf(y);
const before = (await o.query(
  `SELECT count(*)::int AS c FROM post_photo_claim WHERE r2_key LIKE $1`, [`${PREFIX}%`])).rows[0].c;
try {
  // C1 정상 — 본인·미소비·미만료
  const ok1 = await makeClaim({ suffix: "c1" });
  const r1 = await x.query(CONSUME_SQL, [[ok1], OWNER]);
  check("C1 본인·미소비·미만료 claim은 소비된다", r1.rowCount === 1 && (await isConsumed(ok1)));

  // C2 타 계정 소유권 거부
  const other = await makeClaim({ account: OTHER, suffix: "c2" });
  const r2 = await x.query(CONSUME_SQL, [[other], OWNER]);
  check("C2 타 계정 claim은 거부된다", r2.rowCount === 0 && !(await isConsumed(other)));

  // C3 만료 거부
  const expired = await makeClaim({ minutes: -1, suffix: "c3" });
  const r3 = await x.query(CONSUME_SQL, [[expired], OWNER]);
  check("C3 만료 claim은 거부된다", r3.rowCount === 0 && !(await isConsumed(expired)));

  // C4 재소비 거부
  const used = await makeClaim({ consumed: true, suffix: "c4" });
  const r4 = await x.query(CONSUME_SQL, [[used], OWNER]);
  check("C4 이미 소비된 claim은 재소비되지 않는다", r4.rowCount === 0);

  // C5 다건 중 하나라도 조건 불충족 → 전건 롤백(앱은 rowCount !== 요청수면 throw)
  const good = await makeClaim({ suffix: "c5-good" });
  const bad  = await makeClaim({ minutes: -1, suffix: "c5-expired" });
  await x.query("BEGIN");
  const r5 = await x.query(CONSUME_SQL, [[good, bad], OWNER]);
  const partial = r5.rowCount !== 2;
  await x.query("ROLLBACK");   // 앱의 throw → tx 롤백과 동일
  check("C5 다건 부분 실패는 전건 롤백된다(정상 claim도 미소비 유지)",
    partial && !(await isConsumed(good)), `rowCount=${r5.rowCount}`);

  // C6 동시 소비 — 정확히 한 세션만 성공
  const raced = await makeClaim({ suffix: "c6" });
  await x.query("BEGIN");
  const first = await x.query(CONSUME_SQL, [[raced], OWNER]);
  let second = null;
  const yWork = (async () => {
    await y.query("BEGIN");
    second = await y.query(CONSUME_SQL, [[raced], OWNER]); // x 커밋까지 행 잠금 대기
    await y.query("COMMIT");
  })();
  const blockers = await blockersOf(yPid);
  check("C6-1 두 번째 세션은 첫 세션의 행 잠금을 대기한다",
    blockers !== null && blockers.includes(xPid),
    blockers ? `blockers=${blockers}` : "대기 관측 실패(5초)");
  await x.query("COMMIT");
  await yWork;
  check("C6-2 동시 소비에서 정확히 한 세션만 성공",
    first.rowCount === 1 && second.rowCount === 0,
    `first=${first.rowCount} second=${second.rowCount}`);
} finally {
  for (const client of [x, y]) {
    try { await client.query("ROLLBACK"); } catch { /* 진행 중 tx 없음 */ }
  }
  try {
    await o.query(`DELETE FROM post_photo_claim WHERE r2_key LIKE $1`, [`${PREFIX}%`]);
    const after = (await o.query(
      `SELECT count(*)::int AS c FROM post_photo_claim WHERE r2_key LIKE $1`, [`${PREFIX}%`])).rows[0].c;
    check("C7 픽스처 정리 — 시작·종료 상태 동일", after === before, `before=${before} after=${after}`);
  } finally {
    await Promise.allSettled([x.end(), y.end(), o.end()]);
  }
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
```

- [x] **Step 3: 실행·확인**

```bash
D=docs/superpowers/verification/2026-07-26-posts-edit-lock
./node_modules/.bin/dotenv -e .env.local -- node $D/edit-lock.mjs
# Expected: 13 PASS / 0 FAIL (S1-1~S1-6, S2-1~S2-5, S3-1~S3-2)
./node_modules/.bin/dotenv -e .env.local -- node $D/claim-consume.mjs
# Expected: 8 PASS / 0 FAIL (C1~C5, C6-1·C6-2, C7)
```

(두 스크립트 모두 `postgres` 슈퍼유저 URL로 실행되므로 `post`·`post_photo_claim`의 DELETE GRANT 제약과 무관하게 정리된다 — Plan 2 verification 선례와 동일.)

- [x] **Step 4: Commit**

```bash
git add docs/superpowers/verification/2026-07-26-posts-edit-lock/
git commit -m "docs: 수정 잠금·claim 소비 실 DB 검증 스크립트 추가"
```

---

## 최종 단계

> 아래 미체크 항목은 **아직 수행되지 않은 릴리스 게이트**다. 코드 구현이 끝났다고 체크하지 말 것 —
> 사람이 실제로 수행한 뒤에만 체크한다.

- [x] **전체 검증**: `npm run validate` → lint·typecheck·전체 테스트 PASS. `npm run db:reset` 재확인.
- [ ] **`dev:all` 수동 E2E** (스펙 §테스트 방침 시나리오 확장):
  1. 로그인 → 글 작성(사진 3장 첨부, 업로드 중 등록 버튼 비활성 확인) → 상세에서 갤러리 표시
  2. 목록에서 사진 개수 뱃지 표시(이미지 미로딩 — 네트워크 탭에 목록 이미지 요청 0건) · MinIO 콘솔에서 객체가 `posts/`(최종)에만 있고 `posts/tmp/` 임시분은 삭제됨 확인
  3. 상세 사진 URL 직접 열기(서명 GET) 성공 · 서명 파라미터를 제거한 URL은 403(비공개)
  4. HEIC 파일 선택 시도 → 거부 문구 + 콘솔 `[heic-reject]`
  5. 타 계정으로 댓글 작성 → 작성자 편집 화면 진입 → "댓글이 작성된 글은…" 잠금 + 삭제만 가능
  6. 수정 가능한 글(댓글 0)에서 제목 수정 → 목록·상세 "(수정됨)" 표시 · 무변경 저장 → 표시 없음
  7. 타 계정으로 신고 → admin 큐에서 스냅샷(제목·본문·**증거 사진 N장 보기**) 확인 → 숨김 → 상세 404 + 목록에서 소멸(사진 신규 URL 미발급) → 해제 복귀
  8. 글 삭제 → 상세 404 · admin 증거 사진은 스냅샷으로 계속 열람 가능
- [ ] **iOS Safari 실기기 QA**: 아이폰에서 사진 첨부 → HEIC 자동 변환 여부 확인(§결정 8 P2-4 — 마찰이 크면 디코더 도입을 §후속으로 판단)
- [ ] **운영 UGC 환경변수·토큰 스코프 확인**: `R2_UGC_BUCKET`이 Preview·Production에 설정됐는지, R2 토큰 스코프에 UGC 버킷이 포함됐는지 확인(`docs/r2-adoption.md` §운영 배포 체크리스트 — R2). 미설정 시 `oshikore-ugc-dev`로 조용히 폴백한다. (2026-08-02 변경: UGC 전용 자격증명 `R2_UGC_ACCESS_KEY_ID`/`SECRET`은 상품 토큰 공유로 전환·제거)
- [ ] **finishing-a-development-branch** 스킬로 마무리(push·PR — Plan 2 선례: `feat/community-photos` → `feat/community`).

## Self-Review 체크리스트 (작성자용)

- [x] **스펙 커버리지**: §결정 8(버킷·서명 GET·캐시·signer IDOR·정책·claim·ETag 파이프라인·크기 강제·보상·견고성) → Task 1·3·5·6·7·10·11 / §결정 9 presign rate limit(claim 수 기준) → Task 5·6 / §결정 11(잠금·edited_at·lockedReason·사진 생성만) → Task 5·8·10·12·13 / §7 스냅샷 v2·admin 증거 → Task 5·9·10·11·13 / 데이터 모델(2테이블 + edited_at + GRANT) → Task 2 / 에러 처리 표 → 각 mutation 문구 일치 / **실 R2 게이트·CORS(P1-6) → Task 0(선행 하드 게이트)** / 동시성·claim 소비 실 DB → Task 14
- [x] **설계 리뷰 완료 조건 12개**: 1(P1-1 순서)→T12 / 2(캐시)→T3·T13 / 3(claim 보존·배치 limit)→T2·T5·T6 / 4(수정 정책·동시성)→T8·T14 / 5(스냅샷 v2·signer)→T9·T10·T11 / 6(실 R2 검증)→**T0** / 7(부분 실패 보상)→T6·T7 / 8(soft delete 정책)→T2·T8 / 9(timeout·concurrency 수치)→Global Constraints·T3·T6 / 10(스파이크 정리)→완료(커밋 2386d38) / 11(구조·테스트 방침)→actions/photo.ts·전 태스크 테스트 / 12(계획 문서)→본 문서
- [x] **계획 리뷰 P1 7건 반영**: 1(실 R2 선행)→**T0로 이동 + 하드 게이트 명시** / 2(공개 signer 단일 조회)→T10 JOIN + 미발급 케이스 테스트 / 3(60초 예산 강제)→T3 `R2CallOptions.signal`·T6 budget signal·보상 별도 예산·예산 소진 테스트 / 4(업로드 중 제출 차단)→T12 `onUploadingChange` + 버튼 비활성 / 5(claim 실 DB 검증)→T14 `claim-consume.mjs`(C1~C7) / 6(VP8L 최소 길이)→T4 형식별 최소 길이 + 회귀 테스트 / 7(동시성 하네스)→T14 `pg_blocking_pids` 관측·양방향·음성대조
- [x] **계획 리뷰 P2 4건 반영**: 1(커밋 후 정리 분리)→T7 단계 분리 + 테스트 / 2(목록 썸네일 비용)→**사용자 결정: 개수 뱃지만**(파생 썸네일은 §후속) / 3(재업로드 UX·blob 해제)→`PHOTO_RETRY_CODE`·`revokePreviews`·증거 URL 재발급 / 4(게이트·테스트 실행 가능성)→T0 `gate.mjs` 전문·local 폴백 금지·endpoint 로깅·SKIP 명시, T1 lifecycle 단언, T10 테스트 전문화
- [x] **계획 재리뷰 P1 4건 반영**: 1(SigV4 헤더 유실)→T0 `signedFetch`·lifecycle 조회가 **서명 Request 자체를 fetch**, cleanup은 `response.ok`도 실패로 기록 / 2(브라우저 호환성 미입증)→T0 **Step 6 `browser-gate.mjs` 필수화**(B1~B3) + G11 ACAO **정확 일치**(wildcard 거부)·G11b/c allow-methods·headers·G7b `private`+`no-store` 동시 확인·G13 **같은 규칙에 prefix+1일**·r2 모드 엔드포인트 호스트 검증 / 3(예산 밖 정리 지연)→실패 경로 삭제에 **cleanup 예산(첫 실패 시점부터 15초)** 주입 + 지연 정리 테스트 / 4(테스트 2곳 실패)→`PHOTO_RETRY_CODE`를 schema에서 import, actions/post 테스트는 `ACCOUNT.id`(UUID) 사용 + `$transaction`·`postPhoto.createMany` mock 보강
- [x] **계획 재리뷰 P2 3건 반영**: 1(액션 경계 방어)→`handleSubmit` 시작에서 `uploading` 재검증 / 2(브라우저 PUT timeout)→`PHOTO_UPLOAD_TIMEOUT_MS`(30초) + TimeoutError 재시도 테스트 / 3(T0↔T1 순서)→**compose UGC 버킷·lifecycle을 T0로 이동**(T1은 앱 env만), gate.mjs 로컬 버킷 기본값으로 T0 자립
- [x] **계획 4차 리뷰 P1 1건 + P2 반영**: 1(액션 테스트 assertion 미전환)→T8 Step 4에 **전환 표** 추가(update happy=`txPostUpdate` / delete happy=`txPostUpdateMany`+`txPhotoUpdateMany` / 비로그인·zod 실패=`transaction` 미호출), 최상위 `updateMany` 단언은 보조로만 / P2(T11 문구·코드 불일치)→"Task 8 `beforeEach`의 transaction mock을 최종 형태로 확장(기존 5필드 보존 + 2필드 추가)"으로 통일
- [x] **계획 3차 리뷰 P1 3건 + P2 반영**: 1(브라우저 게이트가 정상 R2에서도 실패)→**B1·B2에 별도 키**(같은 키면 B2가 403이 아니라 If-None-Match 412) + 브라우저가 `/result`로 판정 전송 → 서버가 정리 후 **PASS 0 / FAIL 1로 종료 코드 강제**(Ctrl+C도 1) + `cors.json`에 게이트 origin(`localhost:8789`) 포함·`GATE_BROWSER_PORT` 노출 / 2(cleanup 테스트가 catch에 미도달)→HEAD는 try 밖이므로 **copy에서 실패**시켜 catch 진입, 기존 삭제 단언 2곳에 `expect.objectContaining({ signal })` 반영 / 3(tx mock 충돌)→**Task 8 Step 4에서 공통 tx mock을 완성**하고 Task 11은 `post.create`·`postPhoto.createMany`만 **추가**(구현 대입 금지) / P2 문서 정합성 5건(T1 Files의 compose 제거·T1 Step 번호·G11/G13 표 행·Self-Review 시그니처)
- [x] **placeholder 없음**: TBD·TODO·"나중에" 없음 — 모든 코드 스텝에 실제 코드(T0 `gate.mjs`·`browser-gate.mjs`, T14 두 스크립트, T10·T11 테스트 포함).
- [x] **타입 일관성**: `LockedReason`·`UploadedPhotoItem`·`IssuedClaim`·`ConsumedClaim`·`PostPhotoView`·`R2CallOptions` 정의(T3·T5·T6·T12)와 사용처(T8·T10·T11·T12·T13) signature 일치. `assertWithinRateLimit(windows, counter, requested)`·`finalizeClaimedPhotos(claims, { budget?, cleanupBudget? })`는 기본값으로 하위호환. `toPost(row, count, photoCount?)` 3-인자화는 T5에서 선반영해 컴파일 단절 없음. `PHOTO_RETRY_CODE`는 client-safe한 `schema.ts`에 둔다(`photo-claim`은 server-only).
- [x] **잠금 우선순위 4곳 동일**: mutation(T8 — hidden 먼저) · getEditablePost(T10) · capability(T10 — visible 전제) · PostForm(T12 — 문구 분기)

## 이번 계획에서 의도적으로 제외(§후속 재확인)

claim 만료 행 정리 잡 · 삭제 사진 R2 객체 정리 잡(anti-join + LastModified 유예) · 사진 편집(추가·삭제·재정렬) · HEIC 클라 디코더 · 서버 EXIF 제거 · revision history ·
**목록용 클라 파생 썸네일**(업로드 시 400px 축소본 동반 업로드 — Slack 방식. 이번 릴리스는 개수 뱃지) ·
**서명 GET URL 안정화 + `max-age` 캐시 완화**(현재는 스펙의 `private, no-store` 유지 — 완화하려면 스펙 §결정 8 캐시 계약을 먼저 개정).
