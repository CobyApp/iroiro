# 카카오·네이버 로그인 설정 가이드

iroiro의 소셜 로그인은 **카카오 전용**이다(네이버는 2026-09 제거).  **자체 구현 OAuth**(Supabase Auth·NextAuth 미사용)다. 코드는 이미 구현돼 있으므로, 이 문서의 순서대로 **제공자 콘솔 등록 + 환경변수(또는 SSM 파라미터) 채우기**만 하면 동작한다.

> 관련 코드: [`app/api/auth/[provider]/route.ts`](../app/api/auth/[provider]/route.ts)(시작) · [`app/api/auth/[provider]/callback/route.ts`](../app/api/auth/[provider]/callback/route.ts)(콜백) · [`modules/auth/`](../modules/auth/)(세션·계정·OAuth 클라이언트).
> 인프라·시크릿 주입은 [deployment.md](./deployment.md), 변수 목록은 [environment-variables.md](./environment-variables.md).

## 큰 그림 — 로그인 한 번에 일어나는 일

```
/login 버튼 → GET /api/auth/{kakao|naver}            (우리 서버: state·PKCE 쿠키 심고 제공자로 302)
           → 카카오·네이버 동의 화면
           → GET /api/auth/{provider}/callback        (우리 서버: state 검증 → code 교환 → 프로필)
              ├ 기존 신원 → account_session 발급 → / 로 302
              └ 신규 신원 → pending_account 생성 → /signup (닉네임 입력 후 account 생성)
```

- 소셜 로그인은 **로그인 = 회원가입**. 신규 신원은 account를 바로 만들지 않고 `pending_account`에 담아 `/signup`으로 보낸다(deferred signup).
- `redirect_uri`는 코드가 `{APP_URL}/api/auth/{provider}/callback`으로 만든다. `APP_URL`이 비어 있으면 **요청 origin으로 폴백**한다(`buildCallbackUrl`은 끝 슬래시를 제거한다).
- state(CSRF)·PKCE 값은 `oauth_state`/`oauth_verifier` 쿠키(httpOnly·Lax·**10분**)에 담긴다. 카카오는 PKCE S256 사용, 네이버는 미지원이라 state만으로 방어.

## 사업자등록증이 필요한가? — 아니요

카카오·네이버 로그인은 개인 개발자(본인인증)만으로 정식 오픈까지 가능하다. 카카오는 **이메일**을 받으려면 비즈 앱이 필요하지만 사업자 없이 "개인 개발자 비즈 앱"으로 대체된다(§1-6). 네이버는 검수까지 사업자 정보가 필요 없다(§2-6).

## 콜백 URL 레퍼런스 (환경별)

콘솔에 등록하는 URI는 코드의 콜백 경로와 **한 글자도 다르면 안 된다**(가장 흔한 실패 원인). 세 환경 모두 등록해 둔다.

| 환경 | `APP_URL` | 카카오 Redirect URI | 네이버 Callback URL |
|---|---|---|---|
| 로컬 | `http://localhost:3000` | `http://localhost:3000/api/auth/kakao/callback` | `http://localhost:3000/api/auth/naver/callback` |
| dev | `https://dev.iroiro.club` | `https://dev.iroiro.club/api/auth/kakao/callback` | `https://dev.iroiro.club/api/auth/naver/callback` |
| prd | `https://iroiro.club` | `https://iroiro.club/api/auth/kakao/callback` | `https://iroiro.club/api/auth/naver/callback` |

> prd는 `www.iroiro.club`도 ALB가 받지만 `APP_URL=https://iroiro.club`로 고정돼 있어 콜백은 항상 `iroiro.club`으로 만들어진다. www용 콜백을 따로 등록할 필요는 없다.

자주 틀리는 부분: ① http/https 혼동, ② `APP_URL` 끝 슬래시, ③ 로컬 포트 누락, ④ 로컬·dev·prd 중 일부만 등록.

## 1. 카카오 앱 등록

콘솔: https://developers.kakao.com

