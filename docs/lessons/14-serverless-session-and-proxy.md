# 14. 서버리스 세션과 Next 16 Proxy/DAL 패턴

## 왜 알아야 하는가

[13번](./13-session-vs-jwt.md)에서 1차 세션을 **DB 세션**으로 정했다. 그런데 오시코레는 **서버 인스턴스가 없는 서버리스(Vercel Functions)** 위에 돈다. 자연스러운 의문:

> *"서버 인스턴스가 없는데 세션을 *저장*하는 구조가 가능한가? 매 요청이 새 함수 인스턴스라면, 세션을 어디에 들고 있지?"*

결론부터: **가능하다. 그리고 그게 Next 16 공식 인증 가이드가 권장하는 바로 그 패턴이다.** 단, 서버리스 특유의 제약이 하나 있고 — 그건 "세션을 저장 못 한다"가 아니라 **"세션을 *어느 계층에서* 검증하느냐"**다. 이 문서가 그 제약과 해소법을 정리한다.

## 핵심 개념

### "서버 인스턴스 없음"이 막는 건 *인메모리* 세션이지 DB 세션이 아니다

서버리스에서 깨지는 건 세션을 **서버 프로세스 RAM**에 들고 있는 방식이다 — 매 요청이 새 프로세스라 RAM이 비어 사라진다. **DB 세션은 상태를 Postgres에 두므로 무관하다.** 컴퓨트는 stateless, 상태는 DB가 보유.

**이 프로젝트는 이미 이걸 하고 있다**: 카탈로그(team/product)가 [`lib/db.ts`](../../lib/db.ts)의 Prisma+pg로 매 요청 Postgres를 조회한다. "서버 인스턴스"는 product 조회 때도 없었고 세션 조회 때도 필요 없다. **Postgres가 공유 저장소다.** `account_session`은 그저 또 하나의 테이블일 뿐.

### 진짜 제약: Edge 계층에선 Postgres(TCP) 조회가 불가능하다

Next.js 미들웨어(=Next 16의 **Proxy**, 아래)는 전통적으로 **Edge 런타임**에서 돈다. Edge 런타임은 **raw TCP 커넥션을 못 연다** → **Prisma/`pg`가 거기서 못 돈다.** 그래서 *미들웨어 안에서* DB 세션을 조회할 수 없다.

현재 이 프로젝트 [`middleware.ts`](../../middleware.ts)도 Edge라서, basic-auth 게이트에 *"Edge runtime에서 node:crypto import 불가"* 주석을 달고 수동 timing-safe 비교를 쓴다. 세션 검증도 같은 제약을 받는다.

→ 그래서 세션 검증을 **어디서** 하느냐가 핵심 설계 포인트가 된다.

## Next 16: Middleware → Proxy 개명 + Node 런타임

Next.js 16에서 미들웨어가 **Proxy로 개명**됐다(기능은 동일).

