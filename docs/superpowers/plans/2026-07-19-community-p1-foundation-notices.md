# 커뮤니티 Plan 1: 공통 기반 + 공지사항 Implementation Plan

> ⚠️ **실행 기록** — 이 계획은 2026-07-20 실행 완료됐다(브랜치 `feat/community`, Task 1~7).
> 문서의 코드 예시·전제는 **구현 당시 기준**이며, 최종 코드는 현재 소스가 단일 진실이다.
>
> **실행 후 달라진 결정** (외부 구현 리뷰 3라운드 반영, 2026-07-20~21):
>
> - P2002 판별: `meta.target` 인덱스명 `includes` 방식(§Global Constraints·Task 2·5)은 Prisma 7 +
>   adapter-pg 실측에서 미동작 확인 → `lib/prisma-errors` 공용 헬퍼로 통합
>   (`meta.driverAdapterError.cause.constraint.fields` 기반, classic `meta.target` 폴백 지원).
> - mock 모드(`USE_MOCK_DATA`) 전면 제거 — "커뮤니티는 mock 미지원(빈 결과/에러)" 전제와
>   쿼리·액션·테스트의 mock 분기·가드는 더 이상 존재하지 않는다(전 도메인 DB 단일 경로).
> - TEMP-LOGIN-BYPASS 해소 — `requireAdmin`은 자체 세션(`getCurrentAccount`) + `account.is_admin`
>   실검증으로 복원(검증된 계정 반환), admin layout도 동일 판정. 작성자 스탬프는
>   `"mock-admin"` → 세션 admin account UUID.
> - middleware Basic Auth: production에서 env 미설정 시 503 fail-closed로 강화,
>   `lib/admin-basic-auth.ts`로 추출 + 테스트 8케이스.
> - `account.public_code`를 **`init_account`에 병합**(별도 `alter_account_public_code` 마이그레이션·
>   백필 DO 블록 제거 — 베타 DB 재구축 전제). 마이그레이션 6개 → 5개.
> - `public_code` length CHECK(`account_public_code_sane`·`notice_public_code_sane`) **제거** —
>   형식은 앱 생성기가 보장(항상 고정 길이), DB는 NOT NULL + UNIQUE만(collection 선례와 통일).
> - 공지 고정 전역 상한 **2 → 3**(초기 정책값 `NOTICE_PIN_LIMIT`). 아래 본문·체크리스트의 "2개"는 당시값.
> - 공지 category **기본값 제거** — DB `DEFAULT 'general'`·zod create `.default("general")` 삭제,
>   category를 데이터 경계에서 필수화(미입력 시 fail-loud). UI는 "일반" 프리셀렉트 유지.
> - 스펙 §열린 결정은 전부 확정됨(§확정 결정).

> **주의:** 아래 체크박스와 코드 예시는 당시 구현 과정을 보존한 실행 기록이며, 재실행 지시가 아니다.

**Goal:** 커뮤니티 MVP의 공통 기반(공개 코드 유틸 승격, `account.public_code`)과 공지사항 도메인(admin CRUD·공개 페이지·홈 스트립)을 출시 가능한 상태로 구현한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-19-community-design.md`의 Plan 1 절반 — `lib/public-code` 승격(Base58 파라미터화) → `account.public_code` 마이그레이션·가입 연동 → `notice` 테이블 → `modules/notices` 도메인(teams 모듈 패턴 미러) → 공개/admin 화면. 자유게시판·사진은 Plan 2·3.

**Tech Stack:** Next.js 16 App Router · React 19 · Prisma 7(adapter-pg) · Supabase 마이그레이션 · zod v4 · Vitest · shadcn/ui

## Global Constraints

- 스키마: 테이블 단수 snake_case · BIGINT IDENTITY PK · **FK 미사용**(관계 컬럼 수동 인덱스) · TEXT enum + zod(DB CHECK는 불변식만) · 전 컬럼 한국어 COMMENT · `CREATE TABLE → ALTER CHECK → CREATE INDEX → COMMENT → GRANT` 블록 순서
- GRANT: app 롤만, 테이블 단위(시퀀스 GRANT 없음 — `init_order` 선례). notice는 DELETE 미부여(soft delete 강제)
- 공개 코드: URL용 base62 12자(`generatePublicCode`) · 계정용 Base58 8자(`generateAccountCode`, `0OIl` 제외) · UNIQUE + P2002 재시도(대상 인덱스명 `includes` 확인 — `runWithUniqueCodeGuard` 선례)
- 공지 정책값(스펙 §열린 결정): 카테고리 `general | event` · 제목 100자 · 본문 10,000자 · **전 입력 trim 후 공백만 거부** · 고정 전역 최대 **2개**(advisory xact lock 직렬화) · 정렬 `is_pinned DESC, created_at DESC, id DESC`
- 커뮤니티는 **mock 미지원(DB 전용)**: 쿼리는 `USE_MOCK_DATA=true`면 빈 결과, 쓰기 액션은 에러 — 화면은 죽지 않는다
- `created_by/updated_by`는 TEXT, TEMP-LOGIN-BYPASS 동안 `"mock-admin"` (admin 실인증 도입 시 교체 — 스펙 §후속 #3)
- "use server" 파일은 **async 함수만 export 가능** — 상수는 `lib/schema.ts`·`types.ts`에 둔다
- 테스트: `tests/` 아래 src 트리 미러 · vi.stubEnv + `vi.resetModules()` + 동적 import 스타일(teams 테스트 선례) · OAuth env는 vitest.config가 더미 주입
- 커밋: `<type>: 한국어 제목 70자 미만` · pre-commit에서 secretlint+vitest related+CSO(15~25초)가 자동 실행됨
- 마이그레이션 분할 노트: 스펙의 `init_community`(7테이블)를 도메인별 2파일로 나눈다 — `init_notice`(본 계획) / `init_post`(Plan 2). pre-launch 마이그레이션 정책상 허용이며 계획별 독립 출시 단위와 정합

---

### Task 1: `lib/public-code.ts` 승격 + Base58 계정 코드

**Files:**
- Create: `lib/public-code.ts`
- Create: `tests/lib/public-code.test.ts`
- Modify: `modules/collection/lib/mutations.ts:5` (import 경로)
- Modify: `tests/modules/collection/lib/mutations.test.ts:4,8` (vi.mock·import 경로)
- Delete: `modules/collection/lib/public-code.ts`, `tests/modules/collection/lib/public-code.test.ts`

**Interfaces:**
- Consumes: 없음 (node:crypto만)
- Produces: `generatePublicCode(): string`(base62 12자 — collection 기존 시그니처 유지), `generateAccountCode(): string`(Base58 8자), 상수 `PUBLIC_CODE_ALPHABET`, `PUBLIC_CODE_LENGTH = 12`, `ACCOUNT_CODE_ALPHABET`, `ACCOUNT_CODE_LENGTH = 8` — Task 2·5와 Plan 2가 사용

- [x] **Step 1: 실패하는 테스트 작성**

`tests/lib/public-code.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_CODE_ALPHABET,
  ACCOUNT_CODE_LENGTH,
  generateAccountCode,
  generatePublicCode,
  PUBLIC_CODE_ALPHABET,
  PUBLIC_CODE_LENGTH,
} from "@/lib/public-code";

describe("generatePublicCode (base62 URL 코드)", () => {
  it("길이는 항상 PUBLIC_CODE_LENGTH", () => {
    for (let i = 0; i < 100; i++) {
      expect(generatePublicCode()).toHaveLength(PUBLIC_CODE_LENGTH);
    }
  });

  it("알파벳(base62) 문자만 사용", () => {
    const re = new RegExp(`^[${PUBLIC_CODE_ALPHABET}]+$`);
    for (let i = 0; i < 100; i++) {
      expect(generatePublicCode()).toMatch(re);
    }
  });

  it("연속 생성 시 중복 없음(엔트로피 sanity)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generatePublicCode());
    expect(set.size).toBe(1000);
  });
});

