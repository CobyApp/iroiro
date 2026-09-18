# 08. 객체 스토리지 패턴 — S3 호환 (AWS S3 / MinIO)

## 왜 알아야 하는가

이미지·동영상·파일 같은 **바이너리는 DB가 아니라 객체 스토리지**에 두는 게 정석입니다. DB에 BYTEA로 박으면 백업·쿼리·캐시 모두 무거워지고 비용도 빠르게 비싸집니다. 이 프로젝트는 사진을 **S3 호환 객체 스토리지**(운영·dev = AWS S3, 로컬 = MinIO)에 두고, DB(`product_photo.r2_key` 등)에는 *어디에 있는지*만 보관합니다.

> **이력.** 처음엔 Cloudflare R2를 썼고(egress 무료가 이유), 2026-09 AWS 이전과 함께 S3로 옮겼다. 코드·환경변수 이름(`lib/r2/`, `R2_*`, `r2_key` 컬럼)은 그때의 흔적이지만 **이름을 바꾸지 않는다** — S3 호환 API라 값만 바뀌었고, 이름 변경은 컬럼·env·배포 설정을 전부 건드리는 데 비해 얻는 게 없다. 이 문서에서 "R2"는 식별자를 가리킬 때만 쓴다.

## 핵심 패턴: "DB는 메타, 스토리지는 바이트"

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  PostgreSQL (RDS/로컬)   │         │  S3 호환 스토리지             │
│  ─────────────────────  │         │  (AWS S3 / MinIO)            │
│  product_photo          │         │  ──────────────────────────  │
│   ├─ id                 │         │  실제 JPEG/PNG/WebP 바이너리  │
│   ├─ product_id         │         │                              │
│   ├─ r2_key ─────────── │ ──────▶ │  products/original/<uuid>.jpg│
│   ├─ alt_text           │         │  notices/original/<uuid>.png │
│   └─ display_order      │         │   ...                        │
└─────────────────────────┘         └──────────────────────────────┘
       메타데이터                            실제 바이트
```

DB는 **포인터만** 보관: `r2_key TEXT` (예: `products/original/0190….jpg`).
실제 사진은 버킷에. 표시할 땐 `r2_key`를 공개 베이스 URL과 합치거나(공지·배너), 서버가 same-origin 경로로 프록시한다(고객용 상품 사진 — 아래 "서빙" 절).

## S3 호환 API = 공통어

S3의 REST API(SigV4 서명)는 사실상 객체 스토리지의 표준 인터페이스라, AWS S3·MinIO·R2·GCS(호환 모드) 모두 **같은 클라이언트 코드**로 붙는다. 이 프로젝트는 SDK 대신 경량 `aws4fetch`로 요청에 서명한다([`lib/r2/client.ts`](../../lib/r2/client.ts)).

| 환경 | 구현 | `R2_ENDPOINT` | `R2_REGION` | 버킷 |
|---|---|---|---|---|
| 로컬 | MinIO (`compose.yml`) | `http://localhost:9000` | `auto` | `iroiro-products-dev` · `iroiro-ugc-dev` (compose의 `createbuckets`가 생성) |
| dev / prd | AWS S3 (서울) | S3 리전 엔드포인트 | `ap-northeast-2` | `iroiro-kr-products-<env>` · `iroiro-kr-ugc-<env>` (`infra/aws/setup.sh core`가 생성) |

**`R2_REGION`은 장식이 아니다.** SigV4 서명 스코프(`<date>/<region>/s3/aws4_request`)에 리전이 들어가서, 값이 틀리면 S3가 `403 SignatureDoesNotMatch`를 돌려준다. MinIO·R2는 `auto`를 받아주지만 AWS S3는 버킷의 실제 리전이어야 한다. 그래서 로컬 기본값은 `auto`, 운영은 `ap-northeast-2`이다.

## 두 버킷 — 공개와 비공개를 섞지 않는다

| 버킷 | 공개성 | 담는 것 | 읽기 경로 |
|---|---|---|---|
| `iroiro-kr-products-<env>` (`R2_BUCKET`) | **공개 읽기**(버킷 정책 `s3:GetObject` to `*`) | 상품 원본·공지 첨부·배너·아바타 | 공지·배너·관리자 미리보기는 `R2_PUBLIC_BASE/<key>`. **고객용 상품 사진은 공개 URL을 노출하지 않고** `/media/...` 프록시로만 |
| `iroiro-kr-ugc-<env>` (`R2_UGC_BUCKET`) | **비공개**(Public Access Block 전부 ON) | 게시판 사진(UGC) | **서명 GET(15분)만**. 공개 도메인 연결 금지. `posts/tmp/` 접두사는 lifecycle로 1일 뒤 자동 삭제 |