1. **애플리케이션 추가** — [내 애플리케이션] → [애플리케이션 추가하기]. 앱 이름 입력(사업자명은 개인 개발자는 선택). 환경별로 앱을 따로 만들지 않고 **하나의 앱에 세 콜백 URI를 모두 등록**해도 된다.
2. **REST API 키 복사** — [앱 설정] → [앱 키] → **REST API 키** → `KAKAO_REST_API_KEY`.
3. **카카오 로그인 활성화** — [제품 설정] → [카카오 로그인] → 활성화 설정 ON.
4. **Redirect URI 등록** — [카카오 로그인] → Redirect URI에 위 표의 카카오 열 세 개를 정확히 추가.
5. **Client Secret** — [앱 설정] → [앱 키] → REST API 키를 클릭하면 그 안에서 클라이언트 시크릿 코드를 확인/생성한다(구버전 콘솔은 [제품 설정] → [카카오 로그인] → [보안]). 값은 `KAKAO_CLIENT_SECRET`.
   - **활성화 상태와 env 값을 일치시킬 것.** 콘솔에서 시크릿이 '사용' 상태면 카카오가 토큰 교환 때 `client_secret`을 요구하므로 `KAKAO_CLIENT_SECRET`을 반드시 채워야 한다(비우면 `oauth_failed`). 둘 다 켜거나 둘 다 끈다. 개편된 콘솔은 시크릿이 활성화된 채로 자동 추가되곤 한다.
6. **동의항목** — [카카오 로그인] → [동의항목]에서 **닉네임(`profile_nickname`)** 사용 설정. 코드는 `KAKAO_SCOPE`(기본 `profile_nickname`)를 로그인 요청의 `scope`로 명시해 보낸다 — 콘솔에 켜두는 것만으로는 부족하다.
   - **이메일(`account_email`)은 비즈 앱에서만** 받을 수 있다. 그전까지는 이메일이 비어 있는 채로 가입된다(정상). 필요하면 비즈 앱 전환 후 `KAKAO_SCOPE=profile_nickname,account_email`.
   - 비즈 앱 전환은 ① 일반 비즈 앱(사업자등록번호) 또는 ② **개인 개발자 비즈 앱**([계정 설정] → [본인인증] + 카카오비즈니스 약관 동의 → [앱] → [일반] → [비즈니스 정보]에서 전환). 개인 개발자 비즈 앱도 이메일 필수 동의가 가능하다(단, 비즈니스 채널 연결 불가).

## 2. 네이버 앱 등록

콘솔: https://developers.naver.com/apps

1. **애플리케이션 등록** — [Application] → [애플리케이션 등록]. 앱 이름 입력.
2. **사용 API** — **네이버 로그인** 선택.
3. **제공 정보** — 앱이 사용자에게 요청할 항목 체크. 이메일·별명(닉네임)·프로필 사진 정도로 최소화(검수에 유리).
4. **서비스 환경 + Callback URL** — [환경 추가] → **PC웹**. 서비스 URL과 Callback URL을 환경별로 등록.
   ```
   서비스 URL : http://localhost:3000        https://dev.iroiro.club        https://iroiro.club
   Callback URL: (위 표의 네이버 열 세 개)
   ```
5. **Client ID / Secret 확인** — 등록 후 [개요]에서 `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 복사.
6. **검수 요청** — 검수 전에는 **등록된 개발자(및 추가한 멤버·테스트 계정)만** 로그인된다. 정식 오픈 전 [Application] → [내 애플리케이션] → 해당 앱 → 개발 상태의 **검수 요청**을 통과해야 모든 사용자가 로그인할 수 있다. 사업자등록증은 필요 없다.
   - 통과 요건: 로그인 화면에 **네이버 공식 버튼 디자인**으로 버튼 실제 노출 · 필수 수집 정보 최소화(휴대전화번호 등 과한 항목은 소명 필요 — 거절 1순위) · 회원가입 프로세스 화면 캡처 업로드 · 테스트 아이디 등록.
   - 심사에 영업일이 소요되니 오픈 일정에 여유를 둘 것.

## 3. 값 채우기

### 로컬 (`.env.local`)

템플릿은 [`.env.local.example`](../.env.local.example)(`npm install` 시 자동 복사).

| 변수 | 값 출처 | 비고 |
|---|---|---|
| `APP_URL` | 직접 지정 | `http://localhost:3000`. 끝 슬래시 금지. 비우면 요청 origin 폴백 |
| `KAKAO_REST_API_KEY` | 카카오 [앱 키] | **필수**(없으면 `lib/env.ts` 검증 실패로 부팅 불가) |
| `KAKAO_CLIENT_SECRET` | 카카오 [앱 키] → REST API 키 → 클라이언트 시크릿 | 콘솔에서 시크릿 '사용' 시 필수 |
| `KAKAO_SCOPE` | 직접 지정 | 비우면 `profile_nickname`. 이메일은 비즈 앱 + `profile_nickname,account_email` |
| `NAVER_CLIENT_ID` | 네이버 [개요] | **필수** |
| `NAVER_CLIENT_SECRET` | 네이버 [개요] | **필수** |
| `DATABASE_URL` | `compose.yml` postgres | 세션·pending_account가 DB에 저장되므로 실 DB 필수. 기본값 `postgresql://app:app@127.0.0.1:5432/iroiro` 그대로 |