describe("generateAccountCode (Base58 계정 코드)", () => {
  it("길이는 항상 ACCOUNT_CODE_LENGTH(8)", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateAccountCode()).toHaveLength(ACCOUNT_CODE_LENGTH);
    }
  });

  it("혼동 문자(0, O, I, l)를 포함하지 않는다", () => {
    expect(ACCOUNT_CODE_ALPHABET).not.toMatch(/[0OIl]/);
    const re = new RegExp(`^[${ACCOUNT_CODE_ALPHABET}]+$`);
    for (let i = 0; i < 200; i++) {
      expect(generateAccountCode()).toMatch(re);
    }
  });

  it("연속 생성 시 중복 없음(엔트로피 sanity)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateAccountCode());
    expect(set.size).toBe(1000);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run tests/lib/public-code.test.ts`
Expected: FAIL — `Cannot find module '@/lib/public-code'`

- [x] **Step 3: `lib/public-code.ts` 구현 (기존 파일 이동 + 일반화)**

```ts
import "server-only";

import { randomBytes } from "node:crypto";

// 공개 식별자 생성 유틸 — 암호학적 RNG + rejection sampling(modulo bias 제거).
// 중복 방지는 길이가 아니라 각 테이블의 UNIQUE 인덱스 + 생성 경로의 insert 재시도로 보장.
// (collection에서 승격 — 스펙 docs/superpowers/specs/2026-07-19-community-design.md §결정 2)

// URL 코드용 base62 (collection·notice·post의 public_code)
export const PUBLIC_CODE_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const PUBLIC_CODE_LENGTH = 12;

// 사람이 읽고 비교하는 계정 코드용 Base58 — 0/O·1/I/l 혼동 문자 제외 (스펙 §결정 3)
export const ACCOUNT_CODE_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const ACCOUNT_CODE_LENGTH = 8;

function generateCode(alphabet: string, length: number): string {
  const size = alphabet.length;
  // 256을 알파벳 크기의 배수로 자른 최대 경계. 이 이상 바이트는 버려 균일 분포 유지.
  const maxUnbiased = Math.floor(256 / size) * size;
  let out = "";
  while (out.length < length) {
    const buf = randomBytes(length);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i];
      if (b < maxUnbiased) out += alphabet[b % size];
    }
  }
  return out;
}

export function generatePublicCode(): string {
  return generateCode(PUBLIC_CODE_ALPHABET, PUBLIC_CODE_LENGTH);
}

export function generateAccountCode(): string {
  return generateCode(ACCOUNT_CODE_ALPHABET, ACCOUNT_CODE_LENGTH);
}
```

- [x] **Step 4: collection 참조 갱신 + 구 파일 삭제**

`modules/collection/lib/mutations.ts` 5행:

```ts
// 변경 전
import { generatePublicCode } from "./public-code";
// 변경 후
import { generatePublicCode } from "@/lib/public-code";
```

`tests/modules/collection/lib/mutations.test.ts` 4·8행의 경로 두 곳을 `"@/modules/collection/lib/public-code"` → `"@/lib/public-code"`로 변경 (vi.mock 팩토리 내용은 그대로).

구 파일 삭제:

```bash
rm modules/collection/lib/public-code.ts tests/modules/collection/lib/public-code.test.ts
```

- [x] **Step 5: 통과 확인**

Run: `npx vitest run tests/lib/public-code.test.ts tests/modules/collection`
Expected: PASS (public-code 6케이스 + collection 전 케이스 회귀 없음)

Run: `npm run typecheck`
Expected: 에러 0

- [x] **Step 6: 커밋**

```bash
git add lib/public-code.ts tests/lib/public-code.test.ts modules/collection/lib/mutations.ts tests/modules/collection/lib/mutations.test.ts
git commit -m "refactor: public-code 생성기를 lib로 승격하고 Base58 계정 코드 추가"
```

(삭제 파일은 `git add -u` 대신 명시적으로: `git add modules/collection/lib/public-code.ts tests/modules/collection/lib/public-code.test.ts` — 삭제도 add로 스테이징된다.)

---

### Task 2: `account.public_code` 마이그레이션 + 가입 연동

**Files:**
- Create: `supabase/migrations/<타임스탬프>_alter_account_public_code.sql` (`supabase migration new alter_account_public_code`로 채번)
- Modify: `prisma/schema.prisma:127-145` (Account 모델)
- Modify: `modules/auth/lib/account.ts` (createAccountFromSignup)
- Test: `tests/modules/auth/lib/account.public-code.test.ts` (신규 — orders의 액션 테스트 분할 선례)

**Interfaces:**
- Consumes: `generateAccountCode()` (Task 1)
- Produces: `Account.publicCode: string` (Prisma) — Plan 2의 `author_code` 스냅샷이 사용. `createAccountFromSignup` 시그니처 불변

- [x] **Step 1: 마이그레이션 생성**

Run: `supabase migration new alter_account_public_code`

생성된 파일에 작성:

```sql
-- ============================================================================
-- alter_account_public_code: 커뮤니티 작성자 공개 식별자
--   - display_name 중복 구분용 "닉네임 #코드" 표시 (Base58 8자 — 0/O·1/I/l 제외)
--   - 내부 UUID(account.id) 비노출 원칙 유지
--   - 스펙: docs/superpowers/specs/2026-07-19-community-design.md §결정 3
-- ============================================================================

ALTER TABLE account ADD COLUMN public_code TEXT;

CREATE UNIQUE INDEX account_public_code_unique ON account (public_code);

-- 기존 계정 백필 — pre-launch 소량 전제. random()은 CSPRNG가 아니나 백필 한정 허용,
-- 신규 계정은 앱(generateAccountCode, CSPRNG)이 생성한다.
DO
$$
    DECLARE
        row_id UUID;
        chars  TEXT := '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        code   TEXT;
        i      INT;
    BEGIN
        FOR row_id IN SELECT id FROM account WHERE public_code IS NULL
            LOOP
                LOOP
                    code := '';
                    FOR i IN 1..8
                        LOOP
                            code := code || substr(chars, 1 + floor(random() * 58)::int, 1);
                        END LOOP;
                    BEGIN
                        UPDATE account SET public_code = code, updated_at = now() WHERE id = row_id;
                        EXIT;
                    EXCEPTION
                        WHEN unique_violation THEN NULL; -- 충돌 시 재생성
                    END;
                END LOOP;
            END LOOP;
    END
$$;

ALTER TABLE account ALTER COLUMN public_code SET NOT NULL;
ALTER TABLE account
    ADD CONSTRAINT account_public_code_sane CHECK (length(btrim(public_code)) BETWEEN 6 AND 64);

COMMENT ON COLUMN account.public_code IS '공개 작성자 코드 (Base58 8자)';
```

- [x] **Step 2: 로컬 DB 적용 확인**

Run: `npm run db:reset`
Expected: 전 마이그레이션 재적용 성공 (에러 없이 종료)

- [x] **Step 3: Prisma Account 모델 갱신**

`prisma/schema.prisma`의 `model Account` 블록에 필드·인덱스 추가 (`displayName` 아래, `@@unique(phoneNumber...)` 위):

```prisma
  publicCode            String            @map("public_code") // 공개 작성자 코드 (Base58 8자)
