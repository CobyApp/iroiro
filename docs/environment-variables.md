# 환경변수 레퍼런스

이 프로젝트가 사용하는 환경변수 전체 목록과 설명. 검증의 단일 진실은 [lib/env.ts](../lib/env.ts)이며, 로컬 템플릿은 [.env.local.example](../.env.local.example)다.

## 범례

| 구분 | 의미 |
|---|---|
| ✅ **필수** | 없으면 `lib/env.ts` 검증 실패 → **빌드/부팅이 즉시 실패**(fail-fast) |
| ⚙️ **운영 필수** | `env.ts` 기본값은 로컬 개발용. **운영에선 실제 값으로 반드시 교체**(빌드는 통과하나 동작이 깨짐) |
| ◯ **선택/조건부** | 미설정 허용. 기능·상황에 따라 설정 |
| 🔒 | **서버 전용 secret** — `NEXT_PUBLIC_` 접두어 금지, 클라이언트 번들·로그에 노출 금지 |

> `NEXT_PUBLIC_*` 접두어 변수는 빌드 시 **브라우저로 전송**된다(공개 값만 둘 것).

## 데이터베이스 (Postgres)

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `DATABASE_URL` 🔒 | ⚙️ 운영 필수 | Prisma 직접 연결 문자열(비밀번호 포함). **비특권 `app` 롤로 접속한다** — 소유자 `postgres`로 붙으면 GRANT가 무효라 soft delete 강제 등 DB 방어선이 작동하지 않는다([db-authorization-review](./architecture/db-authorization-review.md)). 로컬은 `npm run db:reset`이 `db/schema.sql` 적용 + `ALTER ROLE app WITH LOGIN`을 실행하므로 `postgresql://app:app@127.0.0.1:5432/iroiro` 그대로 사용. `env.ts` 검증 밖이지만 Prisma가 사용 — 없으면 `prisma generate`부터 실패. 운영(AWS RDS 등): `db/schema.sql`을 소유자로 1회 적용하고 `app` 롤에 LOGIN·비밀번호를 부여한 뒤 그 자격으로 접속. 비밀번호 특수문자 주의 → [lessons/10](./lessons/10-database-url-password.md) |

## 스토리지 (Cloudflare R2 / 로컬 MinIO)

