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

- 인증은 자체 세션(`account_session`) + 카카오·네이버 OAuth다. 외부 인증 SaaS를 쓰지 않는다.
- 역할은 `account.is_admin` 컬럼에서만 읽는다.
- 관리자 검사 단일 진실은 `modules/admin/lib/isAdmin.ts`다.
- 관리자 가드는 `app/(admin)/layout.tsx`에 둔다.
- DB 방어선은 비특권 `app` 롤의 GRANT 매트릭스다(`db/schema.sql`). 앱은 반드시 `app` 롤로 접속한다. RLS는 쓰지 않는다.
- `app/api/`는 외부 호출 엔드포인트(OAuth 시작·콜백, `/api/health`, `/api/cron/*`, webhook) 전용이다. mutation은 `modules/<도메인>/actions.ts`의 Server Action에 둔다.
- 고객용 이미지는 `app/media/*` HMAC 서명 라우트로만 서빙한다. 서명 키는 `R2_SECRET_ACCESS_KEY`다.
- 스토리지는 S3 호환(`lib/r2/`, 운영 AWS S3·로컬 MinIO). 이름의 `R2_*`는 역사적 명칭이다.
- 아키텍처 진입점은 `docs/architecture/overview.md`다.

## 서버 전용 secret

다음 값은 `"use client"` 파일이나 `NEXT_PUBLIC_*` 변수에 등장하면 안 된다(`lib/env.ts` 기준).

- `DATABASE_URL`, `DATABASE_URL_PRIVILEGED`(테스트 정리용 소유자 연결)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- `CATALOG_DATABASE_URL`(공유 카탈로그 DB 연결)
- `VAPID_PRIVATE_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_` 접두어가 없는 모든 다른 키

`lib/env.ts`는 `"server-only"`다. 클라이언트 컴포넌트가 `@/lib/env`를 import하면 그 자체가 누출이다.

## 공개 로컬 개발 디폴트 allowlist

다음 값은 secret처럼 보여도 공개 로컬 개발 디폴트이므로 트리거하지 않는다.

- `minioadmin` (로컬 MinIO 루트 계정·비밀번호)
- `postgresql://app:app@127.0.0.1:5432/iroiro` (로컬 compose Postgres, `app` 롤 비밀번호 `app`)
- `postgres` / `postgres` (로컬 compose Postgres 소유자)

## BLOCK 기준

다음 중 하나라도 해당하면 `BLOCK`한다.

1. 실제 production secret 커밋
   - AWS access key, GitHub token, Stripe live key, OpenAI key, Anthropic key, GCP service account JSON, SSH private key, JWT signing secret 등
2. 권한 판정 근거를 `account.is_admin` / `account.board_role` 이외에서 읽기
   - 쿠키·클라이언트 입력·요청 헤더·외부 토큰 claim으로 관리자 여부 판정
3. 서버 secret의 클라이언트 번들 누출
   - 서버 전용 변수가 `"use client"` 파일에 import되거나 `NEXT_PUBLIC_` 접두어로 참조됨
4. GRANT 매트릭스 약화 (`db/schema.sql`)
   - `GRANT ALL` 또는 soft delete·불변 이력 테이블(`post`, `post_comment`, `order`, `order_item`, `inventory_item` 등)에 `DELETE` 신규 부여
   - 컬럼 제한 UPDATE(`post_report` 등)를 테이블 전체 UPDATE로 확장
   - 앱 `DATABASE_URL`을 소유자 롤(`postgres`, `iroiro_admin`)로 변경, 또는 `app` 롤에 `SUPERUSER`/`BYPASSRLS` 부여
   - 새 테이블에 `GRANT … TO app` 누락은 4번이 아닌 WARN(동작 불가로 드러남)
5. 사용자 입력과 SQL 문자열 연결
   - parameterized query 대신 raw SQL을 비-리터럴 값으로 template string, `+`, `||`로 조립
6. 인증/관리자 가드 제거
   - `app/(admin)/layout.tsx`, `modules/admin/lib/isAdmin.ts`, `requireAdmin.ts` 삭제·우회
   - server action의 `requireAdmin()` / `requireBoardManager()` / `getCurrentAccount()` 소유권 검사 제거
   - `/api/cron/*`의 `CRON_SECRET` Bearer 검사 제거, `app/media/*`의 서명 검증 제거
   - OAuth 콜백의 `state` 검증 제거, 세션 쿠키의 `httpOnly` 제거
   - `lib/db.ts` 외의 새 DB 연결 생성(소유자 연결 우회)
7. `.env*` 파일 커밋
   - 허용 파일은 `.env.local.example`뿐이다.
8. sanitize 없는 `dangerouslySetInnerHTML`
   - 사용자 입력이나 DB 콘텐츠를 명시적 sanitization 없이 직접 주입
9. 민감 라우트의 CORS wildcard
   - `app/(admin)/`, `app/api/auth/`, 인증 관련 경로에서 `Access-Control-Allow-Origin: *`
10. `app/api/` 하위의 새 route가 외부 호출 엔드포인트(webhook·OAuth·헬스체크·크론)가 아님
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
- 새 테이블을 `db/schema.sql`에 추가하면서 `REVOKE`/`GRANT … TO app` 누락
- `prisma/schema.prisma`만 변경되고 `db/schema.sql`은 변경되지 않은 경우(정본 불일치)
- 거대한 diff라 전체 감사가 어려워 auth/GRANT/secret만 검토한 경우

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
- `db/schema.sql`의 `REVOKE ALL … FROM app` 뒤에 같은 섹션에서 의도한 권한을 다시 `GRANT`하는 패턴은 정상이다(베이스라인 비우기).

## 금지 행동

- diff를 echo하거나 요약하지 않는다.
- bullet의 간결한 note를 넘는 추론 설명을 쓰지 않는다.
- 수정 제안을 쓰지 않는다.
- 첫 줄 `PASS`/`BLOCK` 이전에 어떤 것도 출력하지 않는다.