```

`@@map("account")` 위 인덱스 블록에 추가:

```prisma
  @@unique([publicCode], map: "account_public_code_unique")
```

Run: `npx prisma validate && npm run db:generate`
Expected: 둘 다 성공

- [x] **Step 4: 실패하는 테스트 작성**

`tests/modules/auth/lib/account.public-code.test.ts` 생성:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const accountCreate = vi.fn();
const identityCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        account: { create: accountCreate },
        accountIdentity: { create: identityCreate },
      }),
  },
}));

import { createAccountFromSignup } from "@/modules/auth/lib/account";
import { ACCOUNT_CODE_ALPHABET, ACCOUNT_CODE_LENGTH } from "@/lib/public-code";

function p2002(target: string) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

const signupInput = {
  provider: "kakao" as const,
  providerUserId: "u-1",
  email: null,
  displayName: "덕후",
};

beforeEach(() => {
  accountCreate.mockReset();
  identityCreate.mockReset();
  identityCreate.mockResolvedValue({});
});

describe("createAccountFromSignup — publicCode", () => {
  it("Base58 8자 publicCode를 생성해 전달한다", async () => {
    accountCreate.mockImplementation(async ({ data }) => data);
    await createAccountFromSignup(signupInput);

    const data = accountCreate.mock.calls[0][0].data;
    expect(data.publicCode).toHaveLength(ACCOUNT_CODE_LENGTH);
    expect(data.publicCode).toMatch(new RegExp(`^[${ACCOUNT_CODE_ALPHABET}]+$`));
  });

  it("public_code 충돌(P2002)이면 재생성해 재시도한다", async () => {
    accountCreate
      .mockRejectedValueOnce(p2002("account_public_code_unique"))
      .mockImplementationOnce(async ({ data }) => data);

    await createAccountFromSignup(signupInput);
    expect(accountCreate).toHaveBeenCalledTimes(2);

    const first = accountCreate.mock.calls[0][0].data.publicCode;
    const second = accountCreate.mock.calls[1][0].data.publicCode;
    expect(first).not.toBe(second);
  });

  it("public_code 외 unique 위반은 즉시 전파한다", async () => {
    accountCreate.mockRejectedValue(p2002("account_identity_provider_uq"));
    await expect(createAccountFromSignup(signupInput)).rejects.toThrow();
    expect(accountCreate).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 5: 실패 확인**

Run: `npx vitest run tests/modules/auth/lib/account.public-code.test.ts`
Expected: FAIL — `data.publicCode`가 `undefined` (아직 미구현)

- [x] **Step 6: `modules/auth/lib/account.ts` 구현**

파일 상단 import에 추가:

```ts
import { Prisma } from "@prisma/client";
import { generateAccountCode } from "@/lib/public-code";
```

`createAccountFromSignup` 본문을 다음으로 교체 (함수 시그니처·JSDoc은 유지):

```ts
const MAX_CODE_RETRY = 3;

// public_code 충돌만 재시도 대상 — 그 외 unique(신원 중복 등)는 즉시 전파.
// target 판별은 runWithUniqueCodeGuard(products) 선례와 동일하게 인덱스명 includes.
function isPublicCodeConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    ((error.meta?.target as string | string[] | undefined) ?? "")
      .toString()
      .includes("public_code")
  );
}

export async function createAccountFromSignup(input: {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  displayName: string;
}): Promise<Account> {
  // public_code 충돌(P2002) 재시도는 트랜잭션 *바깥*에서 — Postgres는 명시적 트랜잭션 안에서
  // 에러가 나면 tx 전체를 abort하므로(25P02) 같은 tx 안 재시도는 동작하지 않는다.
  // 시도마다 새 트랜잭션을 연다 (collection.createCollection 선례).
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            id: uuidv7(),
            email: input.email,
            displayName: input.displayName,
            publicCode: generateAccountCode(),
          },
        });
        await tx.accountIdentity.create({
          data: {
            accountId: account.id,
            provider: input.provider,
            providerUserId: input.providerUserId,
          },
        });
        return account;
      });
    } catch (error) {
      if (isPublicCodeConflict(error) && attempt < MAX_CODE_RETRY - 1) continue;
      throw error;
    }
  }
}
```

- [x] **Step 7: 통과 확인 + 전체 회귀**

Run: `npx vitest run tests/modules/auth`
Expected: 신규 3케이스 포함 전부 PASS (기존 auth 테스트 회귀 없음 — 기존 테스트의 create 픽스처가 publicCode 부재로 깨지면 해당 fake의 반환값에 영향 없는지 확인: `createAccountFromSignup`의 기존 테스트가 있다면 create 인자 검증에 `publicCode` 기대를 추가)

Run: `npm run typecheck`
Expected: 에러 0

- [x] **Step 8: 커밋**

```bash
git add supabase/migrations prisma/schema.prisma modules/auth/lib/account.ts tests/modules/auth/lib/account.public-code.test.ts
git commit -m "feat: account.public_code 공개 작성자 코드 도입"
```

---

### Task 3: `init_notice` 마이그레이션 + Prisma Notice 모델

**Files:**
- Create: `supabase/migrations/<타임스탬프>_init_notice.sql` (`supabase migration new init_notice`)
- Modify: `prisma/schema.prisma` (Notice 모델 추가 — Account 모델 아래)

**Interfaces:**
- Consumes: 없음
- Produces: Prisma `Notice` 모델 (`id: BigInt, publicCode: string, category: string, title: string, body: string, isPinned: boolean, deletedAt: Date|null, createdAt/updatedAt: Date, createdBy/updatedBy: string|null`) — Task 4·5가 사용

- [x] **Step 1: 마이그레이션 작성**

Run: `supabase migration new init_notice`

```sql
-- ============================================================================
-- init_notice: 공지사항 도메인
--   - admin 전용 단방향 문서(댓글·신고·사진 없음), soft delete(deleted_at)
--   - 고정(is_pinned) 전역 최대 2개는 앱 정책 — advisory xact lock으로 직렬화
--   - 인가: 앱 DAL(requireAdmin). RLS 미적용(공개물) — 스펙 §GRANT/RLS
--   - 스펙: docs/superpowers/specs/2026-07-19-community-design.md
-- ============================================================================

CREATE TABLE notice
(
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    public_code TEXT        NOT NULL,
    category    TEXT        NOT NULL DEFAULT 'general',
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    is_pinned   BOOLEAN     NOT NULL DEFAULT false,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT
);

ALTER TABLE notice
    ADD CONSTRAINT notice_public_code_sane CHECK (length(btrim(public_code)) BETWEEN 8 AND 64);

CREATE UNIQUE INDEX notice_public_code_unique ON notice (public_code);
CREATE INDEX notice_created_at_idx ON notice (created_at);
CREATE INDEX notice_updated_at_idx ON notice (updated_at);

COMMENT ON TABLE notice IS '공지사항';
COMMENT ON COLUMN notice.id IS 'PK';
COMMENT ON COLUMN notice.public_code IS '공개 URL 코드 (base62 12자)';
COMMENT ON COLUMN notice.category IS '카테고리 (general | event — 앱 zod 검증)';
COMMENT ON COLUMN notice.title IS '제목';
COMMENT ON COLUMN notice.body IS '본문 (plain text)';
COMMENT ON COLUMN notice.is_pinned IS '상단 고정 여부 (전역 최대 2개 — 앱 정책)';
COMMENT ON COLUMN notice.deleted_at IS '삭제 시각 (soft delete)';
COMMENT ON COLUMN notice.created_at IS '생성일';
COMMENT ON COLUMN notice.created_by IS '생성자';
COMMENT ON COLUMN notice.updated_at IS '수정일';
COMMENT ON COLUMN notice.updated_by IS '수정자';

