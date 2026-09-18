# 카카오·네이버 OAuth 소셜 로그인 (자체 인증)

> 작성일: 2026-06-13 · 상태: 1차 구현 완료(로그인 플로우). 전화 온보딩·동의는 후속.

## 요약

카카오·네이버 OAuth 로그인을 **자체 인증**(Supabase Auth 미사용, DB 세션) 위에 구현했다.
제공자에서 신원을 받아 `account`/`account_identity`를 만들거나 연결하고, `account_session`
(해시 토큰)으로 DB 세션을 발급해 httpOnly 쿠키로 로그인 상태를 유지한다.

> **설계 전환 메모**: Obsidian `auth/오시코레-회원인증-설계-현황과-확인사항.md`(2026-06-01)는
> Supabase Auth(`auth.users`/`signInWithIdToken`) 기반이었으나, 레슨 13~16(2026-06-09)에서
> **자체 인증(DB 세션)** 으로 전환됐다. 이 구현은 후자(레슨 13·15·16 + `db/schema.sql`의 `init_account` 섹션)를 따른다.
> Obsidian 문서의 **비즈니스 요구**(카카오·네이버·전화 필수·동의·만14세)는 여전히 유효.

## 아키텍처

자체 인증 + DB 세션 + DAL 패턴(레슨 13).

```
브라우저 ──(1) /login 버튼─→ GET /api/auth/{provider}        (start)
                              · state(CSRF)+PKCE(kakao) 쿠키 심고 제공자로 302
        ←──(2) 제공자 동의 화면──→ 사용자 승인
        ──(3) ?code&state ──→ GET /api/auth/{provider}/callback  (callback, Node)
                              · state 검증 → code→token → 프로필 조회
                              · account 찾기/생성 + account_identity 연결
                              · account_session 발급(해시 저장) → 세션 쿠키 set → / 로 302
        ──(4) 이후 요청 ──→ DAL verifySession(쿠키 토큰 해시로 행 조회)
```

### 파일

| 파일 | 역할 |
|---|---|
| `modules/auth/lib/session.ts` | 토큰 생성·SHA-256 해시·세션 CRUD(고정 30일 만료) |
| `modules/auth/lib/cookies.ts` | 세션 쿠키(httpOnly·Secure·SameSite=Lax) |
| `modules/auth/lib/oauth/{types,state,kakao,naver,index}.ts` | OAuth 클라이언트·state/PKCE·정규화·dispatch |
| `modules/auth/lib/account.ts` | 제공자 신원으로 account find-or-create(트랜잭션) |
| `modules/auth/dal.ts` | `getSession`/`getCurrentAccount`(React cache, 요청당 1회) |
| `modules/auth/actions.ts` | `logout` Server Action |
| `modules/auth/components/LogoutButton.tsx` | 헤더 드롭인 로그아웃 버튼 |
| `app/api/auth/[provider]/route.ts` | OAuth 시작(start) |
| `app/api/auth/[provider]/callback/route.ts` | OAuth 콜백(Node 런타임) |
| `app/(auth)/login/page.tsx`, `app/(auth)/layout.tsx` | 로그인 화면 |
| `prisma/schema.prisma` | Account/AccountIdentity/AccountSession 모델 |

## 외부 등록 (사용자 필수 작업)

OAuth는 제공자 콘솔 등록 없이는 동작하지 않는다. 아래를 등록하고 `.env.local`에 채운다.

### 카카오 (https://developers.kakao.com)
1. 애플리케이션 추가 → **REST API 키** 확보 (`KAKAO_REST_API_KEY`)
2. [보안] → **Client Secret** 발급 + 사용 ON (`KAKAO_CLIENT_SECRET`)
3. [카카오 로그인] 활성화 ON
4. [카카오 로그인] → Redirect URI 등록: `{APP_URL}/api/auth/kakao/callback`
5. [카카오 로그인] → 동의항목 **닉네임**(profile_nickname) 활성화. ★scope로 명시해야 받음(아래 KAKAO_SCOPE).
   이메일(account_email)은 **비즈앱 등록 시에만** 가능 → 그때 `KAKAO_SCOPE="profile_nickname,account_email"`