배경·셋업: [r2-adoption.md](./r2-adoption.md)

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `R2_ENDPOINT` | ⚙️ 운영 필수 | R2(S3 호환) 엔드포인트. 기본값 `http://localhost:9000`(로컬 MinIO). 운영: R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` 🔒 | ⚙️ 운영 필수 | R2 액세스 키 ID. 기본 `minioadmin`(로컬). 운영: R2 API 토큰(상품·UGC **두 버킷 스코프**) |
| `R2_SECRET_ACCESS_KEY` 🔒 | ⚙️ 운영 필수 | R2 시크릿 액세스 키. 기본 `minioadmin`(로컬). **서버 전용** |
| `R2_BUCKET` | ⚙️ 운영 필수 | 공개 버킷 이름(상품·공지 사진 — 공지는 notices/ prefix). 기본 `oshikore-products-dev` |
| `R2_PUBLIC_BASE` | ⚙️ 운영 필수 | 공지·배너·관리 미리보기용 공개 객체 URL 베이스. 고객용 상품 사진은 이 주소를 노출하지 않고 `/media/product-*`에서 워터마크 처리한다. 운영 공개 도메인은 `products/original/*` 직접 접근을 WAF로 차단해야 한다. |
| `R2_UGC_BUCKET` | ⚙️ 운영 필수 | UGC 사진 전용 **비공개** 버킷. 기본 `oshikore-ugc-dev`. 운영: R2 비공개 버킷(공개 도메인 연결 금지). 자격증명은 위 `R2_*`를 공유 — 토큰 스코프에 이 버킷 포함 필수 |

## OAuth 소셜 로그인 (카카오 · 네이버)

발급·콘솔 등록 절차: [setup/kakao-naver-login-setup.html](./setup/kakao-naver-login-setup.html)

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `KAKAO_REST_API_KEY` | ✅ 필수 | 카카오 REST API 키. 카카오 개발자 › 앱 › 앱 키 |
| `NAVER_CLIENT_ID` | ✅ 필수 | 네이버 Client ID. 네이버 개발자 › 애플리케이션 |
| `NAVER_CLIENT_SECRET` 🔒 | ✅ 필수 | 네이버 Client Secret. 네이버 개발자 › 애플리케이션 |
| `APP_URL` | ◯ 선택(운영 권장) | OAuth 콜백 베이스. `redirect_uri = {APP_URL}/api/auth/{provider}/callback`. 시작·콜백 양쪽에서 사용([route.ts:36](../app/api/auth/[provider]/route.ts), [callback/route.ts:63](../app/api/auth/[provider]/callback/route.ts)). 미설정 시 요청 origin으로 폴백 → 운영은 **표준 도메인 고정 권장**(콘솔 등록 Redirect URI와 일치해야 함). **끝 슬래시 금지** |
| `KAKAO_CLIENT_SECRET` 🔒 | ◯ 조건부 | 카카오 콘솔에서 **[보안] Client Secret '사용 ON'** 했다면 필수. 안 켰으면 불필요 |
| `KAKAO_SCOPE` | ◯ 선택 | 동의항목(scope). 기본 `profile_nickname`. 이메일 등 추가 시 설정(예: 비즈앱 + `profile_nickname,account_email`) |

> 콘솔에 **Redirect/Callback URI** 등록도 필요: 카카오 `{APP_URL}/api/auth/kakao/callback`, 네이버 `{APP_URL}/api/auth/naver/callback` (코드 경로와 한 글자도 달라선 안 됨).

## 관리자 접근 통제

`/admin` 접근 통제는 admin layout의 계정 인가(`account.is_admin`)가 단독으로 담당한다. 전용 환경변수는 없다.
과거의 공용 자격증명 외곽 게이트(Basic Auth·폼 로그인)는 실 계정 인가 도입으로 제거했다.

## 외부 API

| 변수 | 구분 | 설명 / 값 출처 |
|---|---|---|
| `CUTIE_CARD_API_BASE` | ◯ 선택 | Cutie Card 분석기 API 베이스 URL. 기본 `https://card.taba.asia`. 관리자 카드 임포트가 `{BASE}/api/v1/collection`을 호출한다([cutie-card.ts](../modules/import/lib/cutie-card.ts)) |
| `CUTIE_CARD_API_KEY` 🔒 | ◯ 조건부 | Cutie Card API 키. **미설정 시 `env.ts` 검증은 통과하지만 카드 임포트 실행 시점에 에러로 실패한다.** 관리자 임포트 기능을 쓸 때만 필요. **서버 전용** |
| `FX_API_BASE` | ◯ 선택 | 매입일 환율(JPY→KRW) 조회 API. 기본 [Frankfurter](https://frankfurter.dev)(ECB 기준, 키 불필요, 과거 영업일 지원). 정식 호스트는 `https://api.frankfurter.dev/v1` — `.app` 도메인은 301 리다이렉트 |

## 런타임 토글

| 변수 | 구분 | 설명 |
|---|---|---|
| `PAYMENT_PROVIDER` | ◯ 선택 | 결제 게이트웨이 어댑터. 기본 `mock`(현재 유일한 값). 실 PG 도입 시 `lib/env.ts` enum에 `"toss"` 등 추가 + `lib/payments` 어댑터 구현 후 교체 |

> 과거의 `USE_MOCK_DATA`는 mock 모드 전면 제거(DB 단일 경로 전환)로 삭제됐다. 배포 환경에 잔존해도 무시되지만 혼동 방지를 위해 지우는 것을 권장.

## 자동 설정 (구성 불필요)

`NODE_ENV`, `NEXT_PHASE` — Next.js가 자동 주입한다. 직접 설정하지 않는다.

## 보안 메모

- 🔒 변수는 **서버 전용 secret**이다. `NEXT_PUBLIC_` 접두어를 붙이거나 클라이언트 코드·로그에 노출하면 안 된다.
- `.env*` 파일은 커밋하지 않는다(허용 파일은 `.env.local.example`뿐).
- 환경별로 같은 변수라도 값이 다르다(로컬 기본값 ≠ 운영 값). 운영은 호스팅 환경(컨테이너 env / SSM Parameter Store 등)의 환경변수로 관리한다.