-- GRANT — app 롤만(Data API 미노출), DELETE 미부여(soft delete 강제)
REVOKE ALL ON notice FROM anon, authenticated, app;
GRANT SELECT, INSERT, UPDATE ON notice TO app;
```

- [x] **Step 2: 적용 + 제약 검증**

Run: `npm run db:reset`
Expected: 성공

검증 SQL (Supabase Studio SQL Editor 또는 psql):

```sql
-- CHECK·인덱스·GRANT 존재 확인
SELECT conname FROM pg_constraint WHERE conrelid = 'notice'::regclass;
-- 기대: notice_pkey, notice_public_code_sane
SELECT indexname FROM pg_indexes WHERE tablename = 'notice';
-- 기대: notice_pkey, notice_public_code_unique, notice_created_at_idx, notice_updated_at_idx
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'notice' AND grantee = 'app';
-- 기대: SELECT, INSERT, UPDATE (DELETE 없음)
```

- [x] **Step 3: Prisma 모델 추가**

`prisma/schema.prisma`의 `model Account` 블록 아래에 추가:

```prisma
model Notice {
  id         BigInt    @id @default(autoincrement())
  publicCode String    @map("public_code")
  category   String    @default("general") // 'general' | 'event' — 앱 zod 검증
  title      String
  body       String
  isPinned   Boolean   @default(false) @map("is_pinned")
  deletedAt  DateTime? @map("deleted_at") @db.Timestamptz(6)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  createdBy  String?   @map("created_by")
  updatedAt  DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)
  updatedBy  String?   @map("updated_by")

  @@unique([publicCode], map: "notice_public_code_unique")
  @@index([createdAt], map: "notice_created_at_idx")
  @@index([updatedAt], map: "notice_updated_at_idx")
  @@map("notice")
}
```

Run: `npx prisma validate && npm run db:generate`
Expected: 성공

Run: `npm run typecheck`
Expected: 에러 0

- [x] **Step 4: 커밋**

```bash
git add supabase/migrations prisma/schema.prisma
git commit -m "feat: 공지사항 테이블 마이그레이션·Prisma 모델 추가"
```

---

### Task 4: notices 도메인 코어 (types · schema · transform · queries)

**Files:**
- Create: `modules/notices/types.ts`
- Create: `modules/notices/lib/schema.ts`
- Create: `modules/notices/lib/transform.ts`
- Create: `modules/notices/lib/queries.ts`
- Test: `tests/modules/notices/lib/schema.test.ts`, `tests/modules/notices/lib/transform.test.ts`, `tests/modules/notices/lib/queries.test.ts`

**Interfaces:**
- Consumes: Prisma `Notice` (Task 3)
- Produces:
  - `types.ts`: `Notice` DTO(`{id:number, publicCode:string, category:NoticeCategory, title:string, body:string, isPinned:boolean, createdAt:string, updatedAt:string}`), `NOTICE_CATEGORIES = ["general","event"]`, `NOTICE_CATEGORY_LABELS`
  - `schema.ts`: `noticeCreateSchema`, `noticeUpdateSchema`, `NoticeCreateInput`, `NoticeUpdateInput`, `NOTICE_TITLE_MAX = 100`, `NOTICE_BODY_MAX = 10000`, `NOTICE_PIN_LIMIT = 2`
  - `transform.ts`: `toNotice(row: PrismaNotice): Notice`
  - `queries.ts`: `listNotices(): Promise<Notice[]>`, `listHomeNotices(limit?): Promise<Notice[]>`, `getNoticeByPublicCode(code): Promise<Notice|null>`, `getNoticeById(id): Promise<Notice|null>`

- [x] **Step 1: types.ts 작성**

```ts
export const NOTICE_CATEGORIES = ["general", "event"] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  general: "일반",
  event: "이벤트",
};

export type Notice = {
  id: number;
  publicCode: string;
  category: NoticeCategory;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};
```

- [x] **Step 2: 실패하는 schema 테스트 작성**

`tests/modules/notices/lib/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  NOTICE_BODY_MAX,
  NOTICE_PIN_LIMIT,
  NOTICE_TITLE_MAX,
  noticeCreateSchema,
  noticeUpdateSchema,
} from "@/modules/notices/lib/schema";

describe("noticeCreateSchema", () => {
  const valid = { title: "점검 안내", body: "내일 새벽 점검이 있습니다." };

  it("정상 입력을 통과시키고 기본값을 채운다", () => {
    const parsed = noticeCreateSchema.parse(valid);
    expect(parsed.category).toBe("general");
    expect(parsed.isPinned).toBe(false);
  });

  it("입력을 trim하고 공백만인 값은 거부한다", () => {
    expect(noticeCreateSchema.parse({ ...valid, title: "  공지  " }).title).toBe(
      "공지",
    );
    expect(() =>
      noticeCreateSchema.parse({ ...valid, title: "   " }),
    ).toThrow();
    expect(() => noticeCreateSchema.parse({ ...valid, body: "\n\t " })).toThrow();
  });

  it("길이 상한(제목 100·본문 10,000)을 강제한다", () => {
    expect(() =>
      noticeCreateSchema.parse({ ...valid, title: "가".repeat(NOTICE_TITLE_MAX + 1) }),
    ).toThrow();
    expect(() =>
      noticeCreateSchema.parse({ ...valid, body: "가".repeat(NOTICE_BODY_MAX + 1) }),
    ).toThrow();
    expect(
      noticeCreateSchema.parse({ ...valid, title: "가".repeat(NOTICE_TITLE_MAX) })
        .title,
    ).toHaveLength(NOTICE_TITLE_MAX);
  });

  it("카테고리는 general·event만 허용한다", () => {
    expect(
      noticeCreateSchema.parse({ ...valid, category: "event" }).category,
    ).toBe("event");
    expect(() =>
      noticeCreateSchema.parse({ ...valid, category: "notice" }),
    ).toThrow();
  });
});

describe("noticeUpdateSchema", () => {
  it("id 양의 정수를 요구한다", () => {
    const valid = {
      id: 1,
      category: "general",
      title: "공지",
      body: "본문",
      isPinned: true,
    };
    expect(noticeUpdateSchema.parse(valid).id).toBe(1);
    expect(() => noticeUpdateSchema.parse({ ...valid, id: 0 })).toThrow();
  });
});

it("NOTICE_PIN_LIMIT은 2다(팬카페 필독 선례)", () => {
  expect(NOTICE_PIN_LIMIT).toBe(2);
});
```

Run: `npx vitest run tests/modules/notices/lib/schema.test.ts`
Expected: FAIL — 모듈 없음

- [x] **Step 3: schema.ts 구현**

```ts
import { z } from "zod";
import { NOTICE_CATEGORIES } from "../types";

export const NOTICE_TITLE_MAX = 100;
export const NOTICE_BODY_MAX = 10_000;
// 상단 고정 전역 최대 개수 — 팬카페 필독 공지 선례 (스펙 §열린 결정 7)
export const NOTICE_PIN_LIMIT = 2;

const titleSchema = z
  .string()
  .trim()
  .min(1, "제목을 입력해주세요")
  .max(NOTICE_TITLE_MAX, `제목은 ${NOTICE_TITLE_MAX}자 이내여야 합니다`);

const bodySchema = z
  .string()
  .trim()
  .min(1, "본문을 입력해주세요")
  .max(NOTICE_BODY_MAX, `본문은 ${NOTICE_BODY_MAX.toLocaleString()}자 이내여야 합니다`);

