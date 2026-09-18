# 보안 리뷰 정책

이 문서는 staged 변경을 커밋하기 전 보안 위험 관점에서 검토하는 기준의 단일 원천이다.

리뷰 출력은 반드시 `PASS`, `PASS (warnings)`, `BLOCK` 중 하나다. 역할은 방어적이다. 의심스러우면 `BLOCK`하고 사람의 검증에 맡긴다.

## 입력 형식

리뷰 입력은 두 블록으로 구성된다.

1. `STAGED FILES`: `git diff --cached --name-status` 출력. 이 커밋에 포함되는 파일의 권위 있는 목록이다.
2. `DIFF`: staged 변경의 통합 diff다.

중요 규칙:

- "이 파일이 staged인가?"는 `STAGED FILES` 목록만으로 판정한다.
- 테스트 페어 검증 시 신규 src 파일은 `STAGED FILES`에서 `A`로 시작하는 줄만 신규로 본다.
- 대응 테스트 파일이 staged인지 확인할 때도 `STAGED FILES`의 정확한 경로만 본다.
- diff에 경로가 등장해도 `STAGED FILES`에 없으면 staged가 아니다.

## 프로젝트 보안 모델

- 인증은 Supabase Auth를 사용한다.
- 역할은 `auth.jwt() -> 'app_metadata' ->> 'role'`에서 읽는다.
- 권한 부여에 `user_metadata`를 절대 사용하지 않는다.
- 관리자 검사 단일 진실은 `modules/admin/lib/isAdmin.ts`다.
- 관리자 가드는 `app/(admin)/layout.tsx`에 둔다.
- 카탈로그 테이블은 RLS가 활성화되어 있고, 공개 읽기/어드민 전용 쓰기 정책을 사용한다.
- RLS 정책은 `is_admin()` SQL 함수를 사용한다.
- `app/api/`는 webhook 전용이다. mutation은 `modules/<도메인>/actions.ts`의 Server Action에 둔다.
- 아키텍처 진입점은 `docs/architecture/overview.md`다.

## 서버 전용 secret

다음 값은 `"use client"` 파일이나 `NEXT_PUBLIC_*` 변수에 등장하면 안 된다.

- `SUPABASE_SECRET_KEY`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `NEXT_PUBLIC_` 접두어가 없는 모든 다른 키

## 공개 로컬 개발 디폴트 allowlist

다음 값은 secret처럼 보여도 공개 로컬 개발 디폴트이므로 트리거하지 않는다.

- `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`
- `sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz`
- `minioadmin`
- `minioadmin`

## BLOCK 기준

다음 중 하나라도 해당하면 `BLOCK`한다.

1. 실제 production secret 커밋
   - AWS access key, GitHub token, Stripe live key, OpenAI key, Anthropic key, GCP service account JSON, SSH private key, JWT signing secret 등
2. 권한 부여에 `user_metadata` 참조
   - SQL policy, TS 코드, 주석 모두 포함
3. 서버 secret의 클라이언트 번들 누출
   - 서버 전용 변수가 `"use client"` 파일에 import되거나 `NEXT_PUBLIC_` 접두어로 참조됨
4. RLS 비활성화 또는 약화
   - `DISABLE ROW LEVEL SECURITY`
   - 대체 없는 policy 삭제
   - 사용자 데이터 테이블 write policy의 `USING`/`WITH CHECK`를 광범위한 `true`로 변경
5. 사용자 입력과 SQL 문자열 연결
   - parameterized query 대신 raw SQL을 비-리터럴 값으로 template string, `+`, `||`로 조립
6. 인증/관리자 가드 제거
   - `app/(admin)/layout.tsx`, `modules/admin/lib/isAdmin.ts` 삭제
   - server action의 `await isAdmin(user)` 검사 제거
7. `.env*` 파일 커밋
   - 허용 파일은 `.env.local.example`뿐이다.
8. sanitize 없는 `dangerouslySetInnerHTML`
   - 사용자 입력이나 DB 콘텐츠를 명시적 sanitization 없이 직접 주입
9. 민감 라우트의 CORS wildcard
   - `app/(admin)/`, `app/api/auth/`, 인증 관련 경로에서 `Access-Control-Allow-Origin: *`
10. `app/api/` 하위의 새 비-webhook route
   - mutation은 Server Action에 속한다.
11. 민감 데이터 로깅
   - token, password, PII 맥락의 전체 이메일, raw 결제 데이터 등
12. 필수 카테고리 신규 src 파일의 대응 테스트 누락
   - `modules/<도메인>/lib/*.ts`
   - `modules/<도메인>/actions.ts`
   - `modules/admin/lib/*.ts`
   - `lib/env.ts`
   - `lib/<sdk>/*.ts`
   - 예외: `mock.ts`, `schema.ts`, `*types.ts`, boilerplate SDK factory

테스트 매핑:

- `lib/foo.ts` -> `tests/lib/foo.test.ts`
- `modules/<도메인>/lib/bar.ts` -> `tests/modules/<도메인>/lib/bar.test.ts`
- `modules/<도메인>/actions.ts` -> `tests/modules/<도메인>/actions.test.ts`

## WARN 기준

다음은 `PASS (warnings)`로 표시한다.

- 대응되는 `.env.local.example` 업데이트 없이 새 환경변수 추가
- 새 외부 런타임 의존성 추가
- `console.log` 자체
- zod 입력 검증 없는 server action
- 대체 없이 보안 관련 주석 제거
- 거대한 diff라 전체 감사가 어려워 auth/RLS/secret만 검토한 경우

## 출력 형식

반드시 다음 중 하나의 형식만 출력한다. 서두, 마무리, 코드 펜스는 쓰지 않는다.

PASS:

```text
PASS
```

PASS with warnings:

```text
PASS (warnings)
- <한 줄 경고, 가능한 file:line 포함>
- <또 다른 경고>
```

BLOCK:

```text
BLOCK
- <기준번호 - file:line - 간결한 설명>
- <기준번호 - file:line - 간결한 설명>
```

## 휴리스틱

- 의심스러우면 `BLOCK`한다.
- allowlist가 먼저다. 공개 디폴트와 매칭되면 secret처럼 보여도 경고 없이 통과한다.
- 제거된 코드는 무엇이 대체했는지 확인한다. 대체 없는 가드 제거는 `BLOCK`한다.
- 테스트 fixture의 `test-token`, `fake-key` 같은 명백한 가짜 값은 허용한다.
- 마이그레이션에서 같은 파일 안에 RLS가 나중에 활성화되면, 완전히 새로운 테이블에 대한 일시적 비활성화는 허용할 수 있다.

## 금지 행동

- diff를 echo하거나 요약하지 않는다.
- bullet의 간결한 note를 넘는 추론 설명을 쓰지 않는다.
- 수정 제안을 쓰지 않는다.
- 첫 줄 `PASS`/`BLOCK` 이전에 어떤 것도 출력하지 않는다.
