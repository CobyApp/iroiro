# 인증과 데이터 레이어

> 자체 세션 인증(카카오·네이버 OAuth) · Prisma(`app` 롤) · S3 호환 객체 스토리지(`lib/r2/`)의 **운영 규칙**.
> 스키마의 모양은 [data-modeling.md](./data-modeling.md), GRANT-대신-RLS 결정의 근거는 [db-authorization-review.md](./db-authorization-review.md), 배포·인프라는 [../deployment.md](../deployment.md).

> **절대 URL 리다이렉트 규칙.** Route Handler에서 `NextResponse.redirect`에 넘길 절대 URL은 `lib/public-origin.ts`의 `publicUrl(request, path)`로 만든다. ALB 뒤의 컨테이너는 `request.url`에 내부 호스트(`ip-172-31-x.compute.internal:3000`)가 들어오므로 `new URL(path, request.url)`을 쓰면 사용자가 내부 주소로 튕긴다. 우선순위: `APP_URL` → `X-Forwarded-Host/Proto` → 요청 origin.

> **저장 시 이미지 규격(서버, 2026-09-18).** 업로드 서버 액션이 저장 직전에 sharp로 재인코딩한다 — oshikore-card `core/image_utils.py`의 1:1 포팅.
> 카드 사진(`uploadCardPhoto`)은 `modules/cards/lib/normalize-card-server.ts`: EXIF 보정 → 63:88 중앙 크롭 → 720×1006 → JPEG q82 progressive.
> 상품(`uploadProductPhotoFile`, 긴 변 2000)·중고 매물(`uploadUsedPhotoFile`, 긴 변 1600) 사진은 `lib/image/compress-image.ts`: 크롭 없이 비율 유지·JPEG q82.
> 세 액션은 저장된 객체의 공개 URL(`previewUrl`)을 돌려주고, 업로더 컴포넌트는 그 URL을 미리보기로 쓴다 — 사용자가 보는 미리보기 = 실제 저장 결과물.

## 인증 — 자체 세션 + 카카오·네이버 OAuth

외부 인증 SaaS·라이브러리(NextAuth, Better-auth 등)를 쓰지 않는다. OAuth 왕복과 세션 관리를 `modules/auth/`가 직접 구현한다(룰 4).

### 구성 파일

| 파일 | 역할 |
|---|---|
| `app/api/auth/[provider]/route.ts` | OAuth 시작. `state`(+카카오 PKCE `code_verifier`)를 생성해 단기 httpOnly 쿠키로 심고 제공자 authorize로 302 |
| `app/api/auth/[provider]/callback/route.ts` | 콜백. `state` 검증 → code 교환 → 프로필 → 기존 신원이면 세션 발급, 신규면 `pending_account` 생성 후 `/signup`으로 |
| `modules/auth/lib/oauth/` | 제공자 클라이언트(`kakao.ts`·`naver.ts`), `state.ts`(CSRF state·PKCE 쿠키), `types.ts`(`NormalizedProfile`) |
| `modules/auth/lib/session.ts` | `createSession` / `validateSessionToken` / `invalidateSession` — `account_session` 테이블 |
| `modules/auth/lib/cookies.ts` | 세션 쿠키 `session` 읽기·옵션·삭제 (httpOnly·Secure(prod)·SameSite=Lax·30일) |
| `modules/auth/lib/pending-account.ts` | 가입 대기(deferred creation) 토큰·쿠키 `pending_account`(10분) |
| `modules/auth/lib/account.ts` | `findAccountByIdentity`, `createAccountFromSignup`(account + account_identity 원자 생성), 소프트 삭제 |
| `modules/auth/dal.ts` | **DAL** — `getSession()` / `getCurrentAccount()`. React `cache()`로 요청당 DB 조회 1회 |
| `modules/auth/actions.ts` | `logout`, `completeSignupAction`(닉네임 입력 → account 최초 INSERT + 세션 발급) 등 |

### 세션 모델 (DB 세션, 레슨 13)

- 쿠키에는 **신원 정보가 없는 256비트 무작위 토큰**만 들어간다. 신원은 `account_session` 행이 보유한다.
- DB에는 토큰의 **SHA-256 해시**만 저장한다(`token_hash`가 PK) — DB가 유출돼도 세션 자격을 복원할 수 없다.
- 만료는 **30일 절대 만료**(슬라이딩 연장 없음). 읽기 시점에 만료 행은 거부·삭제한다.
- 폐기 = 행 DELETE(즉시 무효). 탈퇴(소프트 삭제) 계정의 세션은 검증에서 거부된다.
- 가입 대기(`pending_account`)도 같은 패턴(무작위 토큰 → 해시 저장, 10분 TTL). OAuth 검증 직후 account를 만들지 않고, 닉네임 입력을 마친 `completeSignupAction`에서 처음 INSERT한다.

### 요청 1회의 흐름