export const noticeCreateSchema = z.object({
  category: z.enum(NOTICE_CATEGORIES).default("general"),
  title: titleSchema,
  body: bodySchema,
  isPinned: z.boolean().default(false),
});

export const noticeUpdateSchema = z.object({
  id: z.number().int().positive(),
  category: z.enum(NOTICE_CATEGORIES),
  title: titleSchema,
  body: bodySchema,
  isPinned: z.boolean(),
});

export type NoticeCreateInput = z.input<typeof noticeCreateSchema>;
export type NoticeUpdateInput = z.input<typeof noticeUpdateSchema>;
```

Run: `npx vitest run tests/modules/notices/lib/schema.test.ts`
Expected: PASS

- [x] **Step 4: transform 테스트 + 구현**

`tests/modules/notices/lib/transform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Notice as PrismaNotice } from "@prisma/client";

import { toNotice } from "@/modules/notices/lib/transform";

describe("toNotice", () => {
  it("Prisma row를 DTO로 변환한다 (BigInt→number, Date→ISO)", () => {
    const row = {
      id: 3n,
      publicCode: "AbCdEfGh1234",
      category: "event",
      title: "이벤트",
      body: "본문",
      isPinned: true,
      deletedAt: null,
      createdAt: new Date("2026-07-19T00:00:00Z"),
      createdBy: "mock-admin",
      updatedAt: new Date("2026-07-19T01:00:00Z"),
      updatedBy: "mock-admin",
    } satisfies PrismaNotice;

    expect(toNotice(row)).toEqual({
      id: 3,
      publicCode: "AbCdEfGh1234",
      category: "event",
      title: "이벤트",
      body: "본문",
      isPinned: true,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T01:00:00.000Z",
    });
  });
});
```

`modules/notices/lib/transform.ts`:

```ts
import "server-only";

import type { Notice as PrismaNotice } from "@prisma/client";
import type { Notice, NoticeCategory } from "../types";

// deletedAt·created_by류는 DTO 미포함 — 공개·admin 화면 공통으로 노출 불필요.
export function toNotice(row: PrismaNotice): Notice {
  return {
    id: Number(row.id),
    publicCode: row.publicCode,
    category: row.category as NoticeCategory,
    title: row.title,
    body: row.body,
    isPinned: row.isPinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

Run: `npx vitest run tests/modules/notices/lib/transform.test.ts`
Expected: PASS

- [x] **Step 5: queries 테스트 작성 (실패 확인 포함)**

`tests/modules/notices/lib/queries.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { notice: { findMany, findFirst } },
}));

const row = {
  id: 1n,
  publicCode: "AbCdEfGh1234",
  category: "general",
  title: "공지",
  body: "본문",
  isPinned: false,
  deletedAt: null,
  createdAt: new Date("2026-07-19T00:00:00Z"),
  createdBy: null,
  updatedAt: new Date("2026-07-19T00:00:00Z"),
  updatedBy: null,
};

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("USE_MOCK_DATA", "false");
  findMany.mockReset().mockResolvedValue([row]);
  findFirst.mockReset().mockResolvedValue(row);
});

describe("notices queries", () => {
  it("mock 모드에선 빈 결과를 반환한다 (DB 전용 도메인)", async () => {
    vi.stubEnv("USE_MOCK_DATA", "true");
    const q = await import("@/modules/notices/lib/queries");
    expect(await q.listNotices()).toEqual([]);
    expect(await q.listHomeNotices()).toEqual([]);
    expect(await q.getNoticeByPublicCode("AbCdEfGh1234")).toBeNull();
    expect(await q.getNoticeById(1)).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("listNotices — 삭제 제외 + 고정 우선 정렬 인자로 조회한다", async () => {
    const { listNotices } = await import("@/modules/notices/lib/queries");
    const result = await listNotices();

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    expect(result[0].publicCode).toBe("AbCdEfGh1234");
  });

  it("listHomeNotices — 기본 2건 take", async () => {
    const { listHomeNotices } = await import("@/modules/notices/lib/queries");
    await listHomeNotices();
    expect(findMany.mock.calls[0][0].take).toBe(2);
  });

  it("getNoticeByPublicCode — 삭제 공지는 조회 조건에서 제외된다", async () => {
    const { getNoticeByPublicCode } = await import(
      "@/modules/notices/lib/queries"
    );
    await getNoticeByPublicCode("AbCdEfGh1234");
    expect(findFirst).toHaveBeenCalledWith({
      where: { publicCode: "AbCdEfGh1234", deletedAt: null },
    });
  });

  it("getNoticeById — BigInt 변환 + 삭제 제외", async () => {
    const { getNoticeById } = await import("@/modules/notices/lib/queries");
    await getNoticeById(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 1n, deletedAt: null },
    });
  });
});
```

Run: `npx vitest run tests/modules/notices/lib/queries.test.ts`
Expected: FAIL — 모듈 없음

- [x] **Step 6: queries.ts 구현**

```ts
import "server-only";

import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { toNotice } from "./transform";
import type { Notice } from "../types";

// 공지 정렬 단일 진실 — 고정 우선 → 최신순 → id 안정화 (스펙 §데이터 모델)
const NOTICE_ORDER = [
  { isPinned: "desc" as const },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

// 커뮤니티는 mock 미지원(DB 전용) — mock 모드에선 빈 결과로 화면만 유지한다.

export async function listNotices(): Promise<Notice[]> {
  if (env.USE_MOCK_DATA) return [];
  const rows = await db.notice.findMany({
    where: { deletedAt: null },
    orderBy: NOTICE_ORDER,
  });
  return rows.map(toNotice);
}

export async function listHomeNotices(limit = 2): Promise<Notice[]> {
  if (env.USE_MOCK_DATA) return [];
  const rows = await db.notice.findMany({
    where: { deletedAt: null },
    orderBy: NOTICE_ORDER,
    take: limit,
  });
  return rows.map(toNotice);
}

export async function getNoticeByPublicCode(
  code: string,
): Promise<Notice | null> {
  if (env.USE_MOCK_DATA) return null;
  const row = await db.notice.findFirst({
    where: { publicCode: code, deletedAt: null },
  });
  return row ? toNotice(row) : null;
}

export async function getNoticeById(id: number): Promise<Notice | null> {
  if (env.USE_MOCK_DATA) return null;
  const row = await db.notice.findFirst({
    where: { id: BigInt(id), deletedAt: null },
  });
  return row ? toNotice(row) : null;
}
```

- [x] **Step 7: 통과 + 타입 확인**

Run: `npx vitest run tests/modules/notices`
Expected: 전부 PASS

Run: `npm run typecheck`
Expected: 에러 0

- [x] **Step 8: 커밋**

```bash
git add modules/notices tests/modules/notices
git commit -m "feat: 공지사항 도메인 코어(스키마·조회·변환) 추가"
```

---

### Task 5: notices admin 액션 — CRUD · 고정 상한 · soft delete

**Files:**
- Create: `modules/notices/actions.ts`
- Test: `tests/modules/notices/actions.test.ts`

**Interfaces:**
- Consumes: Task 1 `generatePublicCode`, Task 4 스키마·`NOTICE_PIN_LIMIT`·`toNotice`, `requireAdmin(): Promise<void>`(기존 no-op 가드)
- Produces: `createNotice(input: NoticeCreateInput): Promise<Notice>`, `updateNotice(input: NoticeUpdateInput): Promise<Notice>`, `deleteNotice(id: number): Promise<void>` — Task 7 폼이 사용

- [x] **Step 1: 실패하는 액션 테스트 작성**

`tests/modules/notices/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const queryRaw = vi.fn();
const count = vi.fn();
const create = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: queryRaw,
        notice: { count, create, findFirst, update, updateMany },
      }),
    notice: { updateMany },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const baseRow = {
  id: 1n,
  publicCode: "AbCdEfGh1234",
  category: "general",
  title: "공지",
  body: "본문",
  isPinned: false,
  deletedAt: null,
  createdAt: new Date("2026-07-19T00:00:00Z"),
  createdBy: "mock-admin",
  updatedAt: new Date("2026-07-19T00:00:00Z"),
  updatedBy: "mock-admin",
};

function p2002(target: string) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("USE_MOCK_DATA", "false");
  queryRaw.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
  create.mockReset().mockResolvedValue(baseRow);
  findFirst.mockReset().mockResolvedValue(baseRow);
  update.mockReset().mockResolvedValue(baseRow);
  updateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("createNotice", () => {
  const input = { title: "공지", body: "본문" };

  it("mock 모드에선 에러를 던진다 (DB 전용)", async () => {
    vi.stubEnv("USE_MOCK_DATA", "true");
    const { createNotice } = await import("@/modules/notices/actions");
    await expect(createNotice(input)).rejects.toThrow(/mock 모드/);
  });

  it("public_code와 mock-admin 작성자를 채워 생성한다", async () => {
    const { createNotice } = await import("@/modules/notices/actions");
    const result = await createNotice(input);

    const data = create.mock.calls[0][0].data;
    expect(data.publicCode).toHaveLength(12);
    expect(data.createdBy).toBe("mock-admin");
    expect(data.updatedBy).toBe("mock-admin");
    expect(result.id).toBe(1);
  });

  it("고정 생성 시 advisory lock 후 상한(2)을 검증한다", async () => {
    count.mockResolvedValue(2);
    const { createNotice } = await import("@/modules/notices/actions");
    await expect(
      createNotice({ ...input, isPinned: true }),
    ).rejects.toThrow(/최대 2개/);
    expect(queryRaw).toHaveBeenCalledTimes(1); // pg_advisory_xact_lock
    expect(create).not.toHaveBeenCalled();
  });

  it("비고정 생성은 lock·카운트를 건너뛴다", async () => {
    const { createNotice } = await import("@/modules/notices/actions");
    await createNotice(input);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("public_code 충돌(P2002)이면 재생성 재시도한다", async () => {
    create
      .mockRejectedValueOnce(p2002("notice_public_code_unique"))
      .mockResolvedValueOnce(baseRow);
    const { createNotice } = await import("@/modules/notices/actions");
    await createNotice(input);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("updateNotice", () => {
  const input = {
    id: 1,
    category: "general" as const,
    title: "수정",
    body: "본문",
    isPinned: true,
  };

  it("존재하지 않거나 삭제된 공지는 에러", async () => {
    findFirst.mockResolvedValue(null);
    const { updateNotice } = await import("@/modules/notices/actions");
    await expect(updateNotice(input)).rejects.toThrow(/찾을 수 없습니다/);
  });

  it("고정 전환 시 자기 자신을 제외하고 상한을 센다", async () => {
    const { updateNotice } = await import("@/modules/notices/actions");
    await updateNotice(input);
    expect(count).toHaveBeenCalledWith({
      where: { isPinned: true, deletedAt: null, id: { not: 1n } },
    });
  });
});

describe("deleteNotice", () => {
  it("soft delete — deletedAt 스탬프만 남긴다", async () => {
    const { deleteNotice } = await import("@/modules/notices/actions");
    await deleteNotice(1);
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: 1n, deletedAt: null });
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  it("이미 삭제됐거나 없으면 에러 (갱신 0행)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const { deleteNotice } = await import("@/modules/notices/actions");
    await expect(deleteNotice(1)).rejects.toThrow(/찾을 수 없습니다/);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run tests/modules/notices/actions.test.ts`
Expected: FAIL — `@/modules/notices/actions` 없음

- [x] **Step 3: actions.ts 구현**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generatePublicCode } from "@/lib/public-code";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import {
  NOTICE_PIN_LIMIT,
  noticeCreateSchema,
  noticeUpdateSchema,
  type NoticeCreateInput,
  type NoticeUpdateInput,
} from "./lib/schema";
import { toNotice } from "./lib/transform";
import type { Notice } from "./types";

const MOCK_DISABLED = "mock 모드에서는 공지 기능을 사용할 수 없습니다 (dev:all로 실행)";
// TEMP-LOGIN-BYPASS: admin 실인증 도입 시 실제 관리자 식별자로 교체 (스펙 §후속 #3)
const TEMP_ADMIN = "mock-admin";
const MAX_CODE_RETRY = 3;

function isNoticeCodeConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    ((error.meta?.target as string | string[] | undefined) ?? "")
      .toString()
      .includes("notice_public_code")
  );
}