```bash
APP_URL=http://localhost:3000
KAKAO_REST_API_KEY=xxxxxxxxxxxxxxxx
KAKAO_CLIENT_SECRET=xxxxxxxxxxxxxxxx
KAKAO_SCOPE=
NAVER_CLIENT_ID=xxxxxxxxxx
NAVER_CLIENT_SECRET=xxxxxxxxxx
```

### dev / prd (SSM Parameter Store)

운영 값은 코드·CI에 두지 않고 **SSM Parameter Store `/iroiro/<env>/<NAME>`(SecureString)** 에 둔다. `infra/aws/setup.sh core`가 `CHANGE_ME` placeholder를 만들어 두므로 값만 덮어쓴다. `APP_URL`은 ECS 태스크 정의에 환경별 도메인으로 이미 고정돼 있어(`setup.sh ecs`) 따로 넣지 않는다.

```bash
for e in dev prd; do
  aws ssm put-parameter --profile personal --region ap-northeast-2 --overwrite --type SecureString \
    --name /iroiro/$e/KAKAO_REST_API_KEY --value '...'
  aws ssm put-parameter --profile personal --region ap-northeast-2 --overwrite --type SecureString \
    --name /iroiro/$e/KAKAO_CLIENT_SECRET --value '...'
  aws ssm put-parameter --profile personal --region ap-northeast-2 --overwrite --type SecureString \
    --name /iroiro/$e/NAVER_CLIENT_ID --value '...'
  aws ssm put-parameter --profile personal --region ap-northeast-2 --overwrite --type SecureString \
    --name /iroiro/$e/NAVER_CLIENT_SECRET --value '...'
done
```

`KAKAO_SCOPE`는 SSM 시크릿 목록에 없다(기본값 사용). 이메일 수집을 켜려면 태스크 정의의 일반 환경변수로 추가해야 한다(`setup.sh ecs`의 `envs` 배열).

시크릿을 바꾼 뒤에는 **재기동해야 반영**된다(ECS는 기동 시점에 SSM을 읽는다).

```bash
aws ecs update-service --profile personal --region ap-northeast-2 \
  --cluster iroiro --service iroiro-<env> --force-new-deployment
```

## 4. 로컬 테스트

세션이 DB에 저장되므로 실 DB(로컬 postgres 컨테이너)가 필요하다.

```bash
npm run services:up      # compose.yml — postgres + MinIO 기동
npm run db:reset         # db/schema.sql 적용 + app 롤 LOGIN 부여
npm run db:generate      # Prisma 클라이언트 생성
# .env.local에 카카오/네이버 키 채우기 (위 §3)
npm run dev              # http://localhost:3000
```

확인 순서:

1. `http://localhost:3000/login` → 카카오/네이버 버튼이 보인다.
2. 카카오 버튼 → 동의 화면 → 승인 → 신규면 `/signup`(닉네임 입력) → 완료 후 로그인 상태. 기존 신원이면 바로 `/`.
3. 네이버 버튼 → (등록 개발자 계정으로) 동의 → 동일.
4. `npm run db:studio`로 `account`·`account_identity`·`account_session`(신규 가입 도중엔 `pending_account`) 행 확인.

> **PKCE 라이브 확인(카카오)**: 카카오에는 PKCE(`code_challenge`)를 함께 보낸다. 첫 로그인이 정상이면 그대로 두고, 카카오가 거부하면 `modules/auth/lib/oauth/kakao.ts`의 `usesPkce: true` → `false` 한 줄만 바꾼다.

## 5. dev / prd 확인