```
1. 브라우저 요청 (쿠키 session=<무작위 토큰>)
   ↓
2. middleware.ts — x-pathname 요청 헤더만 세팅 (세션을 건드리지 않는다)
   ↓
3. 매칭 layout.tsx
   ├── (shop)/layout   — 인증 무관. 헤더 위젯(AccountNav 등)이 각자 getCurrentAccount()로 판단
   ├── (admin)/layout  — getCurrentAccount() → 없으면 /login, 권한 없으면 / (룰 3)
   └── (auth)/layout   — 레이아웃만 (중앙 정렬)
   ↓
4. page.tsx / Server Action
   └── 회원 전용이면 getCurrentAccount() 직접 호출 → 없으면 redirect(loginRequiredHref(...))
```

`getCurrentAccount()`는 `"server-only"`라 RSC·Server Action·Route Handler에서만 부른다. 같은 요청 안에서 여러 번 불러도 `cache()`로 DB 조회는 1회다.

### ✅ / ❌

| ✅ | ❌ |
|---|---|
| `const account = await getCurrentAccount(); if (!account) redirect(...)` | 쿠키 값을 직접 파싱해 신원으로 쓰기 |
| Server Action 진입부에서 `requireAdmin()` 재검증 | layout 가드만 믿고 액션에서 권한 생략 |
| 관리자 판정은 `isAdmin(account)` (`account.is_admin`) | JWT claim·쿠키·클라이언트 입력으로 권한 판정 |
| 세션 토큰은 `sessionCookieOptions()`로만 세팅 | `localStorage`에 토큰 저장 |

## 데이터 — Prisma + 비특권 `app` 롤

### 접속

- `lib/db.ts`가 Prisma 7 클라이언트를 `@prisma/adapter-pg`로 만들어 `db` 싱글턴으로 export한다. 모든 DB 접근은 `import { db } from "@/lib/db"`.
- `DATABASE_URL`은 **반드시 비특권 `app` 롤**로 접속한다. 소유자(로컬 `postgres`, RDS `iroiro_admin`)로 붙으면 GRANT가 무효라 DB 방어선이 사라진다.
- 운영은 `sslmode=verify-full&sslrootcert=/app/rds-ca.pem`(CA 번들은 Dockerfile이 이미지에 포함).

### DB 인가 = GRANT 매트릭스 (RLS 미사용)

> 결정 2026-08-01, 근거는 [db-authorization-review.md](./db-authorization-review.md). 이력: 초기에는 RLS를 backstop으로 설계했으나 실효가 없어 제거했다.

| 계층 | 담당 |
|---|---|
| **인가 판정**(누가 무엇을 할 수 있나) | 앱 DAL — `getCurrentAccount` / `requireAdmin` / `requireBoardManager` + 쿼리의 `WHERE account_id = 세션` |
| **DB 방어선**(앱 버그·자격 유출 시 최후 제한) | `db/schema.sql`의 GRANT 매트릭스 — `app` 롤에 테이블별 **명시 권한만**(예: `post`·`order_item`은 DELETE 미부여 → soft delete·불변 이력 강제, `post_report`는 컬럼 제한 UPDATE) |

- 새 테이블은 **반드시 `REVOKE ALL … FROM app; GRANT <필요 권한> ON … TO app;`을 같은 도메인 섹션에 함께** 적는다. 빠지면 `permission denied`.
- 소유자만 할 수 있는 정리(테스트 픽스처 hard delete 등)는 `DATABASE_URL_PRIVILEGED`(`tests/integration/_privileged-db.ts`)로 분리한다. 앱 코드는 절대 소유자로 돌리지 않는다.

### ✅ 일반 쿼리
```ts
// modules/orders/lib/queries.ts
import { db } from "@/lib/db";

export async function listMyOrders(accountId: string) {
  return db.order.findMany({ where: { accountId }, orderBy: { createdAt: "desc" } });
}
```

### ❌
```ts
// 소유권 필터 없는 조회 — GRANT는 행을 구분하지 못한다. 소유권은 앱 DAL 책임.
db.order.findUnique({ where: { orderNo } });           // accountId 확인 없음
// 소유자 접속 — GRANT 무효
DATABASE_URL=postgresql://postgres:...                 // app 롤이어야 한다
```

### 스키마 변경 절차

```
db/schema.sql 편집 (테이블 블록 + GRANT)
  → npm run db:reset                 # 로컬 DB 초기화 후 재적용 (+ app 롤 LOGIN)
  → npm run db:pull && npm run db:generate   # prisma/schema.prisma 재생성 (파생물)
  → camelCase @map / @@index map 이름 확인, npm run validate
```

