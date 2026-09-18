# 테스트 작성 정책

이 문서는 어떤 코드에 테스트를 쓰고, 어떤 코드에 쓰지 않는지 정하는 단일 원천이다.

판단 기준은 하나다: **"이게 깨지면 정말 나쁜가?"** YES면 테스트를 작성한다.

## 핵심 원칙

- Write tests. Not too many. Mostly integration.
- 테스트는 구현이 아니라 행동을 검증한다.
- 100% 커버리지를 목표로 하지 않는다.
- 카테고리 기반 필수/권장/면제 매트릭스를 따른다.

## 카테고리 매트릭스

모든 테스트는 루트 `tests/` 디렉토리 아래 src 트리를 그대로 mirror한다.

예:

- `lib/foo.ts` -> `tests/lib/foo.test.ts`
- `modules/<도메인>/lib/foo.ts` -> `tests/modules/<도메인>/lib/foo.test.ts`

| 카테고리 | 정책 | 위치 | 도구 |
|---|---|---|---|
| `modules/<도메인>/lib/*.ts` (queries, 도메인 로직, 계산) | 필수 - 1:1 비율 | `tests/<src 경로>/foo.test.ts` | Vitest unit |
| `modules/<도메인>/actions.ts` (Server Actions) | 필수 - 입력 검증 + 권한 + happy/error path | `tests/<src 경로>` | Vitest unit |
| `modules/admin/lib/*.ts` + 권한/인증 함수 | 필수 - 모든 분기 | `tests/<src 경로>` | Vitest unit |
| `lib/env.ts` + 환경 검증 | 필수 - 모든 분기 | `tests/<src 경로>` | Vitest unit |
| `lib/<sdk>/*.ts` (외부 SDK 래퍼: r2 등) | 필수 - mock 기반 happy/error path | `tests/<src 경로>` | Vitest unit |
| `lib/*.ts` (분기 있는 횡단 유틸) | 필수 - 1:1 비율 + 분기/경계 케이스 | `tests/<src 경로>` | Vitest unit |
| `modules/<도메인>/components/**.tsx` (폼, 다이얼로그, 검색, 필터 등 인터랙션) | 권장 - 행동 위주 | `tests/<src 경로>` | RTL + userEvent |
| `modules/<도메인>/components/**.tsx` (목록, 카드, 뱃지 등 프레젠테이션) | 면제 | - | - |
| `app/**/page.tsx`, `app/**/layout.tsx` | 권장 - Playwright E2E로 대체 가능 | `e2e/` | Playwright |
| `components/ui/*` (shadcn 원본) | 면제 | - | - |
| `*.types.ts`, `types.ts` | 면제 | - | - |
| `mock.ts` | 면제 | - | - |
| `schema.ts` | 면제 - 사용처 action/query 테스트로 cover | - | - |
| boilerplate SDK factory | 면제 - 분기/로직 추가 시 필수로 승격 | - | - |
| `app/api/**/route.ts`, `app/media/**/route.ts` (Route Handler) | 필수 - 인증·서명 검증 분기 + happy/error path | `tests/app/<경로>/route.test.ts` | Vitest unit |
| 실 DB가 필요한 흐름 (GRANT 동작, 조건부 복사 등) | 권장 - `RUN_INTEGRATION=1`에서만 실행 | `tests/integration/*.integration.test.ts` | Vitest + 로컬 Postgres/MinIO |
| `middleware.ts`, `next.config.*`, `tailwind.config.*` 등 인프라 설정 | 면제 | - | - |

boilerplate SDK factory 예:

- `lib/r2/client.ts` (env를 `AwsClient`에 넘기기만 함 — `presign.ts`·`get.ts`·`ugc.ts`처럼 분기가 있는 파일은 필수)
- `lib/db.ts` (Prisma 싱글턴 — 단, BigInt polyfill 같은 분기가 있으면 필수로 승격)

## 30초 결정 트리

```text
이 파일이 도메인 비즈니스 로직, 서버 액션, 보안 함수, 외부 SDK 래퍼인가?
├── YES -> 필수
└── NO  -> 인터랙션 컴포넌트인가?
         ├── YES -> 권장
         └── NO  -> 면제
```

## 도메인 로직, 유틸, SDK 래퍼

- 테스트는 `tests/` 디렉토리 아래 src 트리를 그대로 mirror한다.
- 새 src 함수 추가 시 같은 PR에 mirror 위치의 테스트도 추가한다.
- src import는 절대 경로를 사용한다.
- 외부 의존성은 mock한다.
- 표 형식 분기 케이스에는 `it.each`를 적극 사용한다.

## Server Actions

각 action에는 최소 3개 케이스를 둔다.

1. happy path: 유효 입력 + 권한 OK
2. 권한 거부: 비-admin이 admin action 시도
3. 입력 검증 실패: 잘못된 zod schema 입력

DB 클라이언트(`@/lib/db`)와 세션 DAL(`@/modules/auth/dal`의 `getCurrentAccount`), `requireAdmin`은 mock한다. 앱 코드를 소유자 롤로 실 DB에 붙여 테스트하지 않는다 — GRANT 검증 가치가 사라진다. 통합 테스트의 픽스처 정리만 `DATABASE_URL_PRIVILEGED`(`tests/integration/_privileged-db.ts`)를 쓴다.

## 인터랙션 컴포넌트

권장 도구는 React Testing Library와 userEvent다.

- 사용자가 할 동작만 검증한다.
- `getByRole`, `getByLabelText`, `getByText`, `userEvent.click`, `userEvent.type`를 우선 사용한다.
- `container.querySelector`, `getByTestId` 남발, 내부 state 직접 검증은 피한다.

예:

```tsx
test("invalid email blocks submit and shows error", async () => {
  const user = userEvent.setup();
  render(<SignupForm />);
  await user.type(screen.getByLabelText(/email/i), "not-an-email");
  await user.click(screen.getByRole("button", { name: /submit/i }));
  expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
});
```

## 프로젝트 표준 도구

| 도구 | 용도 | 상태 |
|---|---|---|
| Vitest | unit/component runner | 설치됨 |
| @vitejs/plugin-react | React JSX 지원 | 설치됨 |
| jsdom | DOM 환경 | 설치됨 |
| @testing-library/react | 컴포넌트 RTL | 미설치 - RTL 도입 시 추가 |
| @testing-library/user-event | 사용자 인터랙션 | 미설치 - RTL 도입 시 추가 |
| Playwright | E2E | 미설치 - E2E 도입 시 추가 |

## 안티 패턴

| 금지 패턴 | 이유 |
|---|---|
| 모든 `.tsx` 컴포넌트에 unit test | 구현 디테일 검증으로 빠짐 |
| `getByTestId` 남발 | markup 변경에 취약 |
| `container.querySelector(".class-name")` | CSS 클래스명 변경에 취약 |
| 내부 state/hook 직접 검증 | 사용자 행동 검증이 아님 |
| 100% coverage 목표 | 의미 없는 테스트 양산 |

## 새 카테고리 도입 절차

위 매트릭스에 없는 새 코드 카테고리가 생기면 다음 절차로 정책을 추가한다.

1. 카테고리 정의와 정책 초안을 작성한다.
2. 참조할 실제 프로젝트나 공식 가이드를 최소 1개 확인한다.
3. 이 문서의 매트릭스에 행을 추가한다.
4. 필요한 경우 Husky, CI, 보안 리뷰 기준의 어댑터를 갱신한다.