> Next 16 공식 문서: *"Starting with Next.js 16, Middleware is now called Proxy to better reflect its purpose. The functionality remains the same."*
> (로컬: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`)

| 항목 | 구 `middleware.ts` | 신 `proxy.ts` (Next 16) |
|---|---|---|
| 파일명 | `middleware.ts` | `proxy.ts` (root 또는 `src/`) |
| 런타임 | Edge | **Node.js** |
| export | `middleware` | `proxy` (default 또는 named) |

**보너스**: 인증 가이드 line 1124 — *"Proxy uses the Node.js runtime."* 즉 `proxy.ts`로 옮기면 Node 런타임이라 `node:crypto` 워크어라운드 자체가 불필요해진다.

> [!warning] 그래도 Proxy에서 DB 조회는 하지 말 것
> Proxy가 Node라 *기술적으로는* DB 조회가 가능해졌지만, 가이드는 여전히 **금지**한다. Proxy는 prefetch 포함 **모든 라우트마다 실행**되므로, 거기서 DB를 치면 성능이 망가진다.
> 원문(line 1031): *"it's important to only read the session from the cookie (optimistic checks), and avoid database checks to prevent performance issues."*

## 2계층 패턴 — Proxy(optimistic) + DAL(authoritative)

Next 16이 권장하는 인증 2계층. **이게 DB 세션 + 서버리스의 정답이다.**

| 계층 | 하는 일 | DB 접근 | 런타임 |
|---|---|---|---|
| **Proxy** (구 middleware) | optimistic 체크 — **쿠키만 읽고** 미인증이면 리다이렉트. 사전 필터링 | ❌ 금지 | Node(Next 16) |
| **DAL** `verifySession()` | authoritative 체크 — `account_session` 행 조회·검증. React `cache()`로 요청당 1회 메모이즈 | ✅ Prisma 조회 | Node (Server Component/Action/Route Handler) |

> 가이드 원문(line 1119): *"the majority of security checks should be performed as close as possible to your data source."*
> → 세션의 **진짜 검증은 데이터 옆(DAL)**에서, **Proxy는 쿠키 기반 사전 필터**만. 이게 [13번](./13-session-vs-jwt.md)에서 말한 Lucia 레퍼런스 패턴과 정확히 일치한다.

## 코드/문법

### Proxy — 쿠키 존재만 확인(optimistic)

```ts
// proxy.ts (root) — Next 16. DB 조회 없이 쿠키만.
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("session");
  const { pathname } = request.nextUrl;

  // 보호 경로인데 세션 쿠키 없음 → 로그인으로. (진짜 유효성은 DAL에서)
  if (pathname.startsWith("/account") && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}
```

### DAL — 권위 있는 세션 검증(authoritative)

```ts
// modules/auth/dal.ts — Node 런타임. 여기서 Prisma로 실제 조회.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

// React cache() → 한 요청 안에서 여러 번 불러도 DB 조회는 1회.
export const verifySession = cache(async () => {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;

  const session = await db.accountSession.findUnique({
    where: { id: hash(token) },             // 토큰 해시로 조회
    include: { account: true },
  });
  if (!session || session.expiresAt < new Date()) return null;  // 자연 만료 거부
  return session;
});
```

## 커넥션 풀링 함정 (포터빌리티 체크리스트)

서버리스 + 직접 Postgres(`@prisma/adapter-pg`)는 **커넥션 풀러가 필수**다. 매 호출이 짧은 커넥션을 폭발적으로 열어 DB 커넥션이 고갈되기 때문.

- **지금(Supabase)**: `DATABASE_URL`이 직결(5432)이 아니라 **Supavisor 풀러(6543, transaction mode)**를 가리켜야 한다.
- **Supabase를 떠날 때**: 동등한 **pgBouncer/풀러를 직접** 세워야 한다. → "어떤 Postgres에서도 유효" 목표의 실제 이주 항목이라 못박아 둔다.

세션 모델과 무관한 인프라 사안이지만, DB 세션이 매 요청 DB를 치므로 풀러 부재 시 가장 먼저 터진다.

## 이 프로젝트의 결정

(2026-06-09 논의, 구현 전 설계 단계)

1. **DB 세션 검증은 DAL(Node 계층)에서.** `modules/auth/`에 `verifySession()`을 두고 React `cache()`로 요청당 1회. Server Component·Server Action·Route Handler가 이걸 통해 사용자를 얻는다.
2. **Proxy는 쿠키 존재만 확인(optimistic).** 보호 경로 사전 필터링·리다이렉트만. DB 조회 금지.
3. **현 `middleware.ts`(Edge) → `proxy.ts`(Node)로 이전** 시점에 `node:crypto` 워크어라운드 정리 가능. (단 Proxy에서 DB 안 치는 원칙은 유지)
4. **커넥션 풀러 정렬**을 배포 체크리스트에 포함.

## 함정·주의

- **"서버리스라 세션 못 한다"는 오해** — 인메모리만 못 한다. DB 세션은 Postgres가 저장소라 무관. ([13번](./13-session-vs-jwt.md))
- **Proxy에서 DB 조회 금지** — Node 런타임이 됐어도 모든 라우트·prefetch마다 실행되니 성능상 쿠키 체크만.
- **Proxy는 단독 방어선이 아니다** — optimistic 체크는 UX·사전 필터일 뿐, *진짜 인가*는 데이터 옆(DAL)에서. Proxy만 믿으면 우회 가능.
- **Edge 미들웨어의 라이브러리 호환성** — Edge 런타임은 `node:*` 모듈 다수가 없다. 인증·세션 로직이 Edge 호환(jose 등)이 아니면 Node(Proxy/DAL)에서 돌려야 한다.
- **빌드 region ≠ 함수 region** — 세션 조회 latency는 *함수 region*과 DB region 정렬에 좌우된다. [11번](./11-vercel-function-region.md) 참고.

## 참고

- [13. 세션 관리 — DB 세션 vs JWT](./13-session-vs-jwt.md) — 세션 모델 비교·탈취 모델·만료
- [11. Vercel Function Region](./11-vercel-function-region.md) — Edge vs Node 런타임, function↔DB region 정렬
- [10. Database URL 비밀번호 인코딩](./10-database-url-password.md) — connection string·풀러 함정
- [Next.js — Proxy (구 Middleware)](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) (로컬: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`)
- [Next.js — Authentication: Optimistic checks & Data Access Layer](https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal) (로컬: `…/02-guides/authentication.md`)
- [Supabase — Connection pooling (Supavisor)](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- 실제 코드: [`middleware.ts`](../../middleware.ts), [`lib/db.ts`](../../lib/db.ts)