- 단일 진실은 **`db/schema.sql` 한 파일**이다. `prisma/schema.prisma`는 `db:pull` 파생물이라 직접 편집한 뒤 SQL을 안 고치면 다음 pull에서 사라진다.
- dev/prd RDS에는 **변경분 SQL을 따로 작성해 소유자(`DATABASE_URL_OWNER`)로 수동 적용**한다. 데이터가 있는 DB에 `infra/aws/db-apply.sh --reset`을 쓰지 않는다. 절차는 [../deployment.md §DB 스키마 변경 운영](../deployment.md#db-스키마-변경-운영).

## 스토리지 — S3 호환 객체 스토리지 (`lib/r2/`)

> 모듈·환경변수 이름의 `r2`/`R2_*`는 초기 Cloudflare R2 시절의 이름을 **그대로 유지**한 것이다(이름 변경 제안 금지). 현재 운영·dev는 **AWS S3**(`iroiro-kr-products-<env>` 공개 읽기 / `iroiro-kr-ugc-<env>` 비공개), 로컬은 `compose.yml`의 **MinIO**다.

### 디렉터리
```
lib/r2/
├── client.ts     aws4fetch AwsClient (service: "s3", region: env.R2_REGION) + 버킷·엔드포인트 상수
├── presign.ts    상품 버킷 PUT presign, getPublicUrl, buildR2Key / buildNoticeR2Key (uuidv7 키)
├── relay.ts      relayUploadToR2 — 서버가 presigned PUT을 대신 수행 (브라우저 CORS 회피)
├── get.ts        fetchR2Object / fetchUgcR2Object — 서명 GET으로 원본 스트림 읽기 (/media 라우트용)
└── ugc.ts        UGC 비공개 버킷: presignUgcPut(크기·If-None-Match 고정 서명), getSignedUgcGetUrl,
                  HEAD / range GET(If-Match) / 조건부 복사 / 멱등 삭제 + timeout·재시도
```

### 업로드 경로 두 가지

| 경로 | 사용처 | 흐름 |
|---|---|---|
| **서버 중계(relay)** — 기본 | 상품·중고·공지·배너 사진 (관리자/판매자 폼) | 폼 → Server Action(`modules/<도메인>/actions.ts`)이 파일을 받아 `relayUploadToR2(file, key)` → DB 메타 저장. 브라우저는 버킷을 직접 만나지 않으므로 **버킷 CORS 불필요**. 서버 액션 바디 한도는 `next.config.ts`의 `serverActions.bodySizeLimit`(10mb) |
| **presigned PUT** | 게시글 사진(UGC), 아바타 | Server Action이 키·서명 URL 발급(`presignUgcPut` / `getSignedUploadUrl`) → 브라우저가 PUT → 완료 액션에서 서버가 HEAD·헤더 바이트로 검증 후 `pending → 최종 키`로 조건부 복사. UGC는 Content-Length·`If-None-Match: *`까지 서명에 고정해 선언과 다른 크기·덮어쓰기를 거부한다 |

### 서빙

- **상품 사진·UGC는 버킷 URL을 고객 화면에 직접 쓰지 않는다.** `app/media/product-photos/[photoId]/[variant]/[signature]`, `product-thumbnails/…`, `post-photos/[photoId]/[signature]` 같은 **same-origin HMAC 서명 라우트**가 원본을 서명 GET으로 읽어 `sharp`로 축소·워터마크·재인코딩해 응답한다. URL 생성(`modules/products/lib/customer-media.ts`)과 이미지 처리(`customer-media-response.ts`, sharp import)는 파일을 분리한다 — 페이지 번들에 sharp가 딸려가면 안 된다. 상세: [../product-image-protection.md](../product-image-protection.md).
- UGC 비공개 버킷은 **서명 GET(15분)만**으로 서빙한다. 공개 도메인 연결 금지.
- 보호가 필요 없는 공개 자산(공지 첨부 사진, 프로필 아바타)은 공개 버킷의 `getPublicUrl(key)`(`R2_PUBLIC_BASE`)로 바로 렌더한다. 관리자 원본 다운로드는 S3 서명 경로를 쓴다.

### ❌ 절대 하지 말 것
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`를 클라이언트 번들·`NEXT_PUBLIC_*`에 노출
- 고객 화면에서 **상품 사진**의 `R2_PUBLIC_BASE` 원본 URL 직접 렌더(워터마크·해상도 통제 우회)
- 브라우저 직접 PUT을 새로 추가하면서 버킷 CORS를 열어두기 — 기본은 relay

### 환경변수

`lib/env.ts`(zod)에서 검증 후 `env`로 export한다. `process.env.X` 직접 참조 금지 — 예외는 Prisma 어댑터가 읽는 `DATABASE_URL`과 크론 라우트의 `CRON_SECRET`처럼 env.ts 밖에 둔 것으로 한정한다.

| 그룹 | 변수 |
|---|---|
| 스토리지 | `R2_ENDPOINT`, `R2_REGION`(로컬·MinIO `auto`, AWS `ap-northeast-2`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`, `R2_UGC_BUCKET` |
| DB | `DATABASE_URL`(`app` 롤), 테스트 정리용 `DATABASE_URL_PRIVILEGED` |
| OAuth | `APP_URL`, `KAKAO_REST_API_KEY`(필수), `KAKAO_CLIENT_SECRET`, `KAKAO_SCOPE`, `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(필수) |
| 기타 | `PAYMENT_PROVIDER=mock`, VAPID 3종, `CUTIE_CARD_API_*`, `FX_API_BASE`, `CRON_SECRET` |

전체 목록·필수 구분·값 출처는 [../environment-variables.md](../environment-variables.md). 운영 값은 SSM Parameter Store `/iroiro/<env>/*`에 두고 ECS 태스크가 기동 시 주입한다([../deployment.md](../deployment.md)).
