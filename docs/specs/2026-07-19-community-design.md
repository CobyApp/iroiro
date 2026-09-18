# 공지사항 · 자유게시판 (notices / posts)

> 작성일: 2026-07-19 · 상태: **Plan 1·2·3 구현 완료 — 배포 대기(§구현 현황)** · 브랜치: `feat/community`
> 본 문서가 커뮤니티 기능 구현의 **단일 진실**이다. 기존 중고 거래 게시판 방향은 MVP 범위 과다로
> **폐기**했으며, 당시 검토된 UGC 보안 결정 중 필요한 사항은 본 스펙에 반영했다.
> 조사 근거: [community-board-research](../research/2026-07-19-community-board-research.html) ·
> [secondhand-contact-policy](../research/2026-07-19-secondhand-contact-policy.html)
> 외부 설계 리뷰 6회 판정 반영 — 수용/유보 내역은 §후속 참조.

## 구현 현황 (2026-08-01)

구현은 3개 Plan으로 분할해 순차 진행했으며, 현재 **Plan 1·2·3의 코드 구현은 모두 완료**되었다.
수동 E2E와 배포 검증은 별도 릴리스 게이트로 남아 있다(Plan 3 계획 문서 §최종 단계의 미체크 항목).

| 구현 단위 | 범위 | 상태 |
|---|---|---|
| Plan 1 — 공통 기반 + 공지사항 | `account.public_code` · `lib/public-code` · notice 도메인(공개·admin·홈 노출) | **완료** (`feat/community`, 실행 기록: `docs/superpowers/plans/2026-07-19-community-p1-foundation-notices.md`(삭제됨) — 실행 후 변경분은 문서 상단 고지 참조) |
| Plan 2 — 자유게시판 텍스트 코어 | post·댓글·신고·admin 숨김·rate limit (사진 제외) | **구현 완료** (`feat/community-posts`, 실행 기록: `docs/superpowers/plans/2026-07-21-community-p2-posts.md`(삭제됨)) |
| Plan 3 — 사진 파이프라인 | 비공개 버킷·서명 GET·대기 사진·ETag 검증 (§결정 8 크기 게이트 선행) | **구현 완료**(2026-08-01, `feat/community-photos`, 실행 기록: `docs/superpowers/plans/2026-07-26-community-p3-photos.md`(삭제됨)) — 실 R2 착수 게이트 통과(`spikes/2026-07-26-real-r2-gate/`, 삭제됨), 실 DB 동시성·대기 사진 소비 검증(`verification/2026-07-26-posts-edit-lock/`, 삭제됨) |

> **구현 중 확정된 변경(2026-08-01)**
> - UGC 런타임 자격증명은 처음에 상품용과 분리했으나(구현 리뷰 P1-1) **2026-08-02 공유로 전환** —
>   상품용 `R2_ACCESS_KEY_ID`/`SECRET` 한 벌을 쓰고 운영 토큰 스코프에 두 버킷을 모두 포함한다.
>   pre-launch 운영 단순화를 우선한 결정으로, 버킷 분리(비공개 UGC·서명 GET 서빙)는 유지한다.
> - 글당 사진 합계 상한을 **대기 사진 소비 트랜잭션**에서 강제한다. presign 스키마의 합계 검사는
>   요청 하나 안에서만 성립해, 배치를 나눠 받으면 우회된다(구현 리뷰 P1-2).
> - 복사를 시도한 최종 키를 실패 경로에서도 추적해 보상 삭제한다 — CopyObject가 성공한 뒤
>   응답만 유실되면 반환값 기반 추적으로는 최종 객체가 영구 고아가 된다(구현 리뷰 P1-3).

## 요약

MVP를 중고거래+인앱채팅에서 **관리자 공지사항 + 유저 자유게시판**으로 축소한다.
공지는 admin 전용 단방향 문서 목록(카페24 표준·댓글 없음·상단 고정 최대 3개·홈 노출),
자유게시판은 UGC(말머리 3종, 글+사진 최대 10장, 평면 댓글+1단 답글, 신고 → admin 숨김)다.
UGC 사진은 **비공개 버킷 + 서명 GET URL**(TTL 15분)로 서빙한다 — 숨김 시 신규 URL 발급이
중단되고 기발급 URL은 최대 15분 내 만료된다(잔여 접근 수용은 §결정 8의 명시적 결정).
거래(양도·교환·판매) 글은 운영정책으로 금지하고 신고 사유에 명시한다. 결제·채팅·좋아요·알림 없음.

## 범위 결정 이력 (사용자 확정, 2026-07-19)

| 갈림길 | 선택 | 근거 (조사 문서 섹션) |
|---|---|---|
| MVP 피벗 | 공지사항 + 자유게시판 (거래·채팅 제외) | 범위 과대 판단 |
| 댓글 | **평면 + 1단 답글** | ② — 위버스·팬카페 표준, parent_id 자기참조 |
| 사진 | **글에만 최대 10장, 댓글은 텍스트** | 당근 동네생활 선례 10장 (위버스 수치 미공개 — 실측 시 조정) |
| 좋아요 | MVP 제외 | ② — 위버스 Cheers 어뷰징 교훈 |
| 글 분류 | **플랫폼 고정형 유형 말머리 3종** (talk UI 초기 선택·info·question) | ③④ — 초기 선택으로 마찰 0, 정보 아카이빙, 운영자=개발자 |
| 거래 글 | **금지 + 신고 사유 명시** | ⑤ — 지지 인프라 없는 방임 사례 부재, 당근식 채널 분리의 사전 단계 |
| 위반 처리 | **숨김(보존) + 사유 통보**, 판단 = 신고 + admin 심사 | ⑥ — 당근 실무 선례(법적 임시조치 절차 충족은 별도 운영 절차와 함께 검토) |
| 구조 | **notices / posts 도메인 분리** | ⑦ — 이질 판정(STI 기준·WordPress 교훈), 외부 리뷰 재지지 |

## MVP 범위

**포함**: 공지(admin 작성·수정·삭제, 공개 목록·상세, 상단 고정, 홈 노출) ·
게시판 글(말머리 3종, 작성·수정·삭제, 사진) · 댓글(평면+1단 답글, 수정·삭제) ·
운영(글·댓글 신고, admin 숨김·해제·기각, 작성자에게 숨김 사유 표시) ·
작성자 공개 식별(`닉네임 #코드`) · 계정 단위 rate limit

**제외(후속)**: 좋아요 · 팔로우 · 인기글/랭킹 · 팀·멤버 태그 · 거래 글 · 외부 연락처 · 채팅 ·
실시간 알림 · 자동 모더레이션(금칙어·ML) · 댓글 사진 · mock 모드 지원

> 사진 업로드 보안 구현이 일정상 병목이 되면 **사진만 후속으로 분리**(텍스트 게시판 선출시)하는
> de-scope 레버를 인정한다 — 크기 강제(§결정 8)가 이 레버의 발동 조건이다. 크기 강제는 선행
> 스파이크(2026-07-24, 로컬 MinIO)에 이어 **실 R2 착수 게이트(2026-08-01)까지 통과**해 레버는
> **미발동으로 확정**됐다. 불완전한 업로드 검증으로 출시하지 않는다.

## 핵심 설계 결정 (와 근거)

### 1. notices / posts 도메인 분리

공지와 게시글은 이질이다(작성 주체 admin/유저, 댓글·사진·신고 유무, 고정·홈 노출 vs 소유자
수정·삭제). 공유 필드는 제목·본문뿐 — STI 판정 기준·WordPress 반면교사 모두 분리를 가리킨다(조사 ⑦).
훗날 자유게시판이 복수가 되면 그건 동질 인스턴스 문제로, `board` 마스터 + `post.board_id`를
게시판 도메인 안에서 도입한다(공지와의 분리는 유지).

### 2. URL 식별자 = `public_code` (양 도메인 공통)

`/notices/{publicCode}` · `/posts/{publicCode}` — base62 12자 CSPRNG, UNIQUE + P2002 재생성 재시도.
"IDENTITY PK 외부 비노출" 규칙 준수. 생성기는 `modules/collection/lib/public-code.ts`를
**`lib/public-code.ts`로 승격**해 collection·notices·posts가 공유한다(선행 리팩터, 테스트 동반 이동).
승격 시 **알파벳 파라미터화** — URL 코드는 기존 base62 유지, 사람이 읽는 계정 코드는 Base58 계열(§결정 3).

### 3. 작성자 공개 식별 = `account.public_code` + 작성 시점 스냅샷

- `display_name`은 중복 가능 → **`account.public_code`(Base58 계열 8자, UNIQUE) 신설** —
  사람이 읽고 비교하는 식별자이므로 `0/O`·`1/I/l` 등 혼동 문자를 제외한 알파벳 사용(외부 리뷰 합의).
  UI 표시 `홍길동 #AB12CD34`. 내부 `account_id`(UUID)는 공개 DTO에 절대 미포함.
- auth 도메인 소규모 마이그레이션: 컬럼 추가 + 기존 계정 백필(pre-launch라 부담 없음) +
  가입 시(`completeSignupAction`) 생성.