// 고정 0건이면 잠글 행이 없어 FOR UPDATE로는 상한을 보장할 수 없음(팬텀 문제) →
// advisory xact lock으로 고정 mutation 전체를 직렬화한다. tx 종료 시 자동 해제.
// (스펙 §데이터 모델 — notice)
async function assertPinCapacity(
  tx: Prisma.TransactionClient,
  excludeId?: bigint,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('notice_pin'))`;
  const pinned = await tx.notice.count({
    where: {
      isPinned: true,
      deletedAt: null,
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
  });
  if (pinned >= NOTICE_PIN_LIMIT) {
    throw new Error(`상단 고정은 최대 ${NOTICE_PIN_LIMIT}개까지 가능합니다`);
  }
}

function revalidateNoticePaths(publicCode?: string): void {
  revalidatePath("/");
  revalidatePath("/notices");
  revalidatePath("/admin/notices");
  if (publicCode) revalidatePath(`/notices/${publicCode}`);
}

export async function createNotice(input: NoticeCreateInput): Promise<Notice> {
  await requireAdmin();
  if (env.USE_MOCK_DATA) throw new Error(MOCK_DISABLED);
  const data = noticeCreateSchema.parse(input);

  // code 충돌(P2002) 재시도는 트랜잭션 *바깥*에서 — 명시적 tx 안의 에러는 tx 전체를 abort한다.
  // 시도마다 새 tx를 열고, 고정 상한 검증(advisory lock)도 그 tx 안에서 함께 수행한다
  // (lock은 tx 종료 시 해제되므로 시도마다 재획득 — 정상).
  for (let attempt = 0; ; attempt++) {
    try {
      const row = await db.$transaction(async (tx) => {
        if (data.isPinned) await assertPinCapacity(tx);
        return tx.notice.create({
          data: {
            publicCode: generatePublicCode(),
            category: data.category,
            title: data.title,
            body: data.body,
            isPinned: data.isPinned,
            createdBy: TEMP_ADMIN,
            updatedBy: TEMP_ADMIN,
          },
        });
      });
      revalidateNoticePaths(row.publicCode);
      return toNotice(row);
    } catch (error) {
      if (isNoticeCodeConflict(error) && attempt < MAX_CODE_RETRY - 1) continue;
      throw error;
    }
  }
}

export async function updateNotice(input: NoticeUpdateInput): Promise<Notice> {
  await requireAdmin();
  if (env.USE_MOCK_DATA) throw new Error(MOCK_DISABLED);
  const data = noticeUpdateSchema.parse(input);
  const id = BigInt(data.id);

  const row = await db.$transaction(async (tx) => {
    if (data.isPinned) await assertPinCapacity(tx, id);

    // 원자적 조건부 UPDATE — 존재 확인과 쓰기를 분리하면 그 사이 동시 삭제가 끼어들어
    // 삭제된 행을 덮어쓰는 TOCTOU가 생긴다. soft delete 필터를 쓰기 조건에 포함한다.
    const updated = await tx.notice.updateMany({
      where: { id, deletedAt: null },
      data: {
        category: data.category,
        title: data.title,
        body: data.body,
        isPinned: data.isPinned,
        updatedAt: new Date(),
        updatedBy: TEMP_ADMIN,
      },
    });
    if (updated.count === 0) throw new Error("공지를 찾을 수 없습니다");

    return tx.notice.findFirstOrThrow({ where: { id } });
  });

  revalidateNoticePaths(row.publicCode);
  return toNotice(row);
}

export async function deleteNotice(id: number): Promise<void> {
  await requireAdmin();
  if (env.USE_MOCK_DATA) throw new Error(MOCK_DISABLED);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("유효하지 않은 공지 ID 입니다");
  }

  // soft delete — 공지는 대외 공유 문서라 게시 사실을 보존한다 (스펙 §데이터 모델)
  const result = await db.notice.updateMany({
    where: { id: BigInt(id), deletedAt: null },
    data: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: TEMP_ADMIN },
  });
  if (result.count === 0) throw new Error("공지를 찾을 수 없습니다");

  revalidateNoticePaths();
}
```

