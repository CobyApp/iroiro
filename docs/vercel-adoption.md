# Vercel 도입 검토

Vercel을 도입·운영하면서 결정해야 할 사항을 모아두는 살아있는 문서.
선택 근거(왜 Vercel인가)는 [mvp-stack.md](./mvp-stack.md) 참조.

> 현재 단계: 정보 수집 + 대안 호스팅 비교. Hobby 상업적 사용 제한 발견으로 결정 재검토 여지 있음.

---

## ⚠️ 핵심 이슈 — Hobby 플랜은 상업적 사용 금지

**Vercel Hobby 플랜의 [이용약관](https://vercel.com/legal/terms)은 "personal, non-commercial use"로 사용 범위를 제한**한다. oshikore-web은 굿즈 판매 사이트로 명백한 상업적 활동에 해당하므로, Hobby 플랜으로 운영 시 ToS 위반 소지가 있다.

| 구분 | 예시 | Hobby 허용 |
|---|---|---|
| **개인적·비상업적** | 포트폴리오, 토이 프로젝트, OSS 데모, 학습용, 비영리 정보 페이지 | ✅ |
| **상업적** | 상품 판매·결제 처리, 광고 수익, 유료 구독, 클라이언트 작업, 상업적 SaaS | ❌ |
| **회색 지대** | 상업적 기능이 없는 *전시용* 카탈로그, 외부 결제 사이트로 리다이렉트하는 페이지 | △ (운영 정책상 모호) |

### 적발 시 동작

| 단계 | 결과 |
|---|---|
| 1차 | 이메일 경고 + Pro 업그레이드 요청 |
| 2차 (미이행) | 강제 Pro 자동 전환 또는 Production 배포 일시정지 |
| 위반 지속 | 계정 차단 |

대량 사례나 의도적 회피가 아닌 한 즉시 차단은 드물고, **알림 → 유예 → 조치** 단계를 거치는 것이 일반적이다. 그러나 결제 트랜잭션이 흐르기 시작하면 적발 가능성이 빠르게 올라간다.

### oshikore-web 적용

- **MVP 단계 (실판매 전, 트래픽 미미)**: 회색 지대 — 전시용 카탈로그 정도면 즉시 위반 판단은 어렵다. 단 인지하고 운영.
- **실판매 시작 시점**: ToS 위반 명확. 다음 중 하나 선택 필요:
  - **Vercel Pro 전환** ($20/월) — 가장 무난, 마이그레이션 없음
  - **Cloudflare Pages 전환** — 상업적 OK + 무제한 대역폭. R2와 같은 회사라 시너지
  - **다른 대안** — 아래 *대안 호스팅 비교* 섹션 참조

→ **결정은 보류, 트리거 명확화**: "실 결제·판매가 시작되는 시점에 호스팅 재검토"를 운영 룰로 명문화.

출처: [Vercel Terms of Service](https://vercel.com/legal/terms), [Vercel Fair Use Policy](https://vercel.com/docs/limits/fair-use-guidelines)

---

## 무료 플랜 (Hobby) 할당량 (2026-05 기준)

### 한눈에 보기

| 영역 | 한도 |
|---|---|
| **Fast Data Transfer** (CDN/Edge → 클라이언트 outbound) | 100 GB / 월 |
| **Edge Requests** | 1M / 월 |
| **Function Invocations** (Serverless) | 100K / 월 |
| **Function Duration** | 100 GB-Hr / 월 |
| **Fast Origin Transfer** (Origin → Edge) | 100 GB / 월 |
| **Image Optimization Transformations** | 5,000 source images / 월 |
| **Build Time** | 6,000 minutes / 월 (≈100시간) |
| **Concurrent Builds** | 1 |
| **Deployments** | 100 / 일 |
| **Custom Domains** | 50 / project |
| **Team Members** | **1 (Hobby는 단일 사용자)** |
| **Log Retention** | 1시간 |
| **상업적 사용** | ❌ 금지 |

출처: [Vercel Pricing](https://vercel.com/pricing), [Vercel Limits](https://vercel.com/docs/limits)

### Hobby에 *포함되지 않는* 기능

| 기능 | 무료 | 비고 |
|---|---|---|
| Team 협업 (멤버 추가) | ❌ | Pro부터 |
| Password Protection (preview 배포 비번 보호) | ❌ | Pro부터 |
| Vercel Authentication (preview 배포 SSO) | ❌ | Pro부터 |
| Spend Management (사용량 알림·제한) | ❌ | Pro부터 |
| Web Analytics (고급) | △ (기본만) | Pro부터 풀 기능 |
| Speed Insights (기본 이상) | △ | Pro부터 풀 기능 |
| 이메일 지원 | ❌ | 커뮤니티만 |
| 우선 빌드 큐 | ❌ | Pro부터 |
| 24h 이상 Log 보관 | ❌ | Pro: 1일 |

---

## Pro 플랜 ($20 / 월·멤버)

### 가격 단위 — "팀 멤버" 기준 (방문자 수와 무관)

가격이 무엇 단위로 매겨지는지 헷갈리기 쉬워 분리해서 정리한다.

| 용어 | 의미 | 비용 영향 |
|---|---|---|
| **End-User (방문자)** | 배포된 사이트를 보러 오는 사람 — 카탈로그 보러 오는 손님 | **무관** (트래픽으로만 환산) |
| **Team Member (Seat)** | Vercel 대시보드에 로그인해 프로젝트 관리하는 사람 | **$20 / 멤버 / 월** |

| 시나리오 | Team Members | 월 청구액 |
|---|---|---|
| 본인 1명 · 프로젝트 1개 (oshikore-web) | 1 | **$20** |
| 본인 1명 · 프로젝트 N개 (같은 팀에 모음) | 1 | **$20** |
| 본인 + 동료 1명 협업 (Vercel 접근 권한 부여) | 2 | $40 |
| 본인 + 디자이너 (Figma만 공유, Vercel 접근 X) | 1 | $20 |
| 본인 별도 팀 2개 운영 | 1 + 1 = 2팀 | $40 |

→ **혼자 운영하는 한 프로젝트가 몇 개든 $20 고정.** 외부인이 Vercel 대시보드 접근이 꼭 필요한 경우에만 추가 비용.

> 주의: 여러 프로젝트를 한 팀에 두면 멤버 비용은 그대로지만 **트래픽·Function 사용량 한도는 팀 전체 합산**.

### 포함 한도와 Hobby 대비 (한눈에)

| 항목 | Hobby | Pro | 초과 단가 |
|---|---|---|---|
| 상업적 사용 | ❌ | ✅ | — |
| Fast Data Transfer | 100 GB | **1 TB** | $0.40 / GB |
| Edge Requests | 1M | **10M** | $2 / 1M |
| Function Invocations | 100K | **1M** | $0.60 / 1M |
| Function Duration | 100 GB-Hr | **1,000 GB-Hr** | $0.18 / GB-Hr |
| Image Optimization | 5K | 5K | $5 / 1K |
| Build Time | 6,000분 | **24,000분** | $40 / 100분 |
| Concurrent Builds | 1 | **12** | — |
| Team Members | 1 | 무제한 | 멤버당 $20 |
| Log 보관 | 1시간 | 1일 | — |
| Spend Cap | ❌ | ✅ | — |
| Password Protection (preview) | ❌ | ✅ | — |
| Preview Comments | ❌ | ✅ | — |

### Spend Cap — 운영 시작 시 필수 설정

Pro의 가장 위험한 함정. **기본값이 OFF**라 트래픽 폭주 시 청구액도 폭주.

| Spend Cap | 동작 |
|---|---|
| **OFF (기본)** | 한도 초과분 자동 과금 — 청구 폭주 위험 |
| **ON** | 설정 금액 초과 시 **서비스 정지** → 다운되지만 청구 차단 |

→ **운영 시작 시점에 활성화 필수.** Project Settings > Billing > Spend Management. 권장 cap $50~100.

### 별도 청구되는 서비스 (Pro 구독에 포함 X)

| 서비스 | 가격 | 우리 사용 |
|---|---|---|
| Vercel Postgres | $20/월 기본 | **0** (Supabase 사용) |
| Vercel KV (Redis) | $20/월 기본 | 0 |
| Vercel Blob | $0.023/GB·월 | 0 (R2 사용) |
| Vercel Cron Jobs | Pro 포함 | 사용 가능 |
| OpenTelemetry / Log Drain | Pro부터 종량 | 0 |

→ oshikore-web은 **Supabase + R2** 조합이라 이 라인들 사실상 $0.

### oshikore-web 예상 청구액 시나리오

| 사용자 규모 | 월 트래픽 | Function 호출 | 예상 청구액 |
|---|---|---|---|
| MVP (실판매 전) | ~2 GB | ~20K | $20 |
| 초기 (500 활성) | ~10 GB | ~100K | **$20** (한도 내) |
| 성장 (5,000 활성) | ~50 GB | ~450K | **$20~25** |
| 확장 (50,000 활성) | ~500 GB | ~4.5M | **$50~100** |
| 폭주 (500K 활성) | ~5 TB | ~45M | $500+ |

→ **5만 사용자급까지 사실상 $20 고정.** 그 이상에서 Function Invocations + Bandwidth 초과분이 가장 먼저 닿음.

### Hobby → Pro 전환 트리거

다음 중 하나라도 일어나면 즉시 Pro 업그레이드:

- ✅ 첫 실 결제 트랜잭션 발생
- ✅ 실 사용자 100명 돌파
- ✅ `*.vercel.app` → 커스텀 도메인(`oshikore.kr` 등) 전환
- ✅ Vercel로부터 상업적 사용 의심 이메일 수신
- ✅ Spend Cap이 필요한 시점 (Hobby에 없음)
- ✅ 외부 협업자(개발자·디자이너)에게 대시보드 접근 권한 부여 필요

출처: [Vercel Pricing](https://vercel.com/pricing), [Vercel Pricing Changes 2024](https://vercel.com/blog/improved-infrastructure-pricing)

---

## 비용에 영향을 주는 핵심 항목 (4개)

Pro 플랜의 한도 라인은 십수 개지만, oshikore-web 스택(Next.js + Supabase + R2)에서 **실제로 비용에 영향을 주는 라인은 4개뿐**이다. 나머지는 0이거나 한도가 매우 여유로워 모니터링 불필요.

| 우선순위 | 항목 | 영향력 | 우리 스택에서 발생 시점 |
|---|---|---|---|
| 🔴 1 | **Fast Data Transfer** | 최대 | 모든 페이지·API 응답 |
| 🟠 2 | **Function Invocations** | 큼 | RSC 렌더링·Server Action 호출마다 |
| 🟡 3 | **Function Duration** | 중간 | invocation 시간 × 메모리 |
| 🟡 4 | **Edge Requests** | 중간 | Middleware 거치는 모든 요청 |

### 🔴 1. Fast Data Transfer (Pro: 1 TB / $0.40 per GB 초과)

가장 빨리 닿는 라인. Edge → 사용자 outbound 전부.

- **카운트 대상**: HTML 응답, JS/CSS, JSON API 응답, RSC 페이로드
- **카운트 X**: R2에서 직접 서빙되는 이미지 (트래픽이 Cloudflare에서 종료)
- **줄이는 법**:
  - 목록 SELECT에 필요한 컬럼만 — `.select('id, name, sale_price')`
  - mutation 후 `.select()` 생략
  - 클라이언트 사이드 캐싱(React Query·SWR)으로 동일 요청 재전송 차단
- **우리 예상**: 5,000 사용자 ≈ 50 GB → 1 TB의 **5%**

### 🟠 2. Function Invocations (Pro: 1M / $0.60 per 1M 초과)

App Router의 함정 — 페이지 1 요청 ≈ 함수 호출 1+.

- **카운트 대상**:
  - Server Component 렌더링 (모든 `app/**/page.tsx` 요청)
  - Server Action 호출 (`modules/<도메인>/actions.ts`)
  - Route Handlers (`app/api/**`)
- **카운트 X**: `force-static` 적용된 페이지, 정적 자원
- **줄이는 법**:
  - 변동 적은 페이지에 `export const revalidate = N` (ISR)
  - 검색·필터를 매번 Server Action으로 호출하지 말고 클라이언트 사이드에서 처리
- **우리 예상**: 5,000 사용자 × 30 PV × 평균 3 호출 ≈ 450K → 1M의 **45%**

### 🟡 3. Function Duration (Pro: 1,000 GB-Hr / $0.18 per GB-Hr 초과)

Invocations와 짝지어 가는 라인. Function 실행 시간 × 할당 메모리.

- **계산식**: 1 invocation 평균 200 ms × 1 GB 메모리 = 0.0000555 GB-Hr
- **카운트 X**: Edge runtime (Edge Requests 라인으로 분리)
- **줄이는 법**:
  - DB 쿼리 최적화 (인덱스 활용, 불필요한 join 제거)
  - 가벼운 변환만 — 무거운 작업은 background job으로 분리
- **우리 예상**: Invocations에 비례 — 5K 사용자에서 ~125 GB-Hr → **12.5%**

### 🟡 4. Edge Requests (Pro: 10M / $2 per 1M 초과)

Middleware의 비용. `middleware.ts`를 거치는 모든 요청.

- **카운트 대상**: middleware의 `matcher` 패턴에 매칭되는 모든 요청
- **현재 코드**: `middleware.ts`로 Supabase 세션 갱신 — 정적 자원 제외 후 모든 페이지에 1 카운트
- **줄이는 법**:
  - matcher에서 제외 패턴 추가 검토 (이미 정적 자원은 제외)
  - 세션 갱신이 필요 없는 공개 경로는 추가 제외 가능
- **우리 예상**: 5,000 사용자 × 30 PV ≈ 150K → 10M의 **1.5%**

### 신경 쓸 필요 없는 항목 (모니터링 불필요)

| 항목 | Pro 한도 | 우리 사용 | 이유 |
|---|---|---|---|
| Image Optimization | 5K source | **0** | R2 + Cloudflare loader 우회 |
| Build Time | 24,000분 | ~200분 | 빌드 자주 안 함 |
| Custom Domains | 무제한 | 1~2개 | 한도 무관 |
| Web Analytics | 25K | 0 또는 소량 | 적극 사용 시점에 점검 |
| Speed Insights | 10K | 0 또는 소량 | 동일 |
| Fast Origin Transfer | 100 GB | <5 GB | Supabase → Vercel 응답만 |

### 정기 점검 위치

```
Vercel Dashboard > Settings > Usage
  ✓ Fast Data Transfer    ← 1 TB 게이지
  ✓ Function Invocations  ← 1M 게이지
  ✓ Function Duration     ← 1,000 GB-Hr 게이지
  ✓ Edge Requests         ← 10M 게이지
```

월 1회 점검으로 충분.

---

## 항목별 세부

### Fast Data Transfer — 가장 빨리 닿는 한도

Vercel은 2024년부터 단순 "Bandwidth" 표시 대신 **트래픽 경로별로 분리 측정**한다.

| 라인 | 무엇 | Hobby 한도 |
|---|---|---|
| **Fast Data Transfer** | Vercel Edge Network → 최종 사용자(브라우저) | 100 GB / 월 |
| **Fast Origin Transfer** | 사용자 origin(외부 API, DB) → Vercel Edge | 100 GB / 월 |
| **Edge Requests** | Edge Function·Middleware 호출 수 | 1M / 월 |

**Fast Data Transfer**는 supabase의 Egress와 같은 성격. 페이지 응답·정적 자산·API 응답 모두 포함. **이미지·동영상이 크면 가장 빨리 소진된다.**

→ oshikore-web은 상품 이미지를 **R2 + Cloudflare CDN**으로 빼내므로 Vercel egress 부담은 페이지 HTML/JS/CSS·API 응답만. 200 사용자 규모에선 10 GB 미만 예상 (10% 사용).

### Function Invocations — App Router의 함정

| 항목 | 카운트 방식 |
|---|---|
| **Server Components (RSC)** | 페이지 요청당 1회 카운트. SSR이라 각 요청이 함수 호출 |
| **Server Actions** | 호출당 1회 카운트 |
| **Route Handlers (`app/api/`)** | 호출당 1회 카운트 |
| **Static (`force-static`)** | 카운트 X — Edge 캐시에서 직접 응답 |
| **Edge Middleware** | Edge Requests 라인으로 별도 카운트 |

oshikore-web은 거의 모든 페이지가 Server Components로 Supabase를 쿼리하므로 **페이지 뷰 ≈ Function Invocations**. 200 사용자 × 월 30 페이지뷰 × 평균 3 함수 호출 ≈ 18K — Hobby 100K의 18%.

> 주의: Server Action을 **목록·필터링·검색마다 호출**하면 카운트가 빠르게 누적. 클라이언트 사이드 캐싱(React Query, SWR)을 활용해 동일 요청 재호출 차단 필요.

### Build Time — 6,000 분의 의미

- 빌드 1회 평균 2~5분 → 월 1,200~3,000회 빌드 가능 (충분히 여유)
- **Concurrent Builds 1** 한도가 더 중요. PR이 동시에 여러 개면 줄을 선다 (preview 배포 지연)
- 빌드 최적화:
  - `next.config.ts`의 `experimental.turbo` 등으로 빌드 가속
  - `vercel.json`에서 `ignoreCommand`로 변경 없는 패키지 빌드 스킵 (모노레포)
  - Vercel 빌드 캐시는 기본 활성

### Image Optimization — 우리는 사실상 안 씀

| 항목 | Hobby | 우리의 사용 |
|---|---|---|
| Source Images / 월 | 5,000 | **0 (예상)** |
| 변환 비용 | 첫 5K 무료, 이후 $0.005/장 | — |

이유: 이미지는 [`R2 + Cloudflare Image Resizing`](./image-strategy.md)으로 처리. Next.js `<Image>` 컴포넌트에서 R2 도메인을 `remotePatterns`에 등록하되 `unoptimized` 또는 외부 loader 사용 시 Vercel Image Optimization은 호출되지 않는다.

**확인**: Vercel 대시보드 > Usage > Image Optimization 라인이 항상 0인지 정기 점검.

### Custom Domains & SSL

- Hobby도 **50 도메인 / project + 자동 HTTPS (Let's Encrypt)**
- DNS 설정 옵션:
  - **A record**: `76.76.21.21` (Vercel anycast IP)
  - **CNAME**: `cname.vercel-dns.com` (서브도메인 권장)
- DNS 전파 후 자동 인증서 발급 — 보통 1~10분
- 단 ToS상 **상업적 도메인**(예: `oshikore.kr`로 굿즈 판매)이면 Hobby 위반 신호로 잡힐 수 있음

출처: [Vercel Custom Domains](https://vercel.com/docs/projects/domains/add-a-domain)

### Environment Variables — 3환경 분리

| Scope | 적용 위치 | 예시 |
|---|---|---|
| **Production** | `main` 브랜치 배포 | prod Supabase URL, prod R2 키 |
| **Preview** | PR 브랜치 배포 | staging Supabase URL, staging R2 키 |
| **Development** | `vercel env pull` + 로컬 `vercel dev` | 로컬 Supabase URL (선택) |

- `NEXT_PUBLIC_*` 접두사는 **브라우저로 노출**. 비밀 키는 절대 이 접두사 X
- Vercel CLI로 동기화: `vercel env pull .env.local`
- 변경 후엔 **재배포 필요** (값만 바꿔도 빌드 안 다시 돌면 반영 X)

### Deployments — Git 연동 흐름

```
main branch    ─▶ Production deployment (https://oshikore.vercel.app)
feature/*      ─▶ Preview deployment    (https://oshikore-<hash>-<scope>.vercel.app)
PR open        ─▶ Preview + GitHub Check 자동
PR merge       ─▶ Production 자동 배포
```

- Hobby도 **Preview 배포 무제한** — PR마다 자동 URL 생성
- Production 보호: GitHub branch protection으로 main 직커밋 방지 + PR 필수 권장

### Log Retention 1시간

문제 디버깅이 즉시 가능하지만 **1시간 지난 로그는 사라짐**. 운영 사고는 발견 즉시 로그 캡처 필요.

대안:
- Sentry / Logflare / Axiom 등 외부 로깅 연동
- Pro 전환 시 1일까지 보관

---

## oshikore-web 통합 포인트

### 1. GitHub 연동 (최초 1회)

1. https://vercel.com/new 접속
2. GitHub 계정 인증 → `oshikore-web` 저장소 import
3. Framework Preset: **Next.js** (자동 인식)
4. Root Directory: `.` (default)
5. Build Command: `next build` (default)
6. Output Directory: `.next` (default)
7. 환경변수 입력 (다음 섹션)
8. **Deploy**

### 2. 환경변수 매트릭스

| 변수명 | Production | Preview | Development | 비고 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod Supabase | beta Supabase | 로컬 또는 beta | 브라우저 노출 OK |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable | beta publishable | 동일 | 브라우저 노출 OK (RLS가 보호) |
| `SUPABASE_SECRET_KEY` | prod secret | beta secret | 로컬 secret | **절대 NEXT_PUBLIC_ 금지** |
| `R2_ENDPOINT` | prod | prod | dev or prod | R2 S3 endpoint (두 버킷 공용) |
| `R2_ACCESS_KEY_ID` | prod 토큰 | beta 토큰 | dev | 두 버킷 공용 — **NEXT_PUBLIC_ 금지** |
| `R2_SECRET_ACCESS_KEY` | prod 토큰 | beta 토큰 | dev | 두 버킷 공용 — **NEXT_PUBLIC_ 금지** |
| `R2_BUCKET` | prod bucket | beta bucket | dev bucket | 공개 상품 버킷 |
| `R2_PUBLIC_BASE` | prod CDN URL | beta CDN URL | dev | 공개 이미지 URL prefix |
| `R2_UGC_BUCKET` | `oshikore-ugc-prod` | `oshikore-ugc-beta` | `oshikore-ugc-dev` | **비공개** UGC 버킷 |

> Production·Preview는 **같은 prod Supabase**를 보면 운영 데이터 오염 위험. Preview는 별도 beta Supabase project 권장 ([supabase-adoption.md](./supabase-adoption.md)의 org 분리 전략 참조).

> R2는 **버킷 2벌 · 토큰 1벌(환경당)** 구조다 — 토큰 스코프에 상품·UGC 두 버킷이 모두 포함돼야 한다(2026-08-02 자격증명 공유 결정). `R2_UGC_BUCKET`을 비워두면 로컬 기본값(`oshikore-ugc-dev`)으로 조용히 폴백해 사진 업로드 시점에야 터진다. 발급 절차·스코프 설정은 [r2-adoption.md](./r2-adoption.md) §운영 셋업 참조.

### 3. Next.js 16 호환성

- Vercel은 Next.js 공식 호스팅이라 16.x 즉시 지원
- App Router·RSC·Server Actions·Partial Prerendering 등 최신 기능 모두 작동
- 단 일부 신규 API(예: `next/cache` revalidation 변경점)는 Vercel 측 인프라 업데이트 1~2주 시차 발생 가능 — 운영에선 Next.js stable만

### 4. 빌드·런타임 설정 (vercel.json 필요 시)

현재 `vercel.json` 없이 기본 설정으로 충분. 다음 경우에만 추가:

```jsonc
{
  // 빌드 메모리 늘리기 (대형 페이지에서)
  "build": { "env": { "NODE_OPTIONS": "--max-old-space-size=4096" } },
  // 특정 Route Handler를 Edge Runtime으로 강제
  // (보통은 route.ts 내부의 export const runtime = 'edge'로 충분)
}
```

### 5. preview 배포 활용

- PR마다 자동 생성되는 preview URL로 **퍼블리시 전 시각 확인**
- 디자인 변경 PR의 경우 reviewer가 preview URL로 즉시 확인
- supabase beta project와 짝지으면 **PR별 격리 환경** 효과

---

## 대안 호스팅 비교

Hobby 상업적 제한 때문에 실판매 시점에 재검토할 후보들. 카테고리부터 정리한 뒤 각 후보를 짚는다.

### 호스팅 카테고리 맵

| 카테고리 | 특징 | 대표 |
|---|---|---|
| Vercel-like 매니지드 | git push → 자동 배포, zero-config | Vercel · Netlify · **AWS Amplify Hosting** |
| Edge-first | Workers/Edge 런타임 | Cloudflare Pages · **Deno Deploy** |
| 컨테이너 PaaS | Docker 그대로 + 자동 인프라 | Railway · Render · **DigitalOcean App Platform** |
| AWS-native | 서버리스 + IaC | **SST** · OpenNext on AWS Lambda |
| 자체 호스팅 PaaS | 본인 VPS에 Vercel 클론 | **Coolify** · Dokploy · CapRover |
| 순수 VPS | Linux 서버, 모든 걸 본인이 | Hetzner · DigitalOcean Droplet |

### Cloudflare Pages — 무제한 대역폭, 단 호환성 검증 필수

| 항목 | 값 |
|---|---|
| 무료 한도 | 빌드 500/월 · 사이트 100개 · **대역폭 무제한** · Workers 100K req/일 |
| 상업적 사용 | ✅ 무료 플랜에서도 허용 |
| R2 연동 | ✅ 같은 계정 내 R2 버킷에 Bindings로 직접 접근 |
| 도메인·SSL | 무제한 도메인·자동 HTTPS |
| 콜드스타트 | Workers는 0 ms (V8 isolate) |

**장점**: R2·Images와 같은 회사 → 통합. 무제한 대역폭. 상업적 OK.

#### Next.js 호환성 — oshikore-web 코드 기준 영향도

코드 베이스를 점검한 결과 다음 두 영역이 가장 큰 리스크.

| 기능 | 코드 사용 | Cloudflare Pages | 영향도 |
|---|---|---|---|
| **`revalidatePath` / `revalidateTag`** | ✅ `modules/products/actions.ts`에 10+ 호출 | △ Workers KV 등 캐시 백엔드 별도 구성 필요 | 🔴 큼 |
| **Middleware** | ✅ `middleware.ts`로 Supabase SSR 세션 갱신 | Edge runtime 강제, `@supabase/ssr` 호환은 OK이나 동작 검증 필수 | 🔴 큼 |
| **Server Actions** | ✅ `modules/<도메인>/actions.ts` 패턴 | 기본 작동, streaming·`after()` 등 일부 제약 | 🟡 |
| **`next/image` 기본 loader** | △ | Vercel 환경 가정 — Cloudflare Images loader 또는 `unoptimized` 필요 | 🟢 (R2 외부 loader 우회 중) |
| **ISR (`revalidate: N`)** | ❌ 미사용 | Workers KV 캐시 어댑터 필수 | 🟢 |
| **`after()` (post-response 작업)** | ❌ 미사용 | 미지원 | 🟢 |

#### 어댑터 분기 문제

| 어댑터 | 상태 |
|---|---|
| `@cloudflare/next-on-pages` | 초기 어댑터, 활발 개발 안 됨 |
| `@opennextjs/cloudflare` | 후계자, 최근 활발 — 호환성 더 좋지만 일부 작업 중 |

→ 어댑터 선택 + 호환성 매트릭스 직접 확인 필요.

#### Edge Runtime CPU·메모리 제약

| 항목 | Cloudflare Pages Free | Vercel Hobby/Pro |
|---|---|---|
| CPU time / request | **10 ms (Workers Free)** | 측정 안 함 |
| Wallclock / request | 30 s | 60 s (Hobby) |
| Memory | 128 MB | 1024 MB |
| Bundle size (압축 후) | **1 MB / Worker** (Paid: 10 MB) | 50 MB |

**CPU 10 ms가 가장 무거운 제약.** 무거운 데이터 변환 돌리면 Free 플랜에선 그 요청이 에러. Workers Paid ($5/월)는 50 ms로 늘어나지만 여전히 빡빡.

#### 빌드·운영 부담

| 항목 | Cloudflare Pages Free | Vercel Hobby |
|---|---|---|
| 빌드 횟수 | 500/월 | 6,000분 (≈1,500~3,000회) |
| 빌드 시간 제한 | **20분/빌드** | 45분/빌드 |
| Concurrent builds | 1 | 1 |
| Logs 보관 | 즉시만 (tail) | 1시간 |
| 트러블슈팅 자료 | 한정적, 한국어 거의 없음 | 압도적으로 풍부 |
| 로컬 개발 | `next dev` + `wrangler pages dev` 두 환경 검증 | `next dev` 또는 `vercel dev` 1번 |
| 마이그레이션 비용 (지금) | 반나절~하루 + 호환성 미상 부분 | 0 (Hobby → Pro는 클릭 1번) |

#### oshikore-web 관점 종합

| 단점 | 영향도 |
|---|---|
| `revalidatePath` 동작·캐시 백엔드 구성 | 🔴 |
| Middleware Edge runtime 호환성 검증 | 🔴 |
| Edge Runtime CPU 10ms 제한 (Free 한정) | 🟡 |
| 트러블슈팅 자료 부족 | 🟡 |
| Vercel 전용 기능 (Analytics·Speed Insights·Edge Config) 사용 불가 | 🟡 |
| 마이그레이션 작업 시간 | 🟡 |
| Log 보관 짧음 (외부 도구로 어차피 보완) | 🟢 |
| 로컬 wrangler 학습 곡선 | 🟢 |

→ R2 시너지·무제한 대역폭은 매력적이지만, **트래픽이 Vercel Pro 1 TB 한도를 진짜로 초과하는 시점에 검토하는 게 합리적**. 그 이전에 옮기면 마이그레이션 비용 > 절약 비용.

출처: [Cloudflare Pages Pricing](https://pages.cloudflare.com), [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/), [OpenNext for Cloudflare](https://opennext.js.org/cloudflare)

### AWS Amplify Hosting — AWS 표준의 매니지드

| 항목 | 값 |
|---|---|
| 무료 한도 | 첫 12개월: 1,000 빌드분/월 · 15 GB 저장 · 15 GB 전송/월 |
| 이후 | 빌드 $0.01/분 · 저장 $0.023/GB · 전송 $0.15/GB |
| 상업적 사용 | ✅ |
| Next.js 지원 | ✅✅ 공식 — App Router·ISR·Server Actions 풀 지원 |
| 콜드스타트 | Lambda 기반 — 첫 요청 ~수백 ms |

**장점**: Next.js 호환성 Vercel 다음. AWS 서비스(Lambda·S3·RDS)와 자연 통합. **단점**: 콘솔 UX가 Vercel만큼 우아하지 않음, 가격 예측 어려움, 12개월 후 무료 X.

**적합성**: AWS 학습 부담이 있지만 **장기 확장에서 가장 표준적**. R2 대신 S3·CloudFront로 갈 때 자연스러운 선택.

출처: [AWS Amplify Pricing](https://aws.amazon.com/amplify/pricing/)

### DigitalOcean App Platform — $5/월 고정의 PaaS

| 항목 | 값 |
|---|---|
| 무료 | 정적 사이트 3개. 동적 앱은 무료 없음 |
| 유료 | Basic $5/월 (512 MB · 1 vCPU) ~ Pro $12/월 (1 GB · 1 vCPU) |
| 상업적 사용 | ✅ |
| Next.js 지원 | ✅ 컨테이너 (`next start`) — 모든 기능 100% |
| 콜드스타트 | 없음 (컨테이너 상주) |

**장점**: **가격이 한 줄로 끝남** — $5/월이면 모든 요금 포함, 폭주 청구 없음. 컨테이너라 Next.js 100% 호환. **단점**: CDN 별도 (Cloudflare 앞단 권장), 글로벌 분산 X (단일 리전), 한국 사용자 latency 30~80 ms.

**적합성**: **Vercel Pro $20의 1/4 가격**으로 같은 기능 (Cloudflare CDN 앞단 + DO App Platform). 비용 효율을 짜내는 시점에 강력한 후보.

출처: [DigitalOcean App Platform Pricing](https://www.digitalocean.com/pricing/app-platform)

### Netlify (Starter)

| 항목 | 값 |
|---|---|
| 무료 한도 | 대역폭 100 GB/월 · 빌드 300분/월 · Edge functions 1M 호출/월 |
| 상업적 사용 | ✅ Starter 플랜에서도 허용 |
| Next.js 지원 | `@netlify/plugin-nextjs` 공식 어댑터 — App Router 풀 지원 |
| 콜드스타트 | Edge Functions는 빠름, Background Functions는 느림 |
| 빌드 환경 | Node 기본 |

**장점**: Vercel 다음으로 Next.js 호환성 좋음. 무료 plan에서 상업적 허용. **단점**: 빌드 분이 300/월로 짧음 (Hobby 6,000 대비). 대역폭도 Vercel과 동일 100 GB.

출처: [Netlify Pricing](https://www.netlify.com/pricing/)

### Railway

| 항목 | 값 |
|---|---|
| 무료 한도 | $5 크레딧/월 (월말 사용 안 한 만큼 소멸), 500 실행시간 |
| 상업적 사용 | ✅ 허용 |
| Next.js 지원 | 컨테이너 기반 — `next start`로 그대로 실행 (가장 표준적) |
| DB·R2 연동 | Network egress 별도 과금 |

**장점**: 컨테이너라 Next.js 어떤 기능도 100% 작동. **단점**: 크레딧 소진 시 정지. 자동 트래픽 비례 과금이라 비용 예측 어려움.

출처: [Railway Pricing](https://railway.app/pricing)

### Render

| 항목 | 값 |
|---|---|
| 무료 한도 | Web Service 무료 인스턴스 (15분 idle 시 sleep) |
| 상업적 사용 | ✅ 허용 |
| Next.js 지원 | 컨테이너 — Node 서버로 실행 |

**장점**: 무료 컨테이너. **단점**: **15분 무활동 시 sleep** — 다음 요청에서 cold start 20~50초. 커머스에 부적합.

### Fly.io

| 항목 | 값 |
|---|---|
| 무료 한도 | 폐지됨 (현재는 $5/월 최소). Trial $5 크레딧만 |
| 상업적 사용 | ✅ 허용 |
| Next.js 지원 | 컨테이너 — Docker로 그대로 |
| 글로벌 배포 | ✅ 멀티 리전 자동 배포 |

**장점**: 멀티 리전이 강점. 단점: 더 이상 무료 아님.

### Coolify (자체 호스팅 PaaS on VPS) — 비용 최적화 끝판

자기 VPS에 깔아서 *자가 Vercel*처럼 쓰는 오픈소스 PaaS.

| 항목 | 값 |
|---|---|
| 비용 | VPS 비용만 — Hetzner CAX21 (4 vCPU / 8 GB) **$7.59/월**, DO Droplet 4 GB $24/월 |
| 상업적 사용 | ✅ 본인 인프라 |
| Next.js 지원 | ✅ Docker로 그대로 — 어떤 기능이든 100% |
| 자동화 | Git push → 빌드 → 배포 (Vercel과 동일 UX) |
| 번들 도구 | Caddy SSL · Database · Redis · 모니터링 |

**장점**: 압도적으로 싼 비용. Vercel-like UX. 데이터 주권. 로그 무제한 보관. **단점**: 본인이 OS·보안·백업 책임. 장애 시 새벽 SSH. 1인 MVP에는 오버킬.

**적합성**: 지금은 NO. 매니지드 호스팅 비용이 $50+/월로 가는 시점에 검토.

출처: [Coolify](https://coolify.io), [Hetzner Cloud Pricing](https://www.hetzner.com/cloud)

### SST + AWS — IaC 친화 서버리스

Next.js를 AWS Lambda + CloudFront에 배포해주는 오픈소스 프레임워크. `sst.config.ts`로 인프라 정의.

| 항목 | 값 |
|---|---|
| 비용 | AWS 종량 — Lambda $0.0000167/GB-s + CloudFront $0.085/GB |
| 상업적 사용 | ✅ |
| Next.js 지원 | ✅✅ App Router·ISR·Streaming까지 (OpenNext 내장) |
| IaC | ✅ 인프라가 코드로 |

**장점**: 인프라가 git에 기록 → 환경 재현·재해 복구 강함. 0 트래픽이면 사실상 무료. AWS 리소스와 자연 통합. **단점**: AWS·IAM·CloudFormation 지식 필요. 디버깅 시 CloudWatch + SST 둘 다.

**적합성**: 지금은 너무 무겁다. AWS·IaC에 흥미가 깊으면 학습 차원에서 좋지만 1인 MVP에는 과한 추상화.

출처: [SST](https://sst.dev)

### Deno Deploy — 가벼운 Edge 대안

| 항목 | 값 |
|---|---|
| 무료 한도 | 1M req/월 · 100 GB 전송/월 · 100K KV ops/일 |
| 상업적 사용 | ✅ |
| Next.js 지원 | △ 실험적 (`@deno/next-on-deploy`) — 호환성 검증 미흡 |
| 콜드스타트 | 거의 0 (V8 isolate) |

**장점**: 무료 한도 후함, Edge runtime. **단점**: Next.js 지원이 미성숙 — SvelteKit·Hono 같은 가벼운 프레임워크에 더 적합.

**적합성**: 지금은 NO. 추후 가벼운 API endpoint 분리 시 검토.

### 검토 가치 낮은 후보 (비추)

| 후보 | 안 추천 이유 |
|---|---|
| **Heroku** | 2022년 무료 폐지 + 동급 매니지드 대비 비싼 가격 ($7/dyno·월부터, 합계 $25+) |
| **Render Free** | 15분 idle 시 sleep — 커머스 부적합 |
| **Azure Static Web Apps** | Next.js App Router 호환성 약함 |
| **Google Firebase Hosting** | 정적 + Function 조합이라 Next.js SSR 제약 |
| **Vultr / OVH / Linode (PaaS 없이)** | 운영 부담 큼 — 쓰려면 Coolify 등 PaaS 레이어 필요 |

### 비교 표 — oshikore-web 관점

| 호스팅 | 상업적 | 무료/저가 시작 | Next.js | CPU·콜드스타트 | 가격 예측 | 비고 |
|---|---|---|---|---|---|---|
| **Vercel Hobby** | ❌ | 무료 | ✅✅ | 거의 없음 | 무료 | **ToS 위반 소지** |
| **Vercel Pro** | ✅ | $20/월 | ✅✅ | 거의 없음 | 사용량 초과분 별도 | **마이그레이션 0** |
| **Cloudflare Pages** | ✅ | 무료 (대역폭 ∞) | △ 어댑터 | 0 ms · CPU 10 ms 제한 | 무료 한도 후함 | R2 시너지, 호환성 검증 필요 |
| Netlify Starter | ✅ | 무료 (100 GB) | ✅ 공식 | 거의 없음 | 빌드 분 부족 가능 | — |
| **AWS Amplify** | ✅ | 12개월 무료 | ✅✅ | 수백 ms (Lambda) | 종량 예측 어려움 | AWS 학습 비용 |
| **DO App Platform** | ✅ | **$5/월 고정** | ✅✅ | 없음 (컨테이너) | **$5 고정** | + Cloudflare CDN 권장 |
| Railway | ✅ | $5 크레딧 | ✅✅ | 없음 | 종량 — 폭주 위험 | — |
| Render Free | ✅ | 무료 (sleep) | △ | 20~50 s | 무료 | 커머스 부적합 |
| Fly.io | ✅ | $5/월~ | ✅ | 없음 (컨테이너) | $5~ | 글로벌 강점 |
| **Coolify + Hetzner** | ✅ | $7.59/월 | ✅✅ | 없음 | **$8 고정** | 운영 부담 본인 |
| SST + AWS | ✅ | AWS 종량 | ✅✅ | Lambda 콜드 | 종량 | IaC 친화 |

### 추천 시나리오 (oshikore-web)

| 시점 | 1순위 | 2순위 | 3순위 |
|---|---|---|---|
| **MVP (실판매 전, 전시용)** | Vercel Hobby 유지 | — | — |
| **실판매 시작** | **Vercel Pro $20/월** (마이그레이션 0) | DO App Platform $5 + Cloudflare CDN | Cloudflare Pages (트래픽 폭증 시) |
| **대역폭 1 TB 초과 (월)** | Cloudflare Pages | Vercel Pro ($0.40/GB 종량) | Coolify on Hetzner |
| **글로벌 멀티 리전** | Fly.io | Cloudflare Pages | — |
| **장기·대규모 확장** | AWS Amplify 또는 SST | Cloudflare Pages | — |

#### 시나리오 결정 근거

- **실판매 시작 1순위가 Cloudflare Pages → Vercel Pro로 변경**된 이유: 코드 베이스 점검 결과 `revalidatePath` 10+ 호출 + Supabase SSR Middleware 운영 중 → Cloudflare Pages 마이그레이션 비용(반나절+)이 Vercel Pro $20보다 큼.
- **DO App Platform이 2순위로 등장**한 이유: $5/월 고정 비용 + Cloudflare CDN 무료 앞단 = Vercel Pro 기능을 1/4 가격에. 단 단일 리전 latency 차이.
- **Cloudflare Pages는 트래픽이 진짜로 폭증할 때**(Vercel Pro 1 TB 초과 = 월 $400+ 추가 청구)에 비로소 마이그레이션 비용이 정당화됨.

#### 핵심 원칙

> **마이그레이션 비용 vs 절약 비용을 항상 비교.** $20/월 차이로 반나절 작업하는 건 비효율. 절약액이 마이그레이션 비용을 명확히 초과하는 시점에만 옮긴다.

#### 사전 행동 (선택)

지금 단계에서 **Cloudflare Pages PoC 1회**(별도 브랜치에서 `@opennextjs/cloudflare`로 deploy 시도)를 해 두면, 실판매 시점에 호환성 이슈 파악 비용이 줄어든다. 다만 필수는 아님.

---

## 참고: oshikore-web 트래픽 시뮬레이션

200 활성 사용자 가정. 상품 이미지는 R2로 빠지므로 Vercel egress는 HTML/JS/CSS·API 응답만.

| 항목 | 사용자당 / 월 | × 200 사용자 |
|---|---|---|
| 페이지 HTML (gzip) | 30 페이지뷰 × 50 KB | 300 MB |
| JS·CSS 청크 (캐시 후 재요청 적음) | 초기 ~200 KB + 갱신 | 50 MB |
| Server Action·RSC 응답 | 50회 × 5 KB | 50 MB |
| 인증 응답 | 10회 × 4 KB | 8 MB |
| **사용자당 ~2 MB** | | **~400 MB / 월** |
| + 어드민·봇·미디어 메타 (5× 여유) | | **~2 GB / 월** |

→ Hobby Fast Data Transfer 100 GB의 **약 2 %**. 5,000 사용자까지는 안전.

Function Invocations:
- 200 사용자 × 30 페이지뷰 × 평균 3 함수 호출 ≈ 18K / 월 (한도 100K의 18 %)

---

## 참고 자료

- [Vercel Pricing](https://vercel.com/pricing) — Hobby vs Pro vs Enterprise 전체 비교
- [Vercel Terms of Service](https://vercel.com/legal/terms) — Hobby 상업적 사용 제한 원문
- [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines) — 적발·조치 절차
- [Vercel Limits](https://vercel.com/docs/limits) — 한도 일람표
- [Vercel Pricing Changes (April 2024)](https://vercel.com/blog/improved-infrastructure-pricing) — Bandwidth 단일 라인에서 다중 라인으로 변경된 배경
- [Vercel Custom Domains](https://vercel.com/docs/projects/domains/add-a-domain) — 도메인 추가·DNS 설정
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) — Production/Preview/Development 분리
- [Cloudflare Pages Pricing](https://pages.cloudflare.com) — 대안: R2 시너지, 단 호환성 검증 필요
- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/) — 어댑터·호환성
- [OpenNext for Cloudflare](https://opennext.js.org/cloudflare) — `@opennextjs/cloudflare` 후속 어댑터
- [Netlify Pricing](https://www.netlify.com/pricing/) — Vercel-like 대안
- [AWS Amplify Pricing](https://aws.amazon.com/amplify/pricing/) — AWS 매니지드 대안
- [DigitalOcean App Platform Pricing](https://www.digitalocean.com/pricing/app-platform) — $5/월 고정 PaaS
- [Railway Pricing](https://railway.app/pricing) — 컨테이너 기반
- [Coolify](https://coolify.io) — 자체 호스팅 PaaS
- [Hetzner Cloud Pricing](https://www.hetzner.com/cloud) — Coolify용 저렴 VPS
- [SST](https://sst.dev) — IaC 친화 AWS 서버리스 프레임워크

---

## 변경 이력

- 2026-05-19 — 최초 작성: Hobby 상업적 사용 제한 명시 + Hobby/Pro 한도 + 항목별 세부(Fast Data Transfer, Function Invocations, Build Time, Image Optimization, Custom Domains, Environment Variables, Deployments, Log Retention) + oshikore-web 통합 포인트(GitHub 연동, 환경변수 매트릭스, Next.js 16 호환성) + 대안 호스팅 비교(Cloudflare Pages·Netlify·Railway·Render·Fly.io) + 추천 시나리오(MVP는 Hobby 유지, 실판매 시 Cloudflare Pages 우선) + 200 사용자 트래픽 시뮬레이션.
- 2026-05-19 — Pro 플랜 섹션 대폭 보강: 가격 단위가 "팀 멤버 ≠ 방문자"임을 명시(1인·다중 프로젝트는 $20 고정), Spend Cap 활성화 필수 안내, 별도 청구 서비스(Postgres/KV/Blob)는 우리 스택에서 0, 사용자 규모별 예상 청구액(5만 사용자급까지 $20 고정), Hobby→Pro 전환 트리거 6개 명시.
- 2026-05-19 — "비용에 영향을 주는 핵심 항목 (4개)" 섹션 신규 추가: Fast Data Transfer·Function Invocations·Function Duration·Edge Requests 4개에 집중. 각 항목 카운트 대상/줄이는 법/우리 예상 사용량(한도 대비 %). 신경 쓸 필요 없는 항목 표(Image Opt·Build·Domains·Analytics·Speed Insights·Origin Transfer = 사실상 0).
- 2026-05-19 — 대안 호스팅 비교 섹션 대폭 보강: 카테고리 맵(매니지드·Edge·컨테이너·AWS-native·자체호스팅·VPS) + 신규 후보 5종(AWS Amplify·DO App Platform·Coolify·SST·Deno Deploy) + 비추 후보 목록(Heroku·Render Free·Azure·Firebase). Cloudflare Pages 단점을 코드 기준(revalidatePath 10+ 호출, Middleware Edge runtime)으로 상세화.
- 2026-05-19 — 추천 시나리오 우선순위 재정렬: 실판매 시작 1순위를 Cloudflare Pages → **Vercel Pro $20**으로 변경(마이그레이션 비용 < 절약 비용 원칙). 2순위 DO App Platform + Cloudflare CDN($5/월), 3순위 Cloudflare Pages(트래픽 1TB 초과 시).
- 2026-08-01 — 환경변수 매트릭스 정정: 코드에 존재하지 않는 이름(`R2_ACCOUNT_ID`·`R2_BUCKET_NAME`·`R2_PUBLIC_BASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`)을 `lib/env.ts` 실제 키로 교체하고, 커뮤니티 사진용 UGC 비공개 버킷 변수 3개(`R2_UGC_BUCKET`·`R2_UGC_ACCESS_KEY_ID`·`R2_UGC_SECRET_ACCESS_KEY`) 추가. 미설정 시 `minioadmin` 폴백으로 조용히 실패하는 점 명시.
- 2026-08-02 — R2 자격증명 공유 반영: `R2_UGC_ACCESS_KEY_ID`·`R2_UGC_SECRET_ACCESS_KEY` 행 제거(코드에서 필드 삭제 — 상품·UGC가 `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` 공유, 토큰 스코프에 두 버킷 포함). "버킷 2벌·토큰 2벌" 서술을 "버킷 2벌·토큰 1벌(환경당)"로 교체.