자격증명(`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`)은 두 버킷을 공유한다 — 운영 IAM 사용자 정책이 두 버킷을 모두 포함해야 한다(`setup.sh`가 그렇게 만든다). 시크릿은 SSM Parameter Store `/iroiro/<env>/R2_*`에 두고 ECS 태스크가 기동 시 주입한다.

## 업로드 흐름 — 서버 경유(relay)

```
1) 관리자가 상품 등록 폼 제출 (파일 포함, Server Action)
2) 서버: r2_key 생성 — products/original/{uuidv7}.{ext}  (lib/r2/presign.ts buildR2Key)
3) 서버: 자기 자신에게 presigned PUT URL을 서명해 스토리지로 PUT (lib/r2/relay.ts relayUploadToR2)
4) 서버: 같은 트랜잭션에서 product / product_photo INSERT (r2_key 저장)
5) 고객이 상품 상세를 열면: r2_key → /media/product-photos/{id}/{signature} → 서버가 원본을 읽어 가공 후 응답
```

핵심: **브라우저는 스토리지에 직접 닿지 않는다.** 서버 액션이 파일을 받아 스토리지로 릴레이한다(상품·배너·공지·중고 매물). 트레이드오프는 명확하다:

| | 브라우저 직접 PUT (presigned) | 서버 경유(relay) — 이 프로젝트 |
|---|---|---|
| 서버 대역폭·메모리 | 안 씀 | 파일이 서버를 한 번 지나감 |
| 버킷 CORS 설정 | **필수**(preflight) — 환경마다 관리, 로컬 MinIO는 관용적·S3는 엄격해서 "로컬 OK, 운영 403" 함정 | **불필요** |
| 파일 검증 | 업로드 후 사후 검증 | 업로드 전 서버에서 타입·크기 검증 가능 |
| 바디 한도 | 없음 | `next.config`의 `serverActions.bodySizeLimit`을 올려둠 |

이 규모(관리자 소수·사진 수 MB)에선 서버 경유가 단순하고 안전하다. 단, 코드에는 **presigned PUT을 브라우저가 직접 호출하는 경로가 아직 남아 있다** — 게시판 사진(`modules/posts/components/PostPhotoUploader.tsx` → `presignUgcPut`)과 프로필 아바타(`app/(shop)/mypage/edit/_components/AvatarUploadField.tsx` → `presignAvatar`). 이 경로를 유지한다면 해당 버킷에 CORS 규칙이 있어야 하고, 릴레이로 통일하면 CORS 관리가 완전히 사라진다.

## 서빙 — 고객 이미지는 same-origin 프록시

고객 화면의 상품 사진은 공개 버킷 URL 대신 **같은 도메인의 `/media/...` 경로**를 쓴다([`docs/product-image-protection.md`](../product-image-protection.md)).

- `/media/product-photos/{photoId}/{signature}`, `/media/product-thumbnails/{productId}/{signature}` — 서명은 서버 시크릿에서 도메인 분리한 **HMAC**. ID·서명이 틀리면 DB·스토리지를 조회하기 전에 404.
- 서버가 원본을 읽어 `sharp`로 리사이즈·워터마크·포맷 변환 후 응답. 원본 주소는 고객에게 노출되지 않는다.
- 게시판 사진(UGC)은 `/media/post-photos/{photoId}/{signature}`에서 비공개 버킷을 서명 GET으로 읽어 썸네일을 만든다. `Cache-Control: private, no-store`.

즉 이미지 가공·캐시 제어는 **앱 서버(Next.js 컨테이너)의 일**이다. Cloudflare Images·Cache Rules 같은 엣지 기능에 의존하지 않는다.

## r2_key 설계

`r2_key`는 버킷 안에서 unique한 식별자. **PK와 독립적**이라 상품 생성 *전*에 만들 수 있다. 설계 근거는 [`docs/image-path-strategy.md`](../image-path-strategy.md).

```
products/original/{uuidv7}.{ext}    상품 원본 (변형은 products/variants/{size}/… 예약)
notices/original/{uuidv7}.{ext}     공지 첨부
avatars/{uuidv7}.{ext}              프로필 사진
posts/tmp/{uuidv7}.{ext}            게시판 대기 사진 → 글 등록 시 posts/{uuidv7}.{ext} 로 복사
```

- **uuidv7**: 시간순 정렬 + 추측 불가. 재사용·덮어쓰기가 없어 참조가 항상 유효.
- **종류별 최상위 접두사**: lifecycle 규칙(`posts/tmp/` 1일 만료)·IAM·정리 스크립트를 접두사 단위로 걸 수 있다.
- **샤딩 없음**: 이 규모에선 불필요. 필요해지면 신규 업로드부터.