- [x] **Step 4: 통과 확인**

Run: `npx vitest run tests/modules/notices`
Expected: 전부 PASS

Run: `npm run typecheck`
Expected: 에러 0

- [x] **Step 5: 커밋**

```bash
git add modules/notices/actions.ts tests/modules/notices/actions.test.ts
git commit -m "feat: 공지사항 admin 액션 — CRUD·고정 상한·soft delete"
```

---

### Task 6: 공개 페이지(/notices) + 홈 공지 스트립

**Files:**
- Create: `modules/notices/components/HomeNoticeStrip.tsx`
- Create: `app/(shop)/notices/page.tsx`
- Create: `app/(shop)/notices/[publicCode]/page.tsx`
- Modify: `app/(shop)/page.tsx` (스트립 삽입)

**Interfaces:**
- Consumes: Task 4 `listNotices`·`listHomeNotices`·`getNoticeByPublicCode`, `NOTICE_CATEGORY_LABELS`, `formatKstDate`(기존 `lib/datetime`)
- Produces: 공개 라우트 `/notices`, `/notices/[publicCode]` — Plan 2의 커뮤니티 페이지가 링크

- [x] **Step 1: HomeNoticeStrip 작성**

`modules/notices/components/HomeNoticeStrip.tsx` (async server component — 인터랙션 없음):

```tsx
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { listHomeNotices } from "../lib/queries";
import { NOTICE_CATEGORY_LABELS } from "../types";

// 홈 상단 공지 스트립 — 위버스의 공지 발견성 교훈(조사 ①): 목록 페이지만으론 아무도 안 본다.
export async function HomeNoticeStrip() {
  const notices = await listHomeNotices(2);
  if (notices.length === 0) return null;

  return (
    <div className="space-y-1 rounded-md border border-border bg-card px-4 py-3">
      {notices.map((notice) => (
        <Link
          key={notice.id}
          href={`/notices/${notice.publicCode}`}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Megaphone aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
            {NOTICE_CATEGORY_LABELS[notice.category]}
          </span>
          <span className="truncate">{notice.title}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [x] **Step 2: 홈에 삽입**

`app/(shop)/page.tsx` — import 추가:

```tsx
import { HomeNoticeStrip } from "@/modules/notices/components/HomeNoticeStrip";
```

`return (` 바로 안 `<div className="space-y-6">`의 첫 자식으로 추가:

```tsx
      <Suspense fallback={null}>
        <HomeNoticeStrip />
      </Suspense>
```

- [x] **Step 3: 공지 목록 페이지**

`app/(shop)/notices/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Pin } from "lucide-react";
import { formatKstDate } from "@/lib/datetime";
import { listNotices } from "@/modules/notices/lib/queries";
import { NOTICE_CATEGORY_LABELS } from "@/modules/notices/types";

export const metadata: Metadata = { title: "공지사항" };