### 네이버 (https://developers.naver.com/apps)
1. 애플리케이션 등록 → **Client ID/Secret** (`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`)
2. 사용 API: **네이버 로그인**, 제공 정보: 이름·이메일·별명 등 선택
3. 서비스 URL + Callback URL 등록: `{APP_URL}/api/auth/naver/callback`
4. 운영 배포 전 **검수(로그인 + 제공정보 심사)** 필요

### env (`.env.local`)
```
APP_URL=http://localhost:3000          # redirect_uri 베이스(트레일링 슬래시 없이)
KAKAO_REST_API_KEY=...
KAKAO_CLIENT_SECRET=...
KAKAO_SCOPE=                            # 비우면 profile_nickname. 이메일은 비즈앱+"profile_nickname,account_email"
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
DATABASE_URL=postgresql://app:app@127.0.0.1:5432/iroiro   # 세션 저장 → 실 DB 필수
```

## 로컬 테스트 방법

세션이 DB에 저장되므로 **실 DB가 필요**하다(로컬 postgres 컨테이너). 콘솔 등록·환경별 콜백 URL·운영 SSM 값은 [oauth-setup.md](../oauth-setup.md) 참조.

```bash
npm run services:up      # compose.yml — postgres + MinIO
npm run db:reset         # db/schema.sql 적용 + app 롤 LOGIN
npm run db:generate      # Prisma 클라이언트
# .env.local에 OAuth 키 채우기(DATABASE_URL은 기본값 그대로)
npm run dev
# http://localhost:3000/login → 카카오/네이버 버튼
```

## 보안 (적용된 것)

- **state(CSRF)**: start에서 쿠키로 심고 callback에서 일치 검증(불일치 거부).
- **PKCE S256**(카카오): code 가로채기 방어. 네이버는 미지원이라 state로 방어.
- **서버측 code 교환**: client_secret은 서버에서만. 브라우저 노출 없음.
- **세션 토큰 해시 저장**: 원본 토큰은 httpOnly 쿠키, DB엔 SHA-256만 → DB 유출 시 토큰 복원 불가.
- **쿠키 플래그**: httpOnly·Secure(prod)·SameSite=Lax.
- **즉시 폐기**: 로그아웃 = `account_session` 행 DELETE.

## 한계 · 후속 작업 (TODO)

1. **전화 인증 온보딩** — 비즈니스상 전화번호 필수(Obsidian §2.2·2.3). OAuth 직후
   `phone_number_verified_at = NULL`(미완료)로 두고, 콜백의 TODO 지점에서 `/onboarding/phone`로
   유도해야 함. SMS 게이트웨이(솔라피/알리고) + 발신번호 사전등록(영업일 소요)이 외부 선결과제.
2. **계정 연결/병합** — v1은 신원당 1계정. 같은 사람이 카카오·네이버로 각각 로그인하면 계정 2개.
   이메일/전화 기반 병합 정책은 후속.
3. **동의(consent) 수집** — 가입 시 약관·개인정보·만14세 필수 동의 + 마케팅 선택 동의 저장소 추가.
4. ~~**Proxy 전환**~~ — 해소. `middleware.ts`는 `x-pathname` 헤더만 심고, admin 게이트는
   `app/(admin)/layout.tsx`의 `account.is_admin` 인가로 대체됐다([admin-architecture.md](../admin-architecture.md)).
5. ~~**app 롤 전환**~~ — 해소. 런타임 접속은 `app` 롤이며 방어선은 RLS가 아닌 GRANT 매트릭스다
   ([db-authorization-review.md](../architecture/db-authorization-review.md)).
6. **브랜드 자산** — 로그인 버튼은 브랜드 컬러+간이 마크. 정식 배포 전 카카오·네이버 공식 버튼 가이드 준수.
7. **레이트리밋·남용 방어** — 로그인/콜백 rate limit(SMS pumping은 전화 단계에서).

## 테스트

`tests/modules/auth/` — 순수 로직 단위 테스트:
- `session.test.ts`: 토큰 해시(SHA-256 결정성), 토큰 생성(고유·base64url)
- `oauth.test.ts`: PKCE S256(RFC 7636 벡터), 제공자 가드, 카카오·네이버 프로필 정규화

전체 플로우(code 교환·세션 발급)는 제공자 자격증명 + 실 DB가 있어야 수동 검증 가능.
