# 환경변수 레퍼런스

이 프로젝트가 사용하는 환경변수 전체 목록과 설명. 검증의 단일 진실은 [lib/env.ts](../lib/env.ts)이며, 로컬 템플릿은 [.env.local.example](../.env.local.example)다(`npm install` 시 `.env.local`로 자동 복사).

## 범례

| 구분 | 의미 |
|---|---|
| ✅ **필수** | 없으면 `lib/env.ts` 검증 실패 → **빌드/부팅이 즉시 실패**(fail-fast) |
| ⚙️ **운영 필수** | `env.ts` 기본값은 로컬 개발용. **운영에선 실제 값으로 반드시 교체**(빌드는 통과하나 동작이 깨짐) |
| ◯ **선택/조건부** | 미설정 허용. 기능·상황에 따라 설정 |
| 🔒 | **서버 전용 secret** — `NEXT_PUBLIC_` 접두어 금지, 클라이언트 번들·로그에 노출 금지 |

> `NEXT_PUBLIC_*` 접두어 변수는 빌드 시 **브라우저로 전송**된다(공개 값만 둘 것).
> `.env.local.example`을 복사하면 `KEY=`가 빈 문자열로 로드되는데, `env.ts`가 선택 필드의 `""`를 미설정으로 정규화하므로 비워 둬도 된다.

## 운영 값은 어디에 있나 (dev / prd)

| 종류 | 위치 | 누가 넣나 |
|---|---|---|
| 🔒 시크릿 | SSM Parameter Store **`/iroiro/<env>/<NAME>`**(SecureString, ap-northeast-2). ECS 태스크 실행 롤이 기동 시 주입 | `infra/aws/setup.sh core`가 placeholder(`CHANGE_ME`) 또는 자동 생성값을 만들고, 사람이 `aws ssm put-parameter --overwrite`로 채운다. `setup.sh db`가 `DATABASE_URL`을, `core`가 S3 키·`CRON_SECRET`을 자동 생성 |
| 일반 값 | ECS 태스크 정의의 `environment`(`APP_URL`, `R2_ENDPOINT`, `R2_REGION`, `R2_BUCKET`, `R2_PUBLIC_BASE`, `R2_UGC_BUCKET`, `CATALOG_BUCKET`, `CATALOG_PUBLIC_BASE`, `PAYMENT_PROVIDER`, `NEXT_TELEMETRY_DISABLED`) | `setup.sh ecs`가 환경별로 고정(`container_json`) |
| 빌드 타임 공개 값 | GitHub Environment 변수(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) | `setup.sh github` / 사람 |

값을 바꾼 뒤에는 `aws ecs update-service --cluster iroiro --service iroiro-<env> --force-new-deployment`로 재기동해야 반영된다. 전체 절차는 [deployment.md](./deployment.md).

CI 빌드(`deploy.yml`)는 필수 키에 `build-placeholder`를 넣어 `env.ts` 검증을 통과시키고, 실제 값은 런타임에 ECS가 주입한다.

## 데이터베이스 (Postgres)

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `DATABASE_URL` 🔒 | ⚙️ 운영 필수 | 커머스 DB — Prisma(`lib/db.ts`, adapter-pg) 연결 문자열. **비특권 `app` 롤로 접속한다** — 소유자 `postgres`로 붙으면 GRANT가 무효라 soft delete 강제 등 DB 방어선이 작동하지 않는다([db-authorization-review](./architecture/db-authorization-review.md)). 로컬: `npm run db:reset`이 `db/schema.sql` 적용 + `ALTER ROLE app WITH LOGIN`을 실행하므로 `postgresql://app:app@127.0.0.1:5432/iroiro` 그대로. `env.ts` 검증 밖이지만 없으면 `prisma generate`부터 실패. dev/prd: RDS `iroiro-<env>`, `setup.sh db`가 생성해 SSM에 넣는다(`sslmode=verify-full&sslrootcert=/app/rds-ca.pem` 포함). 비밀번호 특수문자 주의 → [lessons/10](./lessons/10-database-url-password.md) |
| `DATABASE_URL_OWNER` 🔒 | ◯ 마이그레이션 태스크 전용 | 소유자 롤 연결 문자열. 앱 컨테이너에는 주입하지 않고, 배포 시 `iroiro-migrate-<env>` 원오프 태스크(`scripts/db-migrate.mjs`)만 받는다. SSM `/iroiro/<env>/…` |

## 스토리지 (AWS S3 / 로컬 MinIO)