export default async function NoticesPage() {
  const notices = await listNotices();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">공지사항</h1>

      {notices.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          등록된 공지가 없습니다
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link
                href={`/notices/${notice.publicCode}`}
                className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                {notice.isPinned && (
                  <Pin aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                )}
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {NOTICE_CATEGORY_LABELS[notice.category]}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {notice.title}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {formatKstDate(notice.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [x] **Step 4: 공지 상세 페이지**

`app/(shop)/notices/[publicCode]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatKstDate } from "@/lib/datetime";
import { getNoticeByPublicCode } from "@/modules/notices/lib/queries";
import { NOTICE_CATEGORY_LABELS } from "@/modules/notices/types";

type Props = { params: Promise<{ publicCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicCode } = await params;
  const notice = await getNoticeByPublicCode(publicCode);
  return { title: notice ? `공지 — ${notice.title}` : "공지사항" };
}

export default async function NoticeDetailPage({ params }: Props) {
  const { publicCode } = await params;
  // 삭제·미존재 공지는 동일 404 (soft delete는 쿼리에서 이미 제외)
  const notice = await getNoticeByPublicCode(publicCode);
  if (!notice) notFound();

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/notices"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
        공지사항 목록
      </Link>

      <header className="space-y-2 border-b border-border pb-4">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {NOTICE_CATEGORY_LABELS[notice.category]}
        </span>
        <h1 className="text-2xl font-bold">{notice.title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatKstDate(notice.createdAt)}
        </p>
      </header>

      {/* plain text 렌더 — rich text 미지원 (XSS 표면 최소화, 스펙 §보안) */}
      <div className="whitespace-pre-wrap leading-relaxed">{notice.body}</div>
    </article>
  );
}
```

- [x] **Step 5: 검증 (lint·typecheck·수동)**

Run: `npm run lint && npm run typecheck`
Expected: 에러 0

Run: `npm run dev` (mock 모드) → `/`와 `/notices` 접속
Expected: 홈은 스트립 없이 정상(빈 결과), `/notices`는 "등록된 공지가 없습니다" — 죽지 않음

- [x] **Step 6: 커밋**

```bash
git add modules/notices/components/HomeNoticeStrip.tsx "app/(shop)/notices" "app/(shop)/page.tsx"
git commit -m "feat: 공지 공개 페이지와 홈 공지 스트립 추가"
```

---

### Task 7: admin 화면(/admin/notices) + 사이드바 항목 + E2E

**Files:**
- Create: `modules/notices/components/NoticesTable.tsx`
- Create: `modules/notices/components/NoticeForm.tsx`
- Create: `app/(admin)/admin/notices/page.tsx`
- Create: `app/(admin)/admin/notices/new/page.tsx`
- Create: `app/(admin)/admin/notices/[id]/edit/page.tsx`
- Modify: `modules/admin/components/AdminSidebar.tsx:30-56` (NAV_ITEMS)

**Interfaces:**
- Consumes: Task 4 쿼리·타입·상수, Task 5 액션. UI는 기존 `@/components/ui/{table,button,card,input,label,textarea,select,dialog,sonner}` (전부 존재 확인됨)
- Produces: admin 라우트 3개 — 이후 계획에서 변경 없음

- [x] **Step 1: NoticesTable 작성** (`TeamsTable` 패턴 미러)

`modules/notices/components/NoticesTable.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKstDate } from "@/lib/datetime";
import { NOTICE_CATEGORY_LABELS } from "../types";
import type { Notice } from "../types";

type Props = {
  notices: Notice[];
};

export function NoticesTable({ notices }: Props) {
  const router = useRouter();

  function navigateTo(id: number) {
    router.push(`/admin/notices/${id}/edit`);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead className="w-12">고정</TableHead>
          <TableHead className="w-20">카테고리</TableHead>
          <TableHead>제목</TableHead>
          <TableHead className="w-28">작성일</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {notices.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="h-24 text-center text-muted-foreground"
            >
              등록된 공지가 없습니다
            </TableCell>
          </TableRow>
        ) : (
          notices.map((notice, index) => (
            <TableRow
              key={notice.id}
              tabIndex={0}
              role="link"
              aria-label={`공지 "${notice.title}" 수정`}
              onClick={() => navigateTo(notice.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigateTo(notice.id);
                }
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
            >
              <TableCell className="text-right text-sm text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell>
                {notice.isPinned ? (
                  <Pin aria-hidden className="h-4 w-4 text-primary" />
                ) : null}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {NOTICE_CATEGORY_LABELS[notice.category]}
              </TableCell>
              <TableCell className="font-medium">{notice.title}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatKstDate(notice.createdAt)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
```

- [x] **Step 2: NoticeForm 작성** (`TeamForm` 패턴 미러 — 삭제 확인 다이얼로그 포함)

`modules/notices/components/NoticeForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createNotice, deleteNotice, updateNotice } from "../actions";
import {
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABELS,
  type Notice,
  type NoticeCategory,
} from "../types";

type Props = {
  mode: "new" | "edit";
  notice?: Notice;
};

export function NoticeForm({ mode, notice }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [category, setCategory] = useState<NoticeCategory>(
    notice?.category ?? "general",
  );
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [isPinned, setIsPinned] = useState(notice?.isPinned ?? false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("제목과 본문을 입력해주세요");
      return;
    }

    startTransition(async () => {
      try {
        if (mode === "edit" && notice) {
          await updateNotice({
            id: notice.id,
            category,
            title,
            body,
            isPinned,
          });
        } else {
          await createNotice({ category, title, body, isPinned });
        }
        router.push("/admin/notices");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : mode === "edit"
              ? "수정에 실패했습니다"
              : "등록에 실패했습니다";
        toast.error(message);
      }
    });
  }

  function handleDelete() {
    if (!notice) return;
    startDeleteTransition(async () => {
      try {
        await deleteNotice(notice.id);
        toast.success(`공지 "${notice.title}" 삭제 완료`);
        setConfirmOpen(false);
        router.push("/admin/notices");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "삭제에 실패했습니다";
        toast.error(message);
      }
    });
  }

  const submitLabel = pending
    ? mode === "edit"
      ? "저장 중..."
      : "등록 중..."
    : mode === "edit"
      ? "저장"
      : "등록";

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>공지 내용</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">카테고리</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as NoticeCategory)}
            >
              <SelectTrigger id="category" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {NOTICE_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 배송 지연 안내"
              maxLength={100}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">
              본문 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="공지 본문 (plain text)"
              rows={12}
              maxLength={10000}
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(event) => setIsPinned(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            상단 고정 (전체 최대 2개)
          </label>

          <div className="flex items-center justify-between gap-2 pt-2">
            {mode === "edit" && notice ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={pending || deleting}
              >
                삭제
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/notices")}
                disabled={pending || deleting}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={pending || deleting || !title.trim() || !body.trim()}
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "edit" && notice ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>공지 삭제</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <p>공지 &quot;{notice.title}&quot;를 삭제하시겠습니까?</p>
                  <p>공개 페이지에서 즉시 내려가며, 데이터는 보존됩니다.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </form>
  );
}
```

- [x] **Step 3: admin 페이지 3개 작성** (teams 페이지 패턴 미러)

`app/(admin)/admin/notices/page.tsx`:

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listNotices } from "@/modules/notices/lib/queries";
import { NoticesTable } from "@/modules/notices/components/NoticesTable";

export default async function AdminNoticesPage() {
  const notices = await listNotices();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">공지사항</h2>
        <Button asChild>
          <Link href="/admin/notices/new">
            <Plus aria-hidden className="mr-0.5 h-4 w-4" />
            신규 공지
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <NoticesTable notices={notices} />
      </div>
    </div>
  );
}
```

`app/(admin)/admin/notices/new/page.tsx`:

```tsx
import { Toaster } from "@/components/ui/sonner";
import { NoticeForm } from "@/modules/notices/components/NoticeForm";

export default function NoticeNewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">신규 공지 등록</h2>
      <NoticeForm mode="new" />
    </div>
  );
}
```

`app/(admin)/admin/notices/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { NoticeForm } from "@/modules/notices/components/NoticeForm";
import { getNoticeById } from "@/modules/notices/lib/queries";

export default async function NoticeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const noticeId = Number(id);
  if (!Number.isInteger(noticeId) || noticeId <= 0) notFound();

  const notice = await getNoticeById(noticeId);
  if (!notice) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">공지 수정</h2>
      <NoticeForm mode="edit" notice={notice} />
    </div>
  );
}
```

- [x] **Step 4: 사이드바 항목 추가**

`modules/admin/components/AdminSidebar.tsx` — import에 `Megaphone` 추가:

```tsx
import {
  LayoutDashboard,
  Megaphone,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User,
  Users,
} from "lucide-react";
```

`NAV_ITEMS` 배열에서 `설정` 항목 **앞**에 추가:

```tsx
  {
    label: "공지사항",
    href: "/admin/notices",
    icon: Megaphone,
    matchPrefix: "/admin/notices",
  },
```

- [x] **Step 5: 정적 검증**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: 전부 그린

- [x] **Step 6: 수동 E2E (풀 스택 모드)**

Run: `npm run dev:all`

체크리스트:
1. `/admin/notices` → 신규 공지 2건 작성(일반 1·이벤트 1, 각각 고정 체크) → 목록에 고정 아이콘 표시
2. 3번째 공지를 고정으로 작성 시도 → "상단 고정은 최대 2개까지 가능합니다" toast 확인
3. `/notices` → 고정 2건이 상단, 카테고리 배지·날짜 표시 확인
4. `/notices/[publicCode]` 상세 → 줄바꿈 보존(whitespace-pre-wrap) 확인
5. `/` 홈 → 상단 스트립에 고정 공지 2건 노출
6. 공지 1건 수정(고정 해제) → 홈 스트립·목록 순서 반영
7. 공지 1건 삭제 → `/notices` 목록에서 사라지고 기존 상세 URL이 404, DB `notice` 행은 `deleted_at` 스탬프로 보존(Supabase Studio 확인)

- [x] **Step 7: 커밋**

```bash
git add modules/notices/components "app/(admin)/admin/notices" modules/admin/components/AdminSidebar.tsx
git commit -m "feat: 공지사항 admin 화면과 사이드바 항목 추가"
```

---

## 계획 자체 점검 결과 (작성 시 확인)

- 스펙 커버리지: Plan 1 범위(§결정 2·3 기반 + notice 관련 전 항목) 커버. 자유게시판·사진·신고·README mock 서술 갱신은 Plan 2·3 소관
- 타입 일관성: `Notice`·`NoticeCategory`·스키마 상수는 Task 4 정의를 Task 5~7이 그대로 사용, `generateAccountCode`는 Task 1 정의를 Task 2가 사용
- 알려진 리스크: ① Prisma `$queryRaw`의 advisory lock 호출은 tx client에서 동작(테스트는 fake로 호출 여부만 검증 — 실동작은 E2E에서 확인) ② 기존 auth 테스트에 `tx.account.create` 인자를 검증하는 케이스가 있으면 `publicCode` 기대 추가 필요(Task 2 Step 7에 명시)