- 닉네임 표시는 **account 라이브 조회**(2026-08-02 변경, 사용자 결정) — `author_name`·`author_code`
  스냅샷 컬럼을 글·댓글에서 **제거**했다. 조회 계층이 `account_id`로 배치 조회(페이지당 1쿼리)해
  현재 `display_name`·`public_code`를 채운다.
  - **원안(작성 시점 스냅샷)의 근거였던 RLS 제약이 소멸** — RLS 미사용 결정
    ([db-authorization-review.md](../architecture/db-authorization-review.md))으로 타인 행 조회가 가능해졌다.
  - **외부 리뷰가 기각한 "수정 시 재시드"와 다르다** — 재시드의 문제(같은 작성자의 글마다 이름이
    달라짐)가 라이브 조회에는 없다. 모든 글이 항상 같은(현재) 이름을 보인다.
  - **사칭·이름 세탁**: `public_code`가 불변이라 `#코드`로 동일인 추적은 항상 가능. 닉네임 변경 시
    과거 글 표시가 바뀌는 것은 수용(국내 커뮤니티 표준 — 네이버 카페·당근 등도 라이브 닉네임).
  - **신고 증거는 계속 동결** — 스냅샷 생성 시 account를 조회해 **신고 시점 이름**을 JSONB에 박는다.
    표시가 라이브이므로 "신고자가 화면에서 본 이름"과 일치한다(작성 시점 이름보다 증거로서 정합).
  - **탈퇴 표시**: `softDeleteAccount`가 `display_name`을 "탈퇴한 회원"으로 덮으므로 자연 처리.

### 4. 말머리 = 플랫폼 고정형 (topic 컬럼)

`topic TEXT NOT NULL`(**DB 기본값 없음** — notice.category 선례) — `talk | info | question`
(zod enum **필수** + 라벨맵 잡담/정보/질문). 값 세트는 **코드가 소유**(당근 모델) — DB CHECK
없음(확장 예정 정책은 앱 검증만, 제약 레이어링 규칙). **UI(PostForm)가 잡담을 초기 선택**(디시
"일반" 패턴 — 제출값은 항상 명시적), 목록 초기 탭은 [전체]. topic 인덱스는 초기 미도입(카디널리티 3,
목록은 시간 인덱스로 커버 — 실측 병목 시 `(topic, created_at, id)` 승격). 글 작성 후 topic 수정 허용.
확장 경로(값 세분화=코드만 / team 축=컬럼 1 / 운영자 정의형=마스터 승격 / 게시판 승격=라우팅만)는
조사 ③④ 기록을 따른다.

### 5. 노출 상태 축 — `hidden_*`(admin) / `deleted_at`(작성자) 분리, soft delete

- 글·댓글 공통: `hidden_at`·`hidden_reason`·`hidden_by`(admin 숨김 — **사유·처리자 보존**) +
  `deleted_at`(작성자 삭제). 행은 보존한다.
- 근거: "숨김(보존)+사유 통보"는 당근 실무(미노출+사유 알림) 선례를 따른다(조사 ⑥). **`hidden_*`는
  권리침해 신고 처리에 필요한 비공개·보존·사유·처리자 기록의 일부 기술적 기반이며, 법적 임시조치
  절차의 충족 여부는 별도 운영 절차(접수·소명·통지·조치 표시)와 함께 검토한다**(§후속 #4 — 4차
  리뷰 문구 반영, "임시조치 정합/동형" 표현 제거).
- 공개 조회는 항상 `hidden_at IS NULL AND deleted_at IS NULL` 필터. 일반 유저에게 숨김·삭제·미존재는
  **동일 응답**(글 404 / 댓글 마스킹). 작성자 본인에게만 숨김 사실+사유 표시(§흐름 4).
- admin은 숨김·해제만 한다 — 유저 콘텐츠 대필 수정 금지.

### 6. 댓글 — parent_id 1단, 불변식 목록

`post_comment.parent_id BIGINT NULL` 자기참조. FK 미사용이므로 아래 불변식은 **mutation
트랜잭션에서 앱이 검증**한다:

1. `parent_id IS NULL` = 최상위 댓글.
2. 답글의 부모는 **같은 `post_id`** 소속이어야 한다.
3. 답글의 부모는 **최상위 댓글**이어야 한다 — 답글에 답글 요청은 거부(깊이 1 고정).
4. 부모 댓글이 삭제·숨김되어도 답글 트리는 유지된다.
5. 작성자 삭제 = 행 보존 + 표시 마스킹("삭제된 댓글입니다"). admin 숨김도 행 보존
   ("운영 정책으로 숨김 처리된 댓글입니다").
6. 답글이 없는 삭제 댓글은 목록에서 생략 가능하나, 답글이 있으면 플레이스홀더로 트리를 유지한다.
7. 삭제·숨김된 글의 댓글은 공개 조회에서 제외된다.
8. 수정·삭제는 작성자 본인만. 숨김 댓글은 작성자 수정 잠금(삭제만 허용 — 글과 동일 규칙).
9. 댓글 작성은 활성 글(미삭제·미숨김)에만 가능.

조회는 글 단위 전체 로드 후 앱에서 트리 조립(`ORDER BY created_at ASC, id ASC`) — 댓글 수 표시는
조회 시 집계(도출 우선, 캐시 컬럼은 실측 병목 시 후속).

### 7. 신고 — 명시적 2테이블 + 증거 스냅샷 + 처리 감사

- **`post_report` + `post_comment_report`** 분리(다형 target 테이블 기각 — 저장소에 다형 선례가
  없고 스냅샷 모양이 글/댓글로 다름. 외부 리뷰 권고 채택). admin 화면에서 두 목록 합산 표시.
- `reason` TEXT(zod): `spam(도배·광고) | abuse(욕설·비방) | privacy(개인정보 노출) | trade(거래 글)
  | other` — 당근 위반 사유 체계 근거(조사 ⑥), **거래 글 금지 정책을 사유로 명문화**.
- **신고 생성 시 `snapshot JSONB NOT NULL`** — 글: 제목·본문·작성자 표시(신고 시점 account 라이브 값을 동결)·사진
  R2 키 목록·글 `updated_at` / 댓글: 내용·작성자 표시·댓글 `updated_at`. 신고 후 수정·삭제에도
  admin이 신고 당시 내용을 확인 가능(전체 revision 시스템은 과설계라 스냅샷으로 갈음).
- **스냅샷 버전 계약(P1-5 리뷰 반영)**: Plan 2는 `version: 1`(텍스트 전용)만 구현했다. 사진 신고 증거를
  위해 **`version: 2`(사진 키·표시 순서 추가)를 신설**하고, admin 파싱은 `v1 | v2` discriminated union으로
  하되 기존 v1 데이터 호환을 유지한다. 신고 생성 시 **부모 `post`를 잠근 상태**에서 본문과 사진 목록을 함께
  동결한다(§8 잠금 규약). **admin 증거 열람 signer는 공개 signer와 분리** — admin은 대상이 숨김·삭제된
  뒤에도 snapshot의 사진 키에 관리자 전용 서명 GET을 발급할 수 있고(증거 확인), 공개 사용자는 숨김·삭제
  콘텐츠에 신규 URL을 받지 못한다.
- 처리 감사: `resolution TEXT(actioned|dismissed)` + `resolved_by TEXT` + `resolution_note TEXT` +
  `resolved_at`. 숨김 측은 콘텐츠 행의 `hidden_reason`·`hidden_by`·`hidden_at`이 담당.
- **숨김과 해당 콘텐츠의 미처리 신고 resolve는 같은 트랜잭션**. 1인 1대상 1신고
  (`UNIQUE(대상, reporter_account_id)`), 본인 콘텐츠 신고 불가.