변수 이름의 `R2_`는 Cloudflare R2를 쓰던 시기의 것이다. 값만 S3(운영)·MinIO(로컬)를 가리키며 이름은 바꾸지 않는다. 클라이언트는 `lib/r2/client.ts`(`aws4fetch`).

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `R2_ENDPOINT` | ⚙️ 운영 필수 | S3 호환 엔드포인트. 기본값 `http://localhost:9000`(로컬 MinIO). 운영: `https://s3.ap-northeast-2.amazonaws.com` |
| `R2_REGION` | ⚙️ 운영 필수 | SigV4 서명 리전. 로컬 MinIO는 `auto`(기본값), AWS S3는 버킷 리전 `ap-northeast-2` |
| `R2_ACCESS_KEY_ID` 🔒 | ⚙️ 운영 필수 | 액세스 키 ID. 기본 `minioadmin`(로컬). 운영: `setup.sh core`가 만든 앱 전용 IAM 사용자 키(상품·UGC **두 버킷** 권한) → SSM |
| `R2_SECRET_ACCESS_KEY` 🔒 | ⚙️ 운영 필수 | 시크릿 액세스 키. 기본 `minioadmin`(로컬). `/media/*` 고객 이미지 서명(HMAC)의 원천이기도 하다. **서버 전용** |
| `R2_BUCKET` | ⚙️ 운영 필수 | 공개 버킷 이름(상품 `products/`·공지 `notices/`·배너 `banners/`·아바타 `avatars/`). 기본 `iroiro-products-dev`. 운영: `iroiro-kr-products-<env>`(버킷 정책 public read) |
| `R2_PUBLIC_BASE` | ⚙️ 운영 필수 | 공지·배너·관리 미리보기용 공개 객체 URL 베이스. 로컬 `http://localhost:9000/iroiro-products-dev`, 운영 `https://iroiro-kr-products-<env>.s3.ap-northeast-2.amazonaws.com`. 고객용 상품 사진은 이 주소를 노출하지 않고 `/media/product-*`에서 워터마크 처리한다([product-image-protection](./product-image-protection.md)) |
| `R2_UGC_BUCKET` | ⚙️ 운영 필수 | UGC(게시판) 사진 전용 **비공개** 버킷. 기본 `iroiro-ugc-dev`. 운영 `iroiro-kr-ugc-<env>`(public access block, `posts/tmp/` 1일 만료 lifecycle). 서빙은 서명 GET만. 자격증명은 위 `R2_*` 공유 |
| `CATALOG_BUCKET` | ⚙️ 운영 필수 | 카탈로그(토레카 앞면) 버킷 — **환경별** `iroiro-kr-catalog-<env>`(운영 `iroiro-kr-catalog-dev` / `iroiro-kr-catalog-prd`, 로컬 MinIO `iroiro-catalog-dev`). 카드 한 장 = `cards/wm/<uuid>.jpg`(워터마크·공개) + `cards/clean/<uuid>.jpg`(원본·비공개, `/media/catalog-clean` 관리자 라우트로만). 버킷 정책은 `cards/wm/*`만 public read. 자격증명은 `R2_*` 공유(`setup.sh catalog`) |
| `CATALOG_PUBLIC_BASE` | ⚙️ 운영 필수 | 카탈로그 버킷 공개 URL 베이스 — 고객 화면의 카드 이미지(`cardFrontUrl`). 운영 `https://iroiro-kr-catalog-<env>.s3.ap-northeast-2.amazonaws.com` |

## OAuth 소셜 로그인 (카카오)

발급·콘솔 등록·환경별 콜백 URL: [oauth-setup.md](./oauth-setup.md) (네이버 로그인은 2026-09 제거 — 카카오 단일)

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `KAKAO_REST_API_KEY` 🔒 | ✅ 필수 | 카카오 REST API 키. 카카오 개발자 › 앱 › 앱 키. SSM. **유일한 필수 env** — 비면 부팅이 ZodError로 실패 |
| `APP_URL` | ◯ 선택(운영은 고정) | OAuth·결제 콜백 베이스. `redirect_uri = {APP_URL}/api/auth/kakao/callback`(시작·콜백 양쪽, `buildCallbackUrl`이 끝 슬래시 제거). 미설정 시 요청 origin으로 폴백. 운영은 `setup.sh ecs`가 `https://iroiro.club` / `https://dev.iroiro.club`로 고정 — 콘솔 등록 Redirect URI와 일치해야 함 |
| `KAKAO_CLIENT_SECRET` 🔒 | ◯ 조건부 | 카카오 콘솔에서 Client Secret **'사용' 상태**면 필수(비우면 `oauth_failed`). 안 켰으면 불필요. SSM |
| `KAKAO_SCOPE` | ◯ 선택 | 동의항목(scope). 기본 `profile_nickname`. 이메일까지 받으려면 비즈 앱 + `profile_nickname,account_email`. 운영 태스크 정의에는 없음(기본값) |

## 관리자 접근 통제

`/admin` 접근 통제는 각 공간 layout의 계정 인가가 담당한다 — 전권 site admin(`account.is_admin`) + 공간별 부분 권한(`account.admin_roles` 배열: `delivery`·`used`·`community`·`catalog`, `hasAdminSpace` 가드). 전용 환경변수는 없다([admin-architecture](./admin-architecture.md)).

