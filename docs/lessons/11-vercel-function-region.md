# 11. Vercel Function Region

## 왜 알아야 하는가

Vercel은 *edge region*(정적 자원 캐싱·라우팅)과 *function region*(서버 함수 실행)을 **분리**합니다. 한국 사용자에게 edge가 가까워도 **함수가 멀리 있으면 매 DB 쿼리·외부 API 호출에 태평양 왕복 latency가 누적**됩니다.

이 프로젝트도 첫 베타 배포 후 그룹·멤버 조회 시 매 페이지 로드 0.7~1초 지연을 경험했습니다. 원인: function region이 `iad1`(Washington DC)이고 Supabase 프로젝트가 `aws-1-ap-northeast-2`(Seoul)이라 *모든* DB 쿼리가 한미 왕복 200ms를 추가로 부담. 함수 region을 `icn1`(Seoul)로 변경한 후 ~30ms로 단축. (2026-05-24)

## 핵심 개념

### Edge region vs Function region

| 구분 | 역할 | 사용자 체감 |
|---|---|---|
| **Edge region** | 정적 자원 (HTML·CSS·JS·이미지) 캐싱 + 사용자 가까운 곳에서 응답 | TTFB·정적 자원 latency |
| **Function region** | Server Component·Server Action·Middleware·API Route 실행 | DB 쿼리·외부 API 호출 latency |

매 페이지 요청 → 사용자 → *가장 가까운 edge* → 함수 호출 시 *function region 으로 라우팅* → DB·외부 API 호출 → 응답 → edge → 사용자.

### `x-vercel-id` 헤더로 현재 region 확인

응답 헤더에 두 region이 모두 들어 있습니다:

```
x-vercel-id: icn1::iad1::jzbmt-1779505740957-f5318f57c245
                  ↑     ↑
                  │     function region (Washington DC)
                  edge region (Seoul)
```

형식: `<edge>::<function>::<request-id>`. **두 region이 다르면** edge가 가까워도 함수 호출 시 *function region까지의 왕복*이 추가됩니다.

### Function region ↔ DB region 정렬이 핵심

대부분의 서비스에서 *function region과 DB region을 일치*시키는 게 가장 큰 latency 단축. 사용자와 가까운 것보다 *DB와 가까운 것*이 더 중요한 이유:

- 한 페이지 로드 = 1개 사용자 ↔ edge 왕복
- 한 페이지 로드 = N개 함수 ↔ DB 왕복 (쿼리 개수만큼)

쿼리가 여러 개면 N배 누적. 사용자↔edge 왕복은 1회로 고정.

## 코드/문법

### Vercel Dashboard UI로 변경

프로젝트 → **Settings → Functions → Function Regions** → 원하는 region 선택.

Hobby plan도 *single region* 선택 가능. multi-region은 Pro 이상.

### `vercel.json`으로 변경 (코드 commit)

저장소 루트에 `vercel.json`:

```json
{
  "regions": ["icn1"]
}
```

**우선순위**: `vercel.json`이 있으면 그게 Dashboard UI 설정을 *override*. 둘을 동시 사용하면 *vercel.json이 진실 소스*. 한 가지 방식으로 통일 권장.

### 페이지별 region 지정 (route segment config)

```ts
// app/(admin)/layout.tsx
export const preferredRegion = "icn1";
```

전체 default와 다른 region을 *특정 페이지에만* 적용하고 싶을 때. 이 프로젝트는 *전체 함수가 한 region*이라 불필요.

## 주요 region 코드 + 한국 ↔ region RTT 추정