- append-only `moderation_action` 이력 테이블은 후속(§후속 #2 — 승격 조건 명시).

### 8. 사진 업로드 — 비공개 버킷 + 서명 GET + 업로드 검증

admin 상품 업로드 패턴(공개 버킷·신뢰 경계 내부)을 회원 UGC에 그대로 쓰지 않는다:

- **저장 = UGC 전용 비공개 버킷** (`R2_UGC_BUCKET`, 로컬 예: `iroiro-ugc-dev`). products 공개
  버킷과 분리해 기존 서빙은 무변경. compose에 버킷 추가(anonymous 미설정) + env 추가.
- **서빙 = 서명 GET URL(TTL 15분, 상수)** — 조회 레이어가 **노출 가능한 콘텐츠에만** URL을
  발급한다. 숨김·삭제 시 **신규 URL 발급이 중단되고 기발급 URL은 최대 15분(TTL) 내 만료**된다 —
  즉시 차단이 아니며, **최대 15분의 잔여 접근을 MVP에서 수용하는 것은 명시적 결정**이다(3차 리뷰
  반영). 완전 즉시 차단(매 요청 상태 확인 프록시/게이트웨이)은 후속, TTL 상수는 단축 조정 가능.
  `lib/r2`에 GET 서명 헬퍼 추가(업로드 서명과 동일 aws4fetch 유틸).
- **캐시 계약(P1-2 리뷰 반영)**: TTL 15분은 "서명 URL을 통한 네트워크 재조회 가능 시간"이지 이미 받은
  로컬 사본의 삭제 보장이 아니다. Next Image Optimization 기본 캐시(4시간·무효화 불가)가 서명 URL을 더
  오래 재공급하지 못하도록, **UGC 이미지는 `next/image` `unoptimized` 또는 네이티브 `<img>`로 직접
  서빙**하고 객체 응답은 **`Cache-Control: private, no-store`** 준하는 정책을 쓴다(**CopyObject 시 최종
  객체에 `Content-Type`·`Cache-Control` 메타데이터를 명시 설정**하고 signed GET 응답에서 검증 — P2-1). 숨김·
  삭제 후 신규 URL 미발급 + 캐시 경로를 테스트로 검증한다.
- **signer 권한 계약(P1-4 리뷰 반영, IDOR 방지)**: **공개 signer**는 클라 `r2Key`를 신뢰하지 않고
  **한 조회에서 소속·노출을 함께 검증**해 키를 도출한다: `post.public_code = :code AND post.hidden_at IS NULL
  AND post.deleted_at IS NULL AND post_photo.id = :photoId AND post_photo.post_id = post.id AND
  post_photo.deleted_at IS NULL`. 핵심은 **`post_photo.post_id = post.id` 소속 검증**(P1-1 3차 리뷰) — 글
  미존재·숨김·삭제·사진 미존재·삭제·**타 글 소속** 모두 동일하게 미발급(노출 글 코드 + 타 숨김 글 photoId
  조합 차단). **admin 증거 signer**는 `requireAdmin()`을 입력 파싱보다
  먼저 실행하고, `reportId + target + photoIndex`를 받아 신고 snapshot을 서버에서 읽어 **snapshot에 실제
  포함된 사진 키만** 서명한다(임의 `r2Key` 클라 입력 서명 금지). Plan 3 배포 후 글 신고는 사진이 없어도 항상
  `version: 2, photos: []`로 저장하고 v1은 읽기 호환만 유지한다.
- **업로드 정책**: 글당 최대 10장 · 파일당 5MB(products `MAX_FILE_BYTES` 선례) · 글 합계 30MB ·
  `image/jpeg`·`image/png`·`image/webp`만. **HEIC 미지원(P2-4)** — `accept`에 heic를 **제외**하면
  iOS Safari가 대개 JPEG로 자동 변환한다(웹 조사 근거). `accept`에 heic를 넣으면 Safari 17+가 역변환하므로
  **금지**. SVG·HTML 불가. **크기·장수·형식은 재인코딩된 최종 Blob 기준으로 검사**(아래 재인코딩 순서).
  HEIC 거부 시 `console.warn("[heic-reject]")`로 흔적을 남기되, **브라우저 로그는 중앙 수집이 없으면
  거부율 집계가 불가**하므로(P2-5 리뷰 반영) 디코더 도입 여부는 **출시 전 iOS Safari 실기기 QA 결과**로
  판단한다. `accept`는 선택 힌트일 뿐 검증 수단이 아니므로 **서버 매직바이트 검증은 유지**한다. 클라 canvas 리사이즈 상한(긴 변 4096px)으로 64MP급
  메모리·업로드 크기를 완화(서버 픽셀 상한 8,000은 방어선 유지).
- **대기 사진(pending) 소유권** *(용어: 2026-08-02 `post_photo_claim` → `pending_post_photo` 개명 —
  국내 커머스의 "클레임"(취소·반품·교환)과 혼동되고, `pending_account`가 같은 패턴(본체 생성 전
  만료 있는 대기 레코드, `consumePending~` 소비)을 이미 이 프레임으로 명명한 선례를 따름)*:
  presign 시 `pending_post_photo`(`account_id` + 임시 `r2_key` + **선언
  `content_type`·`size_bytes`** + `expires_at`) 기록. 제출 시 소비는 **소유권·미소비·미만료를
  하나의 조건부 UPDATE에 포함하는 원자 연산**이다(4·5차 리뷰 반영) — 갱신 0행이면 거부, 같은
  대기 사진의 동시 제출 직렬화:

  ```sql
  UPDATE pending_post_photo
  SET consumed_at = now(), updated_at = now()
  WHERE id = :pending_photo_id
    AND account_id = :account_id
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING *;
  ```

  타 계정 키·미발급 키·재사용 거부. `post_photo.r2_key` UNIQUE 병행. presigned PUT TTL **10분**.
  **대기 사진 행 보존기간은 업로드 유효기간과 분리(P1-3 리뷰 반영)**: presign rate limit이 대기 사진 COUNT
  기반이라 대기 사진 행을 `expires_at` 직후 삭제하면 카운트가 소실돼 상한을 우회할 수 있다. 대기 사진 행은
  **최소 최장 rate-limit 윈도(24시간) 이상 보존**하고, 정리 잡은 `expires_at`이 아니라
  `created_at < now() - 1 day` 기준으로 삭제한다(§후속).
- **업로드는 임시 키, 등록은 최종 불변 키 + ETag 조건부 파이프라인**(3·4차 리뷰 반영):
  presigned PUT URL은 만료 전 재사용이 가능해 "검증 후 덮어쓰기"가 성립한다. 업로드는 **임시 키**
  (`posts/tmp/{uuidv7}.{ext}`)로 받고 검증 통과 시 서버가 **최종 키**(`posts/{uuidv7}.{ext}`)로
  복사한다 — 최종 키는 presign이 발급된 적 없어 클라이언트 쓰기가 원천 불가. 검증과 복사 사이의
  TOCTOU(임시 객체 교체)는 **ETag 고정**으로 차단한다: ① HEAD에서 ETag 획득 → ② 모든 range GET에
  `If-Match: {etag}` → ③ CopyObject에 `x-amz-copy-source-if-match: {etag}` — 조건 불일치(412)는
  등록 거부 + "사진 업로드를 다시 진행해주세요" 안내. **ETag 조건부 복사는 MVP 필수**(R2·MinIO
  공식 지원 확인됨). 임시 PUT에는 `If-None-Match: *`를 서명해 최초 업로드 후 덮어쓰기도 차단
  (로컬 MinIO·실 R2 양쪽에서 재업로드 412를 실증 — 2026-08-01 착수 게이트).
- **제출 시 서버 실측 검증(임시 객체 대상, ETag 고정 하)**: R2 HEAD 실측을 **대기 사진 선언값과
  대조**(content_type·size_bytes 불일치 거부) + range GET **매직바이트** + **이미지 헤더 파싱 픽셀
  검증**(상한 8,000×8,000): WebP는 **VP8·VP8L·VP8X 3형식 모두** 치수 파싱, JPEG는 SOF 탐색 상한
  64KB(미발견 시 거부), PNG는 IHDR 구조 검증 — **지원 형식이라도 치수를 확인할 수 없으면 거부**
  (fail-closed). 헤더 파싱은 픽셀 상한 검증 수단이며 **전체 이미지 디코딩과 동등하지 않다**(4차
  리뷰 문구 반영). **검증 실패 시 임시 객체 즉시 삭제**(미등록 상태라 증거 이슈 없음).
  presign은 Content-Type 서명 고정. **파일 크기의 업로드 시점 강제는 선행 스파이크로 확정했다**
  (2026-07-24 — `docs/superpowers/spikes/2026-07-24-photo-content-length/`, 삭제됨): presigned PUT의
  `Content-Length`를 서명(`aws4fetch` `allHeaders: true` → `SignedHeaders=content-length;host`)하면
  스토리지(로컬 MinIO)와 실제 브라우저 `fetch` 양층에서 선언과 다른 크기가 `403 SignatureDoesNotMatch`로
  거부됨을 실증했다 — 브라우저 `fetch`는 `Content-Length`를 body 크기로 자동설정(개발자 조작 불가)하므로
  초과 body는 서명과 불일치해 강제가 성립한다. **게이트 통과 → 선언된 `size_bytes`를 Content-Length로
  서명해 업로드 시점에 크기를 강제하고 사진 기능을 출시한다**(§MVP de-scope 레버 미발동). 이는 선언값 HEAD
  대조가 제출 시에만 실행돼 "업로드 후 미제출" 남용을 막지 못하는 한계를 보완한다.
  **실 R2 확인 완료(2026-08-01 — `docs/superpowers/spikes/2026-07-26-real-r2-gate/`, 삭제됨)**: 스크립트
  게이트 17건 전건 통과 + 브라우저 게이트 통과. 크기·MIME 강제, 조건부 복사(불일치 412), 비공개 접근
  차단, 서명 URL 만료, CORS 정확 일치·비허용 origin 차단, `posts/tmp/` 1일 만료가 실 R2에서 모두
  성립한다 — **de-scope 레버 미발동 확정**. 단 서명 없는 GET의 거부 코드는 R2가 `400 InvalidArgument`를
  반환한다(MinIO는 403) — 거부라는 사실과 객체 미노출은 동일하다. **실 R2 CORS
  계약(P1-6 리뷰 반영)**: `AllowedOrigins`=운영·개발 앱 origin을 정확히 열거(**wildcard 금지**),
  `AllowedMethods`=`PUT`(OPTIONS는 R2가 preflight로 처리하므로 별도 등록 아님), `AllowedHeaders`=최소
  `Content-Type`·`If-None-Match`, 필요 시 `ExposeHeaders`=`ETag`. 클라 PUT은 서명에 포함된 `Content-Type`·
  `If-None-Match: *`를 실제 전송하고 `Content-Length`는 브라우저가 최종 Blob 크기로 자동 설정한다. 실 R2
  선행 검증 시나리오: 정확한 크기·MIME 최초 PUT 성공 / 다른 크기·MIME 403 / 동일 키 재업로드 412 / 허용
  origin preflight 성공·비허용 차단 / signed headers에 content-length·content-type·if-none-match 포함 /
  CopyObject `x-amz-copy-source-if-match` 성공·불일치 412. **추가(P2-3 리뷰 반영)**: 비공개 버킷 unsigned
  GET 거부 / signed GET 성공 / 최종 객체 `Cache-Control: private, no-store` 확인 / signed URL 만료 후 접근
  거부 / `posts/tmp/` lifecycle 설정 확인 / 실제 preflight의 `Access-Control-Request-Headers`로 AllowedHeaders
  확정 / 성공·실패 무관 `finally` 객체 정리. **이상 시나리오는 2026-08-01 착수 게이트에서 전건 통과했다
  — 아래 실패 분기는 발동하지 않았으며 이력으로만 남긴다.** 만약 실 R2에서 크기 강제가 불가로 밝혀졌다면 **크기 강제 없는 사진 기능은 출시하지
  않는다**는 원칙에 따라 사진을 de-scope하거나 별도 업로드 게이트웨이(R2 앞단 Worker 등 독립 서비스, 또는
  `references.md` 새 패턴 도입 절차를 거친 route handler 예외의 정식 승인)를 후속 설계할 예정이었다. 내부 UI가
  호출하는 업로드 프록시를 `app/api` route handler로 두는 fallback은 **룰 2(`app/api`는 webhook/콜백
  전용)와 충돌하므로 제거**했다(6차 리뷰 반영) — 커뮤니티 기능에서만 암묵적 예외를 만들지 않는다.
- **서명 실패 응답에 CORS 헤더가 없다(2026-08-01 실 R2 게이트 발견 — 신규, 5차 리뷰 문구 반영)**:
  실 R2에서 확인한 범위는 **SigV4 서명 실패 응답(`403 SignatureDoesNotMatch`)에 CORS 응답 헤더가
  없었고, 브라우저에서 `TypeError: Failed to fetch`로 관측됐다**는 사실이다(성공 응답에는 있었다).
  **R2 오류 응답 전반으로 일반화하지 않는다** — 같은 게이트에서 **서명 검증 이후 발생한 조건부 쓰기
  실패(`412 PreconditionFailed`)는 브라우저가 상태코드를 그대로 읽었다**. 즉 확인된 것은 **검증한 두
  시나리오의 관측 결과**일 뿐이며(SigV4 서명 불일치 → 판독 불가 / 서명 검증 이후 조건부 실패 → 412 판독),
  Cloudflare가 모든 오류 응답에 동일한 내부 처리 규칙을 적용한다고 확인한 것은 아니다. 재시도 계약도
  **관측된 412 시나리오에 한정해** 유지한다(5차·6차 리뷰 문구 반영). 로컬 MinIO는 서명 실패 응답에도
  CORS 헤더를 붙이므로 기존 스파이크에서 드러나지 않았다.
  결과: **클라이언트는 크기 계약 위반과 일시적 네트워크 장애를 상태코드로 구분할 수 없다.**
  강제 자체는 서버에서 성립하므로(초과 크기 키의 서명 HEAD가 정확히 404) **보안 목표에는 영향이
  없다** — 단 이 부재 확인은 단독 증거가 아니라 Node 계층의 크기 불일치 403 실증·정상 브라우저
  업로드의 저장 확인과 **결합해서** 성립한다. 정상 구현에서는 이 경로가 발생하지 않으며, 불일치는
  요청 변조 또는 클라이언트 결함·상태 불일치 가능성을 의미한다. 클라 PUT 재시도 규칙은 이를 네트워크
  오류로 분류해 1회 재시도 후 실패한다 — 즉 **"4xx는 재시도 없이 실패" 분기는 실 R2의 크기 위반에
  적용되지 않는다**(rate limit·lifecycle이 있는 MVP에서 불필요한 1회 재시도는 수용). 사용자 문구는
  실패 원인을 단정하지 말고 재시도를 안내한다.
- **재인코딩→검증→presign 순서(P1-1 리뷰 반영)**: 재인코딩은 MIME·바이트 크기를 바꾸므로, 대기 사진에
  서명하는 `Content-Type`·`Content-Length`가 실제 업로드 Blob과 일치해야 한다. 순서는 **파일 선택 →
  디코딩·재인코딩·리사이즈 → 최종 Blob 확정 → Blob의 type/size 검증 → 대기 사진·presign → 동일 Blob PUT**
  이다. 파일당 5MB·글 합계 30MB도 원본이 아니라 **최종 Blob 기준**으로 검사한다.
- **EXIF·메타데이터(4차 리뷰 문구 반영)**: 정상 클라이언트에서는 canvas 재인코딩으로 메타데이터
  제거를 **시도**한다(보조 수단이며 서버 검증을 대체하지 않음). **서버는 MVP에서 EXIF 제거를
  보장하지 않는다** — 재인코딩은 우회·생략 가능하고, 사진 속 위치정보가 항상 업로더 본인의 정보인
  것도 아니다. **서버측 EXIF 검사·거부 또는 재인코딩(§후속 #3) 전까지 잔여 개인정보 노출 위험을
  수용한다**(명시적 결정).
- 키 체계: 임시 `posts/tmp/{uuidv7}.{ext}` → 최종 `posts/{uuidv7}.{ext}`. **등록된 최종 객체는
  원칙적으로 삭제하지 않는다**(products 선례) — 신고 이력 콘텐츠는 증거 보존. 검증 실패 임시
  객체는 즉시 삭제. **잔여 임시 객체는 `posts/tmp/` prefix lifecycle 만료(1일)로 정리** — R2
  Object Lifecycle·MinIO ILM 모두 prefix 만료를 지원하므로 **MVP에 인프라 설정으로 포함**.
  단 **PUT TTL과 lifecycle은 무제한 임시 업로드를 차단하지 않으며 피해 지속 시간만 줄이는
  완화책**이다(5차 리뷰 문구 반영) — 크기의 업로드 시점 강제는 위 의사결정 게이트가 담당한다.
  만료 대기 사진 **행** 정리 잡만 후속(`expires_at` 인덱스 선반영).
- **다중 사진 부분 실패 보상(P1-7 리뷰 반영)**: 제출된 모든 대기 사진을 **하나의 짧은 DB 트랜잭션에서
  조건부 소비**(소유권·미소비·미만료)하고, 하나라도 조건 불통과면 전체 롤백한다. 대기 사진 소비 tx **종료 후**
  R2 검증·복사를 수행한다(네트워크 I/O 동안 DB tx 미유지). 생성된 최종 키를 누적하고, 이후 사진의 검증·
  복사 또는 최종 DB 반영이 실패하면 **누적된 최종 객체 전체를 보상 삭제**한다(예: 10장 중 6번째 실패 시
  앞 5개도 삭제). DB 커밋 성공 후 임시 객체 즉시 삭제 시도, 실패는 `posts/tmp/` lifecycle이 fallback.
  보상 삭제 실패 키는 **구조화 로그**로 기록하고 정리 잡(버킷 목록과 DB anti-join)이 수거한다(post가 참조
  안 하므로 노출 없음). 실패 시 **소비된 대기 사진은 복구하지 않고 새 업로드를 요구**하며(UX), 이전·실패·미처리
  임시 객체는 `posts/tmp/` lifecycle이 정리한다(P2-2 리뷰 반영).
- **외부 R2 요청 견고성(P2-2 리뷰 반영)**: 사진 10장은 HEAD·range GET·CopyObject로 30회+ 외부 요청을
  낸다. 요청별 `AbortSignal.timeout`, **bounded concurrency**(무제한 병렬 금지), 전체 작업 시간 상한,
  timeout 시 최종 객체 보상, 5xx·네트워크 오류의 최대 재시도·backoff를 정의한다. `If-None-Match: *`는
  응답 유실 후 재시도에서 412가 날 수 있으므로, 412를 무조건 실패로 볼지 서버 HEAD로 성공을 복구할지 정한다.

### 9. 남용 방어 — 계정 단위 DB 카운트 rate limit

rate limit은 **보안 경계가 아니라 남용 완화 수단**이다(외부 리뷰 문구 반영). 신규 인프라 없이
계정 단위 DB COUNT(전용 `(account_id, created_at)` 복합 인덱스)로 이중 윈도 상한:
글 5/시간·20/일 — 댓글 5/분·60/시간 — 신고 5/10분·20/일(**글·댓글 신고 합산** — 유형 분리 아님) —
presign 30/시간·100/일 — **생성되는 대기 사진 수 기준(P1-3 리뷰 반영)**: 10장 일괄 요청은 `현재 대기 사진 수 +
요청 장수 <= 상한`으로 검사한다(예: 현재 25건일 때 10장 요청은 30/시간 상한에서 거부). zod 상수.
IP 단위는 상태 저장소 부재로 후속. 초과 시 도메인 에러.

### 10. mock 미지원 (DB 전용)

작성·댓글·신고가 세션(auth = DB 전용)에 묶이고 collection 선례와 동일 결정. `dev:all`로 검증,
README mock 커버리지 서술에 추가.

### 11. 글 수정 정책 — bait-and-switch 방어 (Plan 3 리뷰 반영)

댓글이 달린 뒤 작성자가 원글을 다른 내용으로 바꾸면 기존 댓글이 맥락과 어긋나 악용될 수 있다
(context collapse). 실서비스는 완전 수정금지 대신 **투명성·잠금**으로 대응한다(웹 조사: Stack
Overflow·Discourse 이력 공개, X 수정창 제한, phpBB·XenForo 댓글 후 잠금). 우리는 **엄격형**을 택한다:

- **수정 잠금(P1-3 리뷰 반영)**: 미삭제 댓글이 0개면 자유 수정, **1개 이상이면 잠금**(grace period
  없음). 잠금 대상은 **`topic`·`title`·`body` 세 필드 전부** — 제목·말머리도 bait-and-switch에 쓰일 수
  있다. 동시성 계약: ① tx 시작 → ② 대상 post `FOR UPDATE` 잠금 → ③ 소유권·숨김·삭제 재검증 → ④ 미삭제
  댓글 존재 확인 → ⑤ 댓글이 없을 때만 topic/title/body 갱신 → ⑥ `edited_at` 갱신 후 커밋. `createComment`도
  post를 먼저 잠그므로 update 선행/comment 선행 양방향이 직렬화된다(실 DB 동시성 테스트 추가).
- **잠금 UI 상태 구분(P1-2 3차 리뷰)**: 운영 숨김과 댓글 잠금은 다른 사유이므로 boolean이 아니라
  `lockedReason: "moderation" | "has_comments" | null`로 구분한다 — **우선순위: `hidden_at IS NOT NULL` →
  `moderation`, else 미삭제 댓글 1개↑ → `has_comments`, else `null`**(운영 숨김이 댓글 잠금보다 우선 — 두
  조건 동시 충족 시 `moderation`). 이 우선순위를 capability·`getEditablePost`·PostForm·mutation 네 곳에
  **동일 적용**한다(하나라도 순서가 다르면 표시와 실제 거부 사유가 어긋남). 상세 capability `canEdit`은 본인이며
  미삭제 댓글 0일 때만 true,
  `getEditablePost`도 두 사유를 구분 반환. PostForm은 사유별 문구(운영: "운영 검토 중인 글입니다…", 댓글:
  "댓글이 작성된 글은 내용을 수정할 수 없습니다. 삭제는 가능합니다."), mutation도 운영 숨김/댓글 존재 오류를
  구분한다. 두 상태 모두 삭제는 허용.
- **삭제는 항상 허용**: 댓글 달린 뒤 내용을 바꾸려면 **삭제 후 재작성**이 정식 경로(댓글도 함께
  사라져 맥락 왜곡 불가).
- **"수정됨" 표시(P1-2 리뷰 반영)**: `updated_at`은 삭제·숨김·해제에서도 갱신되므로 작성자 편집 판정에
  못 쓴다. **작성자 편집 전용 `edited_at TIMESTAMPTZ NULL`**을 post에 두고(작성자가 topic/title/body 수정
  시에만 갱신), `edited_at IS NOT NULL`이면 목록·상세에 "수정됨 · {edited_at}" 뱃지. **작성자 편집 시
  `edited_at`과 `updated_at`을 같은 `now`로 함께 갱신**해 작성자 편집도 CDC·증분 연동에 포함한다(P2-1).
  **실제 변경(topic/title/body 중 하나 이상 상이) 시에만 `edited_at` 갱신**하고 무변경 저장은 성공 no-op로
  처리한다(P2-2). `updated_at`은 모든 상태 변경 추적 용도로 유지.
- **사진은 생성 시에만 등록**(§8): 편집 화면에서 사진 추가·삭제·재정렬 불가 → 사진 bait-and-switch
  원천 차단(사진 편집은 §후속). 이로써 `post_photo`에 `size_bytes`는 불필요(생성 시 일괄 검증).
- **신고 스냅샷**(§7)은 신고 시점 동결 유지.
- revision history 전체 공개(투명성 최상)는 별도 `post_revision` 저장 비용으로 §후속.

> 이 정책은 Plan 2의 `updatePost`·`PostForm`에도 소급 적용된다(현재는 자유 수정) — 구현 계획에서
> Plan 2 수정 경로에 "댓글 존재 시 잠금" 조건과 "수정됨" 표시를 추가한다.

## 데이터 모델

마이그레이션 구성(as-built): 작성자 공개 식별자 `account.public_code`는 **`init_account`에 병합**
(구현 당시 별도 `alter_account_public_code`로 냈다가 베타 DB 재구축 시점에 통합 — pre-launch
in-place 수정). 커뮤니티 테이블은 도메인별로 나뉜다 — `init_notice`(notice) /
`init_post`(6테이블 — post·post_comment·post_report·post_comment_report·post_photo·pending_post_photo).
사진 2테이블은 Plan 3 구현 중 별도 `init_post_photo`로 냈다가 Plan 3 병합 시점에 `init_post`로
통합했다(2026-08-01, pre-launch in-place 수정 — `account.public_code` 선례와 동일). 원안이 한 파일이었고
분리는 Plan을 나눠 진행하기 위한 실행 편의였으므로, 병합 후에는 분리를 유지할 이유가 없다.
컨벤션: 단수 테이블명 · BIGINT IDENTITY PK · FK 미사용(관계
컬럼 수동 인덱스 필수) · TEXT enum + zod · 블록 구조 · 파일 끝 GRANT · 전 컬럼 한국어 COMMENT
(마이그레이션에서 작성, 스케치에선 생략).

### account (변경) — 공개 식별자

```sql
-- init_account CREATE TABLE에 병합 (별도 ALTER·백필 없음 — pre-launch DB 재구축):
--   public_code TEXT NOT NULL
CREATE UNIQUE INDEX account_public_code_unique ON account (public_code);
-- length CHECK 미부여 — 형식은 앱(generateAccountCode, 항상 8자)이 보장, DB는 NOT NULL + UNIQUE만
```

### notice — 공지사항 (admin 콘텐츠)

```sql
CREATE TABLE notice
(
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    public_code TEXT        NOT NULL,
    category    TEXT        NOT NULL,  -- general | event (zod enum 필수·기본값 없음, 확장 예정 → CHECK 없음)
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    is_pinned   BOOLEAN     NOT NULL DEFAULT false,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT
);

CREATE UNIQUE INDEX notice_public_code_unique ON notice (public_code);  -- public_code length CHECK 미부여(형식은 앱)
CREATE INDEX notice_created_at_idx ON notice (created_at);
CREATE INDEX notice_updated_at_idx ON notice (updated_at);
```

- `created_by/updated_by`: **관리자 관리 테이블 규칙** 적용(카탈로그 선례). 회원 소유 테이블(post 계열)엔 없음.
- **soft delete(`deleted_at`)** — 공지는 URL로 공유되는 대외 문서라 "게시했다"는 증빙 가치가 있음
  (외부 리뷰 수용, hard delete 철회). 공개 조회는 `deleted_at IS NULL` 필터.
- 고정 최대 **3개(초기값, 전 카테고리 합산 전역)** 는 앱 정책(팬카페 필독 선례) — 고정 mutation tx에서
  **`pg_advisory_xact_lock(hashtext('notice_pin'))`으로 전체 직렬화 후 카운트 검증**(3차 리뷰 반영 —
  행 잠금(FOR UPDATE)은 고정 0건일 때 잠글 행이 없어 상한을 보장하지 못하는 팬텀 문제). tx 종료 시
  자동 해제. 정렬: `is_pinned DESC, created_at DESC, id DESC`.
- 본문은 plain text + 줄바꿈(rich text 미지원 — XSS 표면 최소화, post와 동일).

### post — 게시판 글

```sql
CREATE TABLE post
(
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id    UUID        NOT NULL,
    public_code   TEXT        NOT NULL,
    topic         TEXT        NOT NULL,   -- talk | info | question (zod enum 필수·기본값 없음 — notice.category 선례, UI가 "잡담" 프리셀렉트)
    title         TEXT        NOT NULL,
    body          TEXT        NOT NULL,
    edited_at     TIMESTAMPTZ,                           -- 작성자 콘텐츠(topic/title/body) 편집 시각 (P1-2: '수정됨' 전용, updated_at과 분리)
    hidden_at     TIMESTAMPTZ,
    hidden_reason TEXT,
    hidden_by     TEXT,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public_code length CHECK 미부여(형식은 앱). hidden_* 3컬럼 동반 set/null은 불변식 → CHECK 유지.
ALTER TABLE post ADD CONSTRAINT post_hidden_consistency
    CHECK ((hidden_at IS NULL) = (hidden_reason IS NULL) AND (hidden_at IS NULL) = (hidden_by IS NULL));
CREATE UNIQUE INDEX post_public_code_unique ON post (public_code);
CREATE INDEX post_account_created_at_idx ON post (account_id, created_at);  -- rate limit COUNT + 내 글 목록
CREATE INDEX post_created_at_idx ON post (created_at);
CREATE INDEX post_updated_at_idx ON post (updated_at);
```

- 목록 정렬 `created_at DESC, id DESC`(동시각 안정화). 검색은 title ILIKE(v1).
- **작성자 표시 컬럼 없음**(2026-08-02 as-built) — `author_name`·`author_code` 스냅샷을 제거하고
  조회 계층이 `account`를 배치 조회한다(위 §닉네임 결정). 댓글(`post_comment`)도 동일 구조.

### post_photo / pending_post_photo

```sql
CREATE TABLE post_photo
(
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id       BIGINT      NOT NULL,
    r2_key        TEXT        NOT NULL,
    display_order INT         NOT NULL DEFAULT 0,
    is_thumbnail  BOOLEAN     NOT NULL DEFAULT false,
    deleted_at    TIMESTAMPTZ,                         -- soft delete (P2-1: 키 추적 유지 + 정리 잡 후속)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX post_photo_r2_key_unique        ON post_photo (r2_key);
CREATE UNIQUE INDEX post_photo_one_thumbnail_unique ON post_photo (post_id) WHERE is_thumbnail = true AND deleted_at IS NULL;
CREATE INDEX post_photo_post_idx       ON post_photo (post_id, display_order);
CREATE INDEX post_photo_created_at_idx ON post_photo (created_at);
CREATE INDEX post_photo_updated_at_idx ON post_photo (updated_at);

CREATE TABLE pending_post_photo
(
    id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id   UUID        NOT NULL,
    r2_key       TEXT        NOT NULL,               -- 임시 키 (posts/tmp/…)
    content_type TEXT        NOT NULL,               -- 선언값 — 제출 시 HEAD 실측과 대조
    size_bytes   INT         NOT NULL,               -- 선언값 — 〃
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pending_post_photo ADD CONSTRAINT pending_post_photo_size_positive CHECK (size_bytes > 0);
CREATE UNIQUE INDEX pending_post_photo_r2_key_unique ON pending_post_photo (r2_key);
CREATE INDEX pending_post_photo_account_created_at_idx ON pending_post_photo (account_id, created_at);  -- presign rate limit
CREATE INDEX pending_post_photo_expires_at_idx ON pending_post_photo (expires_at);  -- 만료 대기 사진 정리(후속 잡)
CREATE INDEX pending_post_photo_created_at_idx ON pending_post_photo (created_at);
CREATE INDEX pending_post_photo_updated_at_idx ON pending_post_photo (updated_at);
```

- 사진은 **soft delete(`deleted_at`) + R2 객체 비삭제(P2-1 리뷰 반영)** — hard delete하면 남은 객체
  키를 관리할 레코드가 사라지므로 행·키를 보존한다(Plan 2 post/comment와 동일 축). 신고 미참조 +
  보존기간 경과분의 R2 객체 정리 잡은 §후속. `is_thumbnail` partial unique와 조회는 `deleted_at IS NULL`을
  함께 본다. **글 삭제(`deletePost`) tx에서 활성 사진(`deleted_at IS NULL`)도 함께 soft delete**하고,
  admin 숨김은 사진 soft delete가 아니라 공개 signer 차단으로 처리한다(P1-5 — 숨김 해제 시 사진 복원 불필요).
  `account_id`는 대기 사진에만 있고 `post_photo`엔 없음(소유 비정규화 금지 — 소유는 post 경유).
  장수 10장·용량·확장자는 zod 정책. **`size_bytes`는 저장하지 않음** — 사진은 생성 시에만 등록(§11)이라
  생성 시 일괄 검증으로 충분(사진 편집 도입 시 재검토).

### post_comment — 댓글

```sql
CREATE TABLE post_comment
(
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id       BIGINT      NOT NULL,
    account_id    UUID        NOT NULL,
    parent_id     BIGINT,                                -- NULL = 최상위
    body          TEXT        NOT NULL,
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
CREATE INDEX post_comment_account_created_at_idx ON post_comment (account_id, created_at);  -- rate limit COUNT
CREATE INDEX post_comment_created_at_idx ON post_comment (created_at);
CREATE INDEX post_comment_updated_at_idx ON post_comment (updated_at);
```

### post_report / post_comment_report — 신고 (구조 동일, 대상만 다름)

```sql
CREATE TABLE post_report
(
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id             BIGINT      NOT NULL,
    reporter_account_id UUID        NOT NULL,
    reason              TEXT        NOT NULL,   -- spam | abuse | privacy | trade | other (zod)
    detail              TEXT,
    snapshot            JSONB       NOT NULL,   -- 신고 시점: 제목·본문·작성자 표시·사진 키·updated_at
    resolution          TEXT,                   -- actioned | dismissed (zod)
    resolved_by         TEXT,
    resolution_note     TEXT,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE post_report ADD CONSTRAINT post_report_resolution_consistency
    CHECK ((resolved_at IS NULL) = (resolution IS NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL));
CREATE UNIQUE INDEX post_report_post_reporter_unique     ON post_report (post_id, reporter_account_id);
CREATE INDEX post_report_reporter_created_at_idx         ON post_report (reporter_account_id, created_at);  -- rate limit
CREATE INDEX post_report_unresolved_created_at_idx       ON post_report (created_at) WHERE resolved_at IS NULL;
CREATE INDEX post_report_created_at_idx ON post_report (created_at);
CREATE INDEX post_report_updated_at_idx ON post_report (updated_at);

-- 댓글 신고: 전문 명시(구현 드리프트 방지 — 외부 리뷰 반영)
CREATE TABLE post_comment_report
(
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    comment_id          BIGINT      NOT NULL,
    reporter_account_id UUID        NOT NULL,
    reason              TEXT        NOT NULL,   -- spam | abuse | privacy | trade | other (zod)
    detail              TEXT,
    snapshot            JSONB       NOT NULL,   -- 신고 시점: 댓글 내용·작성자 표시·댓글 updated_at
    resolution          TEXT,                   -- actioned | dismissed (zod)
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
```

- `updated_at`을 두는 이유: `resolved_*` 스탬프 갱신이 있어 불변 테이블이 아님(`inventory_item` 선례).
- `(대상, 신고자)` **영구 UNIQUE = 대상당 1회 신고**(확정): 기각 후 콘텐츠가 수정되어도 같은 사람의
  재신고는 불가하다 — 신고 남용(반복 신고) 방지를 우선한 **의도된 트레이드오프**. 수정 후 재발
  위반은 다른 이용자의 신고 또는 admin 전체 검색으로 커버한다.
- 신고 스냅샷·신고자 신원은 **admin 전용 쿼리로만** 노출(+ RLS 백스톱, §GRANT/RLS).
- **`hidden_by`·`resolved_by`는 TEXT 유지**(외부 리뷰의 UUID화 제안에 대한 반론 채택): TEMP-LOGIN-BYPASS
  하에서 admin은 실계정(UUID)이 아니므로 지금 UUID 컬럼은 채울 값이 없다. 관리자 관리 테이블의
  `created_by/updated_by TEXT` 선례를 따르고, **admin 실인증 도입 시 account UUID 전환 마이그레이션**을
  후속(§후속 #3)으로 명시한다. FK(`ON DELETE SET NULL`) 제안은 저장소의 FK 미사용 결정과 충돌하여 기각.
  (2026-07-21 갱신: 자체 세션 기반 admin 실인증 도입 완료 — `created_by`류에는 account UUID가
  TEXT로 기록된다. 컬럼 타입 전환은 §후속 #3 유지.)

### GRANT / RLS

```sql
REVOKE ALL ON notice, post, post_photo, pending_post_photo, post_comment, post_report, post_comment_report
    FROM anon, authenticated, app;
GRANT SELECT, INSERT, UPDATE         ON notice           TO app;  -- DELETE 없음: soft delete 강제
GRANT SELECT, INSERT, UPDATE         ON post             TO app;  -- DELETE 없음: soft delete 강제
GRANT SELECT, INSERT, UPDATE         ON post_photo       TO app;  -- DELETE 없음: soft delete 강제(P1-5)
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_post_photo TO app;  -- 대기 사진은 만료 정리 잡이 hard delete
GRANT SELECT, INSERT, UPDATE         ON post_comment     TO app;  -- DELETE 없음: soft delete 강제
GRANT SELECT, INSERT                 ON post_report          TO app;
GRANT UPDATE (resolution, resolved_by, resolution_note, resolved_at, updated_at) ON post_report TO app;
GRANT SELECT, INSERT                 ON post_comment_report  TO app;
GRANT UPDATE (resolution, resolved_by, resolution_note, resolved_at, updated_at) ON post_comment_report TO app;

-- 신고 2테이블 = 경계 데이터(신고자 신원·스냅샷) → RLS 백스톱 적용 (외부 리뷰 수용)
ALTER TABLE post_report         ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comment_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_report_insert_own    ON post_report FOR INSERT
    WITH CHECK (reporter_account_id = (select current_account_id()));
CREATE POLICY post_report_select_own_or_admin ON post_report FOR SELECT
    USING (reporter_account_id = (select current_account_id()) OR (select is_admin()));
CREATE POLICY post_report_admin_update  ON post_report FOR UPDATE USING ((select is_admin()));
CREATE POLICY post_comment_report_insert_own   ON post_comment_report FOR INSERT
    WITH CHECK (reporter_account_id = (select current_account_id()));
CREATE POLICY post_comment_report_select_own_or_admin ON post_comment_report FOR SELECT
    USING (reporter_account_id = (select current_account_id()) OR (select is_admin()));
CREATE POLICY post_comment_report_admin_update ON post_comment_report FOR UPDATE USING ((select is_admin()));
-- DELETE: 정책·GRANT 모두 미부여 (신고는 취소 불가)
```

- 신고 테이블은 **컬럼 제한 UPDATE**(처리 컬럼만) — 신고 원문·스냅샷의 사후 변조를 DB 레벨에서 차단.
- **신고 2테이블은 RLS 적용**: 신고자 신원·스냅샷은 저장소 기준의 "경계 데이터"에 해당(data-modeling
  — PII성 경계 테이블은 RLS 백스톱). INSERT는 본인 reporter로만, **SELECT는 본인(own-row) 또는
  admin** — Prisma `create()`의 `INSERT … RETURNING`이 SELECT 정책을 요구하므로 own-row SELECT가
  필요하다(4차 리뷰 반영, `account` own-or-admin 선례와 동일 형태). UPDATE는 admin만, DELETE는
  불가. 타인 신고·스냅샷은 여전히 비노출. `current_account_id()`·`is_admin()` 헬퍼 + `(select …)`
  initplan 래핑 — 기존 정책 문법 그대로(bb694ca 선례).
- **그 외 5테이블은 RLS 미적용 + 앱 DAL 인가.** 명시적 근거: 공지·글·댓글·사진은 공개물이고
  숨김·삭제 필터는 조회 계층 책임 — `order`·collection 선례와 동일 판단. defense-in-depth 확대는 후속.

### Prisma

`Notice` / `Post` / `PostPhoto` / `PendingPostPhoto` / `PostComment` / `PostReport` /
`PostCommentReport` + `Account.publicCode`. 도메인 내부만 `@relation`(Post↔Photo↔Comment↔Report),
교차 도메인(`account_id`·`reporter_account_id`)은 bare 스칼라 + `@@index`. 인덱스·유니크·partial은
마이그레이션과 동일 `map` 이름 미러링(partial은 `where: raw`).

## 모듈 · 파일 구조

| 파일 | 역할 |
|---|---|
| `modules/notices/types.ts` | DTO·`NOTICE_CATEGORY_LABELS`(일반/이벤트) |
| `modules/notices/lib/{schema,queries,transform}.ts` | zod(고정 3개 정책 포함) · 목록/상세/홈 스트립 · DTO |
| `modules/notices/actions.ts` | admin CRUD(`requireAdmin`) — 얇은 wrapper |
| `modules/notices/components/` | `NoticeList`·`NoticeDetail`·`NoticeForm`·홈 스트립 |
| `modules/posts/types.ts` | DTO·`POST_TOPIC_LABELS`·`REPORT_REASON_LABELS`·`RESOLUTION_LABELS` |
| `modules/posts/lib/schema.ts` | zod — 글(길이·사진 10장)·댓글(깊이 규칙)·신고·rate limit 상수 |
| `modules/posts/lib/pending-photo.ts` | 대기 사진 발급·소비·선언값 대조·실측 검증(HEAD·매직바이트·픽셀)·최종 키 복사 |
| `lib/r2` (변경) | **GET 서명 헬퍼 추가**(비공개 UGC 버킷 서빙) + UGC 버킷 env — 업로드 서명과 동일 유틸 |
| `modules/posts/lib/queries.ts` | 목록(탭·검색·페이지네이션)·상세(+댓글 트리)·내 글·admin 신고 큐(2테이블 합산) — db 주입형 |
| `modules/posts/lib/mutations.ts` | 글/댓글/신고/숨김·해제·기각 — `requireOwnedPost`·댓글 불변식 검증·동일 tx |
| `modules/posts/lib/transform.ts` | DTO — 마스킹·플레이스홀더·본인 숨김 사유 뱃지·DTO 격리 |
| `modules/posts/actions.ts` | parse → 인증 → mutation → revalidate + `presignPostPhotos` |
| `modules/posts/components/` | `PostList`·`PostCard`·`PostForm`·`PostDetail`·`CommentThread`·`CommentForm`·`ReportDialog`·`MyPosts` |
| `lib/public-code.ts` (승격) | collection에서 이동, 3도메인 공유 — 선행 리팩터 |
| `modules/auth` (변경) | 가입 시 `public_code` 생성, `account` 마이그레이션 |

## 라우팅 · 권한

| 경로 | 화면 | 접근 |
|---|---|---|
| `/notices` · `/notices/[publicCode]` | 공지 목록(고정 우선)·상세 | 공개 |
| (shop) 홈 | 최신 공지 스트립(고정 우선 1~2건) — 발견성(조사 ①) | 공개 |
| `/posts` | 목록 — [전체/잡담/정보/질문] 탭·제목 검색·페이지네이션 20 | 공개 |
| `/posts/[publicCode]` | 상세 + 댓글 트리 | 공개(숨김·삭제 글 404 동일) |
| `/posts/new` · `/posts/[publicCode]/edit` | 작성·수정 | 로그인 / 본인 글 |
| `/posts/my` | 내 글 — **숨김 시 "운영 정책 위반으로 숨김 처리됨" + `hidden_reason` 표시** | 로그인 |
| `/admin/notices` | 공지 CRUD + 고정 토글 | admin |
| `/admin/posts` | 신고 큐(글+댓글 합산, 미처리 기본) + 숨김/해제/기각 + 전체 글 검색 | admin |

`(shop)` 헤더 네비에는 **"커뮤니티" 링크 하나만** 추가한다(헤더 밀집 회피 — 외부 리뷰 권고).
공지 진입은 홈 공지 스트립 + 커뮤니티 페이지 내부 링크가 담당. `new`·`my`는 정적 세그먼트라
`[publicCode]`와 충돌 없음.

| 행위 | 비로그인 | 로그인 | 작성자 | admin |
|---|---|---|---|---|
| 공지·글·댓글 열람 | ✅ | ✅ | ✅ | ✅ |
| 글·댓글 작성 | ❌ | ✅ | — | ✅ |
| 글·댓글 수정·삭제 | ❌ | ❌ | ✅ 본인 — 글 수정: 미숨김·미삭제 댓글 0건 / 글·댓글 삭제: 숨김·댓글 존재 시에도 허용 / 댓글 수정: 미숨김(§결정 6) | ❌ (대필 금지) |
| 신고 | ❌ | ✅ (대상당 1회, 본인 것 불가) | ❌ | — |
| 숨김·해제·기각 / 공지 CRUD | ❌ | ❌ | ❌ | ✅ |

## 핵심 흐름

- **글 작성**: PostForm → (사진) **클라 canvas 재인코딩·리사이즈 → 최종 Blob 확정 → Blob type/size
  검증**(P1-1: 재인코딩이 MIME·크기를 바꾸므로 presign 전에 확정) → `presignPostPhotos`: zod(장수·용량·
  MIME, **최종 Blob 기준**) → 대기 사진 INSERT → UGC 버킷 **임시 키** 직접 PUT(`If-None-Match: *`, 동일
  Blob) → 제출 `createPost`:
  parse → 세션 → 대기 사진 원자 소비 → **ETag 고정 검증**(HEAD ETag → `If-Match` range 검증: 선언값
  대조·매직바이트·픽셀, 실패 시 임시 객체 삭제) → **조건부 CopyObject**(`x-amz-copy-source-if-match`,
  412면 등록 거부) → tx: post+photo INSERT(최종 키, code 재시도;
  tx 실패 시 최종 객체 삭제 시도) → revalidate → 상세 redirect.
- **사진 서빙**: 목록·상세 렌더 시 노출 가능한 콘텐츠에만 서명 GET URL(TTL 15분) 발급 —
  숨김·삭제 시 신규 URL 미발급, 기발급분은 최대 15분 내 만료(잔여 수용 — §결정 8).
- **댓글**: `createComment` — tx에서 불변식(§결정 6) 검증 → INSERT. 수정·삭제(마스킹)·본인 검증 동일.
- **신고→처리**: 신고 INSERT(스냅샷 동결, 본인 차단, P2002 → "이미 신고") → admin 큐(2테이블 합산,
  `resolved_at IS NULL`) → 숨김: 대상 `hidden_*` 스탬프 + 미처리 신고 일괄
  `resolution='actioned'`+`resolved_*` **동일 tx** / 기각: `dismissed` resolve만 / 해제: `hidden_*` NULL.
- **숨김 통보**: 글 — `/posts/my`에 상태+사유. 댓글 — 스레드 렌더 시 세션==작성자면 본인 댓글에
  사유 뱃지, 타인에겐 숨김 플레이스홀더(답글 있을 때) 또는 생략.
- **rate limit**: mutation 진입 시 계정 단위 COUNT(전용 `(account_id, created_at)` 복합 인덱스,
  이중 윈도) — 초과 시 도메인 에러. 보안 경계가 아닌 남용 완화 수단(§결정 9).

## 에러 처리

| 상황 | 처리 |
|---|---|
| zod 실패 / 길이 초과 / 사진 초과 | 필드 에러 |
| 미로그인 쓰기 | `redirect("/login")` |
| 타인 콘텐츠 수정·삭제 / 숨김·삭제·미존재 글 | 404 동일 응답 |
| 답글에 답글 / 타 글 부모 / 부재 부모 | "답글을 달 수 없는 댓글입니다" 도메인 에러 |
| 숨김 콘텐츠 수정 시도 | "운영 검토 중" 잠금 에러(삭제만 허용) — `lockedReason="moderation"` |
| 미삭제 댓글이 존재하는 글 수정 시도 | "댓글이 작성된 글은 수정할 수 없습니다" 도메인 에러(삭제는 허용) — `lockedReason="has_comments"` |
| `public_code`·대기 사진·신고 P2002 | `isUniqueViolationOn(error, 컬럼)`(`lib/prisma-errors`, adapter-pg 실측 구조)으로 구분 — 코드 재시도 / "이미 등록된 사진" / "이미 신고" |
| 대기 사진 만료·타계정·동시 제출 / 실측(크기·타입·픽셀) 위반 / ETag 불일치(412) | "사진 업로드를 다시 진행해주세요" + 임시 객체 등록 거부 |
| rate limit 초과 | "잠시 후 다시 시도" 도메인 에러 |
| 고정 4개째 시도 | "고정은 최대 3개" (admin) |

## 프라이버시 · 보안

- 공개 DTO 비포함: `account_id`·신고자·스냅샷·`hidden_reason`(본인 제외)·이메일 등 일체.
- 본문·댓글 plain text 렌더(줄바꿈만) — rich text 미지원.
- 사진 보안 세트는 §결정 8. 입력 길이(zod): 공지 제목 100·본문 10,000 / 글 제목 80·본문 5,000 /
  댓글 1,000 / 신고 detail 500 / 숨김 사유 500 / 처리 메모 1,000 — **전 입력 trim 후 공백만인 값 거부**.
- 권리침해 대응: **`hidden_*`는 권리침해 신고 처리에 필요한 비공개·보존·사유·처리자 기록의 일부
  기술적 기반이다. 법적 임시조치 절차의 충족 여부는 별도 운영 절차(접수·소명·작성자 통지·조치
  표시)와 함께 검토한다**(§후속 #4). v1 권리침해 신고 접수는 문의 채널로 갈음.

## 테스트 방침 (`agent/rules/test-policy.md`, `tests/` 미러)

필수: `lib/public-code`(이동) · notices `schema/queries/transform`(고정 3개 정책·정렬) ·
posts `schema`(길이·trim·유형·깊이·MIME) · `pending-photo`(타계정·재사용·만료 거부 · 원자 소비(동시
제출) · 선언값 불일치·크기·매직바이트 위반 · 픽셀 파싱 WebP 3형식/JPEG SOF 상한/치수 불가 거부 ·
ETag 불일치 412 거부 · 조건부 복사·tx 실패 보상) ·
`mutations`(code P2002 구분 · 소유 404 · **댓글 불변식 9종** · soft delete 마스킹 · 숨김 잠금 ·
신고 스냅샷 동결 · 본인 신고 차단 · 중복 P2002 · 숨김+resolve 원자성 · 해제 · rate limit) ·
`queries`(숨김·삭제 제외 · 404 동일 · 트리 조립·정렬 tiebreaker · DTO 격리(계정·신고자·타인 사유
비노출) · 본인 사유 뱃지 · admin 큐 합산 · **서명 GET 발급 규칙(숨김·삭제 글 이미지 URL 미발급)**) ·
`transform` · `actions`(양 도메인) · notices 고정 상한(advisory lock 카운트 로직).
components 권장(collection 선례상 v1 생략 가능 — `CommentThread`·`ReportDialog` 우선).
마이그레이션 CHECK 제약·partial·컬럼 GRANT·**신고 RLS 정책**(app role + GUC로 일반 유저
`INSERT … RETURNING` 통과 확인 포함 — owner 연결은 RLS를 우회하므로 별도 검증 필수)은 검증 SQL 문서화 +
`dev:all` 수동 E2E(작성→사진→댓글→신고→숨김→사유 확인→이미지 신규 URL 미발급 확인 전체 시나리오).
**Plan 3 사진·수정 정책 매트릭스**(공개 signer 소속 IDOR·`lockedReason` 우선순위·update↔comment 동시성
양방향·`edited_at` 갱신 규칙·`deletePost` 사진 soft delete 등 — 3차 리뷰 #4의 11종 + P2-5 16종)는
**writing-plans에서 확정**한다.

## 후속 작업 (범위 밖 — 유보 근거 포함)

1. **거래 게시판** — 현재 MVP 범위에서 제외한다. 향후 도입이 필요해지면 당시의 비즈니스 요구사항·
   거래 안전 정책·운영 역량을 기준으로 **신규 설계**한다(도입 시 자유게시판의 거래 글을 그쪽으로 유도).
2. **`moderation_action` append-only 이력** — 승격 조건(외부 리뷰 합의): 운영자 다인화 · 공식 이의
   절차 도입 · 계정 제재 도입 · 숨김↔해제 반복 분쟁. 현재는 신고 행+`hidden_*` 컬럼이 상태·최종
   처리를 커버(1인 운영·이의절차 없음·제재 없음 — 유보 조건 4개 충족).
3. **서버측 이미지 전체 디코딩·재인코딩(EXIF 서버 제거 포함)** — v1은 헤더 파싱 검증+클라 재인코딩.
   **`hidden_by`·`resolved_by`·`created_by`류 TEXT → account UUID 컬럼 타입 전환** 마이그레이션
   (admin 실인증은 2026-07-21 도입 완료 — 현재는 account UUID가 TEXT로 기록되는 중).
   ~~**별도 업로드 게이트웨이 설계**~~ — 크기 강제가 실 R2에서 불가로 밝혀졌을 때의 재도입 경로였으나,
   2026-08-01 착수 게이트 통과로 **조건이 해소되어 폐기**한다.
4. **임시조치 운영 절차 정의**(권리침해 접수 창구·소명·작성자 통지·조치 표시) · 알림(댓글·숨김 통보
   푸시/메일) · 이의신청 공식 기능 · 자동 모더레이션(금칙어→ML, 조사 ⑥ 사다리) · 계정 단위
   제재(경고→정지 — 누적 데이터 전제).
5. 좋아요 · 인기글 · 팀·멤버 태그(topic과 별축, `team_id` 컬럼 1개) · 다중 게시판(`board_id`) ·
   운영자 정의형 말머리 승격 · admin 말머리 재분류.
6. **Plan 3 사진 후속(리뷰 반영)**: 대기 사진 만료 행 정리 잡(`created_at < now()-1일`) · 삭제 사진 R2 객체
   정리 잡(신고 미참조 + 보존기간 경과; orphan anti-join은 `LastModified`가 **안전 유예기간(등록 최대
   실행시간↑) 지난 것만** — CopyObject~INSERT 미참조 구간 오삭제 방지, P2-3) · 사진 편집(추가·삭제·재정렬 — 동시성·기존＋신규 합산 30MB 재검증·
   `post_photo.size_bytes` 도입) · HEIC 클라 디코더(거부율 큰 경우) · iOS Safari 자동변환 실기기 확증 ·
   개인정보/사진 삭제 요청 처리 · revision history(`post_revision` 전체 이력 공개).
7. 댓글 사진 · comment_count 캐시 · 검색 고도화(body·전문 검색) · IP rate limit ·
   만료 대기 사진 행·고아 최종 객체 정리 잡(임시 객체는 tmp lifecycle이 담당) · 공지 예약 게시.

## 확정 결정 (외부 리뷰 권장값 합의 — 최종 승인 완료)

| # | 항목 | 확정 제안값 | 근거 |
|---|---|---|---|
| 1 | 표시명·노출 | 게시판 "커뮤니티"(헤더는 이것만) · 공지 "공지사항"(홈 스트립+커뮤니티 내 링크) | 헤더 밀집 회피 — 리뷰 합의 |
| 2 | 사진 정책 | 10장 · 파일 5MB · 글 합계 30MB · JPEG/PNG/WebP | 당근 선례 + products `MAX_FILE_BYTES` — 비공개 버킷 서빙 전제 |
| 3 | 목록 페이지 크기 | 20 | products 선례 |
| 4 | rate limit | 글 5/시간·20/일 / 댓글 5/분·60/시간 / 신고 5/10분·20/일 / presign 30/시간·100/일 | 이중 윈도, 보안 경계 아닌 남용 완화 수단 — 리뷰 합의 |
| 5 | 입력 길이 | 공지 100·10,000 / 글 80·5,000 / 댓글 1,000 / detail 500 / 숨김 사유 500 / 메모 1,000 | trim 후 공백만 거부 — 리뷰 합의 |
| 6 | 공지 카테고리 | `general`·`event` (점검 등은 값 추가로) | TEXT enum 확장 용이 |
| 7 | 공지 고정 최대 | 3개 (초기값, 전 카테고리 합산 전역, advisory xact lock 직렬화) | 팬카페 필독 선례 — 리뷰 합의 |
| 8 | `author_code` | Base58 계열 8자 전체 표시 (0/O·1/I/l 제외) | 사람이 읽는 식별자 — 리뷰 합의 |