## 스케줄러

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `CRON_SECRET` 🔒 | ◯ 선택(운영 권장) | 크론 라우트 3종 보호 토큰 — `GET /api/cron/close-auctions`(경매 마감 스윕)·`GET /api/cron/auto-confirm-used`(중고 자동 수령확정)·`GET /api/cron/auto-confirm-orders`(스토어 자동 수령확정). 설정돼 있으면 `Authorization: Bearer ${CRON_SECRET}` 일치 필수, 없으면 무인증으로 열린다. `env.ts` 검증 밖(`process.env` 직접 참조). 운영: `setup.sh core`가 자동 생성해 SSM에 넣고, `setup.sh cron`이 EventBridge API destination에 같은 값을 헤더로 심는다. 자동확정 크론은 없어도 페이지 진입 시 lazy 스윕으로 동작한다. 로컬은 보통 미설정 |

## 웹 푸시 (VAPID)

`npx web-push generate-vapid-keys`로 환경별로 따로 생성. 셋 중 하나라도 비어 있으면 푸시 발송만 조용히 비활성(인앱 알림은 동작).

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ◯ 선택 | VAPID 공개키. **브라우저로 전송**(구독 등록용). 운영은 빌드 타임에 필요해 GitHub Environment 변수로 주입(`deploy.yml`) |
| `VAPID_PRIVATE_KEY` 🔒 | ◯ 선택 | VAPID 비밀키. SSM |
| `VAPID_SUBJECT` 🔒 | ◯ 선택 | `mailto:` 또는 URL 형태의 연락처. SSM |

## 외부 API

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `FX_API_BASE` | ◯ 선택 | 매입일 환율(JPY→KRW) 조회 API. 기본 [Frankfurter](https://frankfurter.dev)(ECB 기준, 키 불필요, 과거 영업일 지원). 정식 호스트는 `https://api.frankfurter.dev/v1` — `.app` 도메인은 301 리다이렉트 |
| `KAKAO_PAY_CID` | ◯ 선택 | 카카오페이 단건결제 CID. 기본값은 카카오 공식 테스트 CID `TC0ONETIME`. 실 계약 CID 는 환경별로 지정 |
| `KAKAO_PAY_SECRET_KEY` 🔒 | ◯ 조건부 | 카카오페이 Secret key. `PAYMENT_PROVIDER=kakaopay` 일 때 필요 — 없으면 mock(즉시 결제)으로 폴백한다(키 없이도 CI·로컬 안전). 실 키는 SSM. 운영(dev·prd) 활성화됨 |

배송 추적은 유료 API 없이 택배사 공개 조회 링크(`lib/shipping/couriers.ts`) 방식이라 관련 env 가 없다(우체국 API·자동 송장 미사용).

### 카드 이미지 임베딩 (AWS Bedrock, 선택)

관리 카탈로그의 유사 카드 검색용 벡터 임베딩. 미설정이면 임베딩 기능만 비활성(카탈로그 기본 동작은 유지). 모두 `lib/env.ts` 정의.

| 변수 | 구분 | 설명 |
|---|---|---|
| `BEDROCK_REGION` | ◯ 선택 | Bedrock 리전(기본 `ap-northeast-2`) |
| `BEDROCK_ACCESS_KEY_ID` 🔒 / `BEDROCK_SECRET_ACCESS_KEY` 🔒 | ◯ 선택 | Bedrock 전용 자격증명(미지정 시 `BEDROCK_PROFILE` 또는 기본 자격증명 체인) |
| `BEDROCK_PROFILE` | ◯ 선택 | 로컬에서 쓸 AWS 프로파일명 |
| `BEDROCK_EMBED_MODEL_ID` / `BEDROCK_EMBED_DIMENSION` | ◯ 선택 | 임베딩 모델 ID·차원 |

## 런타임 토글

| 변수 | 구분 | 설명 |
|---|---|---|
| `PAYMENT_PROVIDER` | ◯ 선택 | 결제 어댑터. 기본 `mock`(즉시 결제, 키 없이 CI·로컬). 운영은 `kakaopay`(스토어 주문·중고 안전거래 모두 카카오페이 ready→리다이렉트→approve). `KAKAO_PAY_SECRET_KEY` 없으면 자동 mock 폴백. 운영 태스크 정의는 `kakaopay` 고정([order-checkout-payment.md](./order-checkout-payment.md)) |

## 자동 설정 (구성 불필요)

- `NODE_ENV` — Next.js가 주입. 쿠키 `Secure` 플래그 등에 사용.
- `NEXT_TELEMETRY_DISABLED=1` — 운영 태스크 정의에만 있음(텔레메트리 끄기). 앱 동작과 무관.

## 보안 메모

- 🔒 변수는 **서버 전용 secret**이다. `NEXT_PUBLIC_` 접두어를 붙이거나 클라이언트 코드·로그에 노출하면 안 된다.
- `.env*` 파일은 커밋하지 않는다(허용 파일은 `.env.local.example`뿐). 커밋 전 `secretlint`가 lint-staged로 돈다.
- 환경별로 같은 변수라도 값이 다르다(로컬 기본값 ≠ dev ≠ prd). 운영 값은 코드·CI에 두지 않고 SSM/태스크 정의로만 관리한다.