| 코드 | 위치 | 한국 사용자 RTT | 한국 DB(Supabase ap-ne-2) RTT |
|---|---|---|---|
| `icn1` | Seoul (Asia Pacific) | ~30ms | ~10ms (같은 리전 내) |
| `hnd1` | Tokyo (Asia Pacific) | ~50ms | ~50ms |
| `sin1` | Singapore (Asia Pacific) | ~100ms | ~100ms |
| `iad1` | Washington DC (US East) | ~180ms | ~200ms |
| `sfo1` | San Francisco (US West) | ~140ms | ~150ms |
| `cdg1` | Paris (Europe) | ~280ms | ~270ms |
| `fra1` | Frankfurt (Europe) | ~260ms | ~250ms |
| `syd1` | Sydney (Asia Pacific) | ~150ms | ~140ms |
| `gru1` | São Paulo (South America) | ~320ms | ~310ms |

**한국 사용자 + Supabase ap-northeast-2** 조합에서 `icn1` 압도적 우위.

## 이 프로젝트의 결정

### 1. Function region = `icn1` (Seoul)

Supabase 프로젝트가 `aws-1-ap-northeast-2` (Seoul)이므로 함수도 Seoul로 정렬. 한국 사용자도 같은 지역이라 *사용자·함수·DB 셋 다 한 지역*. RTT 압도적 최저.

설정 위치: Vercel Dashboard → Settings → Functions → Function Regions → Asia Pacific → Seoul. `vercel.json`은 두지 않고 Dashboard UI만 사용 (한 곳에서 관리).

### 2. 변경 후 검증

```bash
curl -sI https://oshikore-web-beta.vercel.app/ | grep x-vercel-id
# x-vercel-id: icn1::icn1::xxxx  ← 둘 다 icn1이면 정렬 완료
```

또는 DevTools Network 탭에서 TTFB 측정. 변경 전 ~700ms → 변경 후 ~100-200ms 수준이면 성공.

### 3. 운영 점검 트리거

다음 상황에서 region 정렬을 재점검:

| 상황 | 확인할 자리 |
|---|---|
| Supabase 프로젝트 region을 옮기는 경우 | Vercel function region도 같이 |
| R2 storage region 변경 시 | 이미지 업로드·서명 latency 점검 |
| 외부 API(결제, 알림 등) 신규 도입 | 그 API의 region과 함수 region 거리 |
| 베타 → 프로덕션 전환 | 함수·DB 정렬 + cold start 영향 측정 |

## 함정·주의

- **빌드 region ≠ 함수 region**: Vercel 빌드 로그에 `"Running build in Washington, D.C., USA (East) – iad1"`이 나와도 그건 *빌드 머신*이지 *함수 실행 region*이 아님. 함수 region은 `x-vercel-id` 헤더로 확인.
- **Hobby plan의 multi-region 제한**: Hobby는 *single region 선택*만. Pro는 multi-region 가능 (geo-routing). 한국 한정 서비스라면 Hobby로 충분.
- **Edge runtime vs Node.js runtime**: middleware는 default Edge runtime. Edge function은 *region이 다른 의미*로 동작 (사용자 가까운 곳에서 실행). 이 프로젝트의 middleware도 Edge라 *function region 설정 영향 없음*. 단 Server Component·Server Action은 영향 있음.
- **region 변경 후 redeploy 필수**: Dashboard에서 region을 바꿔도 *기존 배포*는 이전 region 그대로. 변경 적용은 새 배포부터.

## 참고

- [Vercel — Configuring regions for functions](https://vercel.com/docs/functions/configuring-functions/regions)
- [Vercel — Available regions](https://vercel.com/docs/edge-network/regions)
- [Vercel — `vercel.json` reference (regions)](https://vercel.com/docs/projects/project-configuration#regions)
- [`docs/lessons/10-database-url-password.md`](./10-database-url-password.md) — 함께 자주 만나는 운영 함정
- [`docs/vercel-adoption.md`](../vercel-adoption.md) — 호스팅 선택 근거
- 실제 사고: 2026-05-24 베타 배포 직후 그룹·멤버 페이지 0.7~1초 지연. `x-vercel-id`로 `iad1` 확인 후 Dashboard에서 `icn1`로 변경 → 정상화.