## 보안 / 권한

객체 스토리지엔 행 단위 권한이 없으므로 다음 중에서 고른다:

| 패턴 | 설명 | 이 프로젝트 |
|---|---|---|
| **공개 버킷 + 추측 불가 키** | 누구나 볼 수 있지만 키(uuidv7)를 모르면 못 찾음 | 공지·배너·아바타 |
| **비공개 버킷 + 서명 GET** | 매 요청 서명 URL 발급, 만료로 통제 | 게시판 사진(UGC) |
| **비공개/공개 + 서버 프록시(HMAC)** | 도메인·서명·가공을 서버가 통제, 원본 주소 비노출 | 고객용 상품 사진 |

## 이 프로젝트의 결정

`product_photo` 테이블이 객체 키를 보관한다([`db/schema.sql`](../../db/schema.sql)):

```sql
CREATE TABLE product_photo (
    id            BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    product_id    BIGINT      NOT NULL,
    r2_key        TEXT        NOT NULL,     -- ← 핵심: 객체 스토리지 키
    alt_text      TEXT,
    display_order INT         NOT NULL    DEFAULT 0,
    is_thumbnail  BOOLEAN     NOT NULL    DEFAULT false,
    -- audit 컬럼 ...
);

COMMENT ON COLUMN product_photo.r2_key IS 'Cloudflare R2 객체 키';  -- 컬럼명·코멘트는 이력 그대로. 값은 S3 키
```

키 포맷은 DDL에서 강제하지 않고 앱(`buildR2Key` 등)이 만든다. 공개 URL 조립도 앱 레이어에서:

```ts
// lib/r2/presign.ts — 공지·배너·관리자 미리보기용. 고객용 상품 사진엔 쓰지 않는다.
export function getPublicUrl(key: string): string {
  return `${r2PublicBase}/${key}`;   // R2_PUBLIC_BASE
}
```

## 알아둘 함정

- **삭제 동기화** — `product_photo` row만 지우면 객체는 남는다. 트랜잭션 후 DELETE 호출까지 묶거나 정리 잡으로 orphan을 걷어야 한다. **단 아래 "주문 스냅샷 참조" 예외를 반드시 적용.**
- **⚠️ 주문 스냅샷 참조 = 삭제 제외** — `order_item.product_thumbnail_key`가 주문 시점 썸네일 `r2_key`를 **스냅샷**한다(주문 내역에 *산 그 사진*을 보여주기 위함). 주문은 영구 이력이므로 **객체 삭제·orphan GC는 `order_item`이 참조하는 `r2_key`를 반드시 제외**해야 한다 — 아니면 과거 주문 썸네일이 깨진다. (현재는 삭제 로직 자체가 없어 우연히 안전하나, 삭제를 붙일 때 이 예외를 함께 구현할 것. 키가 `uuidv7`이라 재사용·덮어쓰기가 없어 참조는 항상 유효.)
- **리전 서명 불일치** — `R2_REGION`이 버킷 리전과 다르면 S3는 403. 로컬(`auto`)에서 되던 게 운영에서 막히면 이걸 먼저 본다.
- **MinIO ≠ S3** — MinIO는 CORS·헤더 검증이 관용적이라 로컬에선 통과한 요청이 S3에서 거부될 수 있다. 크기·`Content-Type` 계약은 서버에서 강제한다.
- **공개 버킷의 원본 직접 접근** — `products/original/*`는 공개 읽기 버킷에 있지만 고객 UI는 절대 그 URL을 내보내지 않는다. 키를 아는 사람만 접근 가능(추측 불가)하며, 필요하면 버킷 정책·WAF로 접두사 차단을 추가한다.
- **키 변경 불가 가정** — 일단 박은 `r2_key`는 *사실상 immutable*. 이름을 바꾸려면 복사 + 키 업데이트 + 원본 삭제. 그래서 처음부터 안정적인 식별자(uuidv7)로.

## 참고

- [AWS S3 — REST API / SigV4 서명](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)
- [MinIO — S3 호환 로컬 스토리지](https://min.io/docs/minio/container/index.html)
- [aws4fetch](https://github.com/mhart/aws4fetch) — 이 프로젝트의 서명 클라이언트
- [`docs/image-path-strategy.md`](../image-path-strategy.md) — 객체 키 레이아웃·식별자·샤딩 결정
- [`docs/product-image-protection.md`](../product-image-protection.md) — `/media/...` HMAC 서명 프록시
- [`docs/deployment.md`](../deployment.md) — 환경별 버킷·SSM·ECS 구성
