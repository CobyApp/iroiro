# 인증과 데이터 레이어

## Supabase 클라이언트 3분리

| 파일 | 사용처 | 함수 |
|---|---|---|
| `lib/supabase/server.ts` | RSC, Server Actions, Route Handler | `createServerClient()` |
| `lib/supabase/client.ts` | Client Component (`"use client"`) | `createBrowserClient()` |
| `lib/supabase/middleware.ts` | `middleware.ts`에서만 | `updateSession(request)` |

### 왜 분리하는가
- **server**: 쿠키를 RSC 컨텍스트에서 읽는다. `cookies()` 사용.
- **client**: 브라우저에서 동작. localStorage 자동 처리.
- **middleware**: Edge 런타임. 요청·응답 쿠키 양방향 처리.

각자 쿠키 처리 방식이 다르므로 합치면 깨진다. [Supabase 공식 SSR 가이드](https://supabase.com/docs/guides/auth/server-side/nextjs) 그대로 따른다.

## 세션 흐름 (요청 1회)

```
1. 브라우저 요청
   ↓
2. middleware.ts → updateSession()  (쿠키 갱신만)
   ↓
3. 매칭 layout.tsx 실행
   ├── (shop)/layout — optional auth (UI 표시용 user)
   ├── (admin)/layout — getUser() + isAdmin() 가드
   └── (auth)/layout — 이미 로그인 시 redirect
   ↓
4. 매칭 page.tsx 실행
   └── 멤버 전용이면 getUser() 직접 호출 + redirect
   ↓
5. RSC 렌더링 → Server Actions 호출 가능
```

## RLS 우선

> 정책 작성 규칙(단순성·`(select …)` 성능 래핑·owner 우회·커뮤니티 찬반 근거)은 [rls-best-practices.md](./rls-best-practices.md).

- **노출 스키마·경계 데이터(PII·결제)는 RLS enabled**가 기본. 그 외 도메인 테이블의 RLS 여부는 도메인 관점으로 판단한다(기준: [rls-best-practices.md](./rls-best-practices.md)의 "RLS를 어디에 걸까"). 끌 땐 근거를 남긴다.
- 정책은 `supabase/migrations/` 파일에 SQL로 작성하고 코드와 함께 버전관리한다.
- 클라이언트에서 직접 호출하는 쿼리도 RLS로 보호되어야 한다 — Server Action 안에서 service_role을 함부로 쓰지 말 것.

### ✅ 일반 쿼리
```ts
// modules/products/lib/queries.ts
const supabase = await createServerClient();
const { data } = await supabase.from("products").select("*");
// RLS 정책이 자동 적용됨
```

### ❌ service_role 남용
```ts
// service_role은 신뢰 경계 안에서만 — webhook, 관리자 일괄 작업 등
const supabase = createClient(url, SERVICE_ROLE_KEY);  // 함부로 쓰지 말 것
```

## 접근 경로별 롤과 노출면

> 롤별 권한·소유권 우회 등 *기전*은 [lessons/15](../lessons/15-postgres-roles-and-rls.md). 여기서는 *운영상 어느 경로가 무엇에 닿는가*와 그 결정만 정리한다.
>
> 🔄 **2026-08-01: RLS를 쓰지 않기로 했다.** 방어선은 **GRANT 매트릭스**(비특권 `app` 롤)와 앱 DAL이다 — [db-authorization-review.md](./db-authorization-review.md).

| 접근 경로 | 롤 | GRANT 적용 | order·PII | 카탈로그 |
|---|---|:--:|:--:|:--:|
| 앱(Prisma) — 전환 전 | `postgres`(owner) | **무효**(소유자) | 전체 | 전체 |
| 앱(Prisma) — `app` 롤 전환 후 | `app` | **적용** | GRANT 범위 | 읽기 전체·쓰기 GRANT 범위 |
| 대시보드 SQL Editor | `postgres`(owner) | 무효 | 전체 | 전체 |
| Data API — anon 키 | `anon` | 적용 | ❌ REVOKE됨 | ✅ 공개 읽기 |
| Data API — 로그인 JWT | `authenticated` | 적용 | ❌ REVOKE됨 | ✅ 읽기 |
| Data API — service_role 키 | `service_role` | 기본 GRANT 유지 | ✅ 전체 | ✅ 전체 |

> **앱은 Data API를 쓰지 않는다** — 테이블 쿼리 0건(2026-08-01 실측). 위 Data API 행은
> "열려 있다면 어떻게 되는가"의 기록이며, 실제 앱 트래픽은 Prisma 경로만 밟는다.
> 관리자 판정(`admin`)은 DB가 아니라 앱 DAL(`requireAdmin` → `account.is_admin`)이 한다.

**노출면 결정**
- **order/PII는 Data API 비노출**: `anon`·`authenticated`에서 `REVOKE ALL` → PostgREST로 도달 불가(RLS 이전에 GRANT에서 막힘). 공개 키 경로에 PII를 싣지 않기 위함(CVE-2025-48757 클래스 회피).
- **카탈로그만 Data API 공개 읽기**: `team`/`member`/`product`에 `GRANT SELECT TO anon, authenticated`. 단 자체 인증이라 `authenticated` JWT를 발급하지 않아 실제로는 `anon` 경로만 밟힌다(로그인 사용자의 카탈로그 읽기도 앱에선 `app` 롤).

**`service_role`은 아웃오브밴드 특권 경로 (의도된 결정)**
- `service_role`은 **BYPASSRLS + Supabase 기본 GRANT**를 유지한다 → `REVOKE`/RLS 규율의 대상이 아니라 **order/PII 포함 전체에 닿는 신뢰 경로**다.
- 마이그레이션 `REVOKE`/`GRANT`가 `anon`·`authenticated`·`app`만 명시적으로 좁히고 **`service_role`은 defaults에 맡기는 것이 이 경계의 표현**이다: 고객·앱 경로는 최소권한+RLS로 조이고, **webhook·관리자 수기 보정·일괄 작업**만 `service_role`로 신뢰 경계 안에서 수행한다([rls-best-practices](./rls-best-practices.md)의 "민감 쓰기는 고객 컨텍스트 밖" 원칙과 동일 계열).
- ⚠️ `service_role` 키는 **서버 신뢰 경계 밖으로 절대 노출 금지**(브라우저·클라이언트 번들·로그·`NEXT_PUBLIC_*`). 유출 시 GRANT 규율 밖에서 전체 데이터에 닿는다.
- 더 조이려면: `service_role`도 `REVOKE` 규율에 편입해 필요한 테이블만 남길 수 있으나, webhook/관리자 경로가 요구하는 테이블을 일일이 관리해야 해 현 단계에선 defaults 유지를 택한다.

## R2 (Cloudflare) 통합

### 디렉터리
```
lib/r2/
├── client.ts          AwsClient (S3 호환, region: "auto")
└── presign.ts         업로드/다운로드용 서명 URL 생성
```

### 업로드 흐름 (직접 업로드 패턴)
```
1. 클라이언트 → Server Action 호출 (modules/<도메인>/actions.ts)
2. Server Action → lib/r2/presign.ts로 PUT 서명 URL 발급
3. 클라이언트 → 서명 URL로 R2에 직접 PUT
4. 클라이언트 → 완료 알림 Server Action 호출
5. Server Action → DB에 메타데이터 저장
```
이 패턴은 dub.co의 `lib/storage.ts` 구현을 참고한다 ([references.md](./references.md)).

### ❌ 절대 하지 말 것
- 클라이언트에서 R2 자격증명 노출
- 큰 파일을 Next.js 서버를 거쳐 프록시 (대역폭 비용)

### `next.config.ts`에 R2 도메인 등록
```ts
images: {
  remotePatterns: [{ protocol: "https", hostname: "<bucket>.<account>.r2.dev" }],
}
```
또는 커스텀 도메인.

## 환경변수

- 모든 환경변수는 `lib/env.ts`에서 zod로 검증 후 export.
- 직접 `process.env.X` 사용 금지 — 검증 우회.

```ts
// lib/env.ts (발췌 — 전체 목록은 docs/environment-variables.md)
import { z } from "zod";
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // R2 — 자격증명은 상품·UGC 두 버킷 공용(운영 토큰 스코프에 두 버킷 포함)
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  // 커뮤니티 사진(UGC) 비공개 버킷 — 버킷만 분리(공개/비공개), 서빙은 서명 GET만
  R2_UGC_BUCKET: z.string().min(1),
});
export const env = envSchema.parse(process.env);
```

## 마이그레이션 관리

```
supabase/
├── migrations/        SQL 마이그레이션 (타임스탬프 prefix)
├── seed.sql           시드 데이터 (선택)
└── config.toml        Supabase CLI 설정
```
RLS 정책도 마이그레이션 SQL에 포함시킨다 — 정책이 코드와 별도 시스템에 머무르면 따라잡지 못한다.