1. SSM 네 값이 `CHANGE_ME`가 아닌지: `aws ssm get-parameter --with-decryption --name /iroiro/<env>/KAKAO_REST_API_KEY --query Parameter.Value --output text`
2. 배포 후 `https://<도메인>/api/health`가 200인지(부팅 시 `lib/env.ts`가 필수 키 누락을 fail-fast로 잡는다 — 키가 비어 있으면 태스크가 뜨지 않고 ECS 서킷 브레이커가 이전 태스크를 유지한다).
3. `https://<도메인>/login`에서 실제 로그인 왕복. dev는 등록 개발자 계정으로, prd는 네이버 검수 통과 후 일반 계정으로.

## 6. 운영 체크리스트

- [ ] 카카오·네이버 콘솔에 dev·prd 콜백 URI 등록(위 표)
- [ ] SSM `/iroiro/{dev,prd}/{KAKAO_REST_API_KEY,KAKAO_CLIENT_SECRET,NAVER_CLIENT_ID,NAVER_CLIENT_SECRET}` 채움 + 재기동
- [ ] 카카오 Client Secret '사용' 상태 ↔ `KAKAO_CLIENT_SECRET` 값 일치
- [ ] 네이버 검수 통과(일반 사용자 로그인 가능 상태)
- [ ] 이메일이 필요하면 카카오 비즈 앱 전환 + `KAKAO_SCOPE`에 `account_email` 추가
- [ ] 로그인 버튼이 카카오·네이버 공식 버튼 가이드를 따르는지

## 7. 문제 해결

로그인 페이지에 뜨는 에러 코드(`/login?error=…`):

| 코드 | 의미 | 주요 원인 / 조치 |
|---|---|---|
| `provider_unavailable` | 제공자 비활성 | 해당 제공자 env 키 미설정 → `.env.local` / SSM 확인 |
| `state_mismatch` | CSRF 검증 실패 | 쿠키 차단/삭제, 10분 초과 방치, 다른 브라우저로 콜백 등. 다시 시도 |
| `denied` | 사용자 동의 거부 | 사용자가 동의 화면에서 취소 |
| `invalid_request` | code/state 누락 | 콜백 URL 직접 접근 등 비정상 요청 |
| `oauth_failed` | 교환·프로필·DB 오류 | `redirect_uri` 불일치, `client_secret` 누락/오타, DB 미연결 등. 서버 로그 `[oauth callback]` 확인 |

증상별:

| 증상 | 원인 / 조치 |
|---|---|
| 카카오 KOE006 / redirect_uri 오류 | 콘솔 Redirect URI 미등록 또는 불일치. `APP_URL` 끝 슬래시·http/https 확인 |
| 로그인은 되는데 닉네임·이메일이 비어 있음 | 동의항목 미설정 / scope 미포함. 이메일은 카카오 비즈 앱 필요 |
| 네이버 "다른 사용자 로그인 불가" | 검수 전 상태 — 등록 개발자 계정만 가능. 검수 요청 필요 |
| `oauth_failed`가 계속 남 | 대개 `redirect_uri` 불일치 또는 `client_secret`. 서버 로그의 `OAuthError` 메시지 확인 |
| dev/prd에서 시크릿을 바꿨는데 반영이 안 됨 | ECS 태스크 재기동 필요(`update-service --force-new-deployment`) |

## 8. 적용된 보안

| 조치 | 내용 |
|---|---|
| state (CSRF) | 시작 시 쿠키로 심고 콜백에서 일치 검증(불일치 거부, 10분 만료, 콜백 후 소거) |
| PKCE S256 (카카오) | code 가로채기 방어. 네이버는 미지원이라 state로 방어 |
| 서버측 code 교환 | `client_secret`은 서버에서만 사용 — 브라우저 노출 없음 |
| 세션 토큰 해시 저장 | 원본 토큰은 httpOnly 쿠키, DB(`account_session`)엔 SHA-256만 → DB 유출 시 토큰 복원 불가 |
| 쿠키 플래그 | httpOnly · Secure(운영) · SameSite=Lax |
| 즉시 폐기 | 로그아웃 = `account_session` 행 DELETE |

## 이력

- 2026-06-14 `docs/setup/kakao-naver-login-setup.html`로 최초 작성(Supabase 로컬 스택·Vercel 기준). AWS ECS/RDS 이전에 맞춰 마크다운으로 재작성.
