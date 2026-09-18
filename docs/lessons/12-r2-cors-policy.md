# 12. R2 CORS 정책

## 왜 알아야 하는가

이 프로젝트는 어드민에서 사진 업로드 시 브라우저가 **R2에 직접 PUT presigned URL**을 호출합니다 (서버 프록시 X). 이 흐름은 *cross-origin*이라 브라우저가 **OPTIONS preflight**를 먼저 보내고, R2 측에 *명시적 CORS 정책*이 없으면 `403 Forbidden`으로 차단되어 업로드 자체가 실패합니다.

함정: **로컬에서는 잘 되는데 베타에서만 깨집니다**. 이유는 *스토리지 서버 자체가 다르고 기본 정책도 다르기 때문* — 아래 §"로컬 MinIO vs 운영 R2" 참조.

이 프로젝트도 첫 베타 배포 후 어드민에서 상품 사진 업로드 시 *OPTIONS 403*을 만나, Cloudflare R2 Dashboard에서 CORS 정책을 명시 추가한 뒤 정상화. (2026-05-24)

## 핵심 개념

### CORS preflight = 본 요청 *전에* 권한 묻기

브라우저는 *cross-origin* 요청 중 *non-simple*(PUT, 커스텀 헤더 포함 등)에 대해 **본 요청 전에 OPTIONS 요청**을 자동 발송. 서버가 *허용한다*고 응답해야 본 요청이 발사됨.

```
1. OPTIONS /presigned-url → R2
   - Origin: https://iroiro-beta.vercel.app
   - Access-Control-Request-Method: PUT
   - Access-Control-Request-Headers: content-type
2. R2 응답:
   - 200 OK + Access-Control-Allow-Origin: ... → 본 요청 허용
   - 403 Forbidden → 차단 (CORS 정책 부재·origin 불일치 시)
3. PUT /presigned-url → R2 (preflight 통과 후에만)
```

### R2 CORS 정책의 5개 필드

| 필드 | 방향 | 의미 |
|---|---|---|
| `AllowedOrigins` | 요청 | 허용할 origin 목록. **정확히 일치해야 한다** — wildcard 서브도메인 패턴은 매칭되지 않는다 |
| `AllowedMethods` | 요청 | 허용할 HTTP 메서드. PUT(업로드) + GET·HEAD(조회) 위주 |
| `AllowedHeaders` | 요청 | 클라가 보내도 OK인 헤더. 보통 `["*"]` |
| `ExposeHeaders` | **응답** | JS가 `response.headers.get(...)`로 읽어도 OK인 헤더. 기본 safelist 외엔 명시 필수 |
| `MaxAgeSeconds` | 응답 | 브라우저가 preflight 결과를 캐싱할 시간. 1시간(3600)이 일반적 |

`AllowedHeaders`(요청 측)와 `ExposeHeaders`(응답 측)는 *방향이 정반대*라 자주 헷갈림.

## 로컬 MinIO vs 운영 R2 — *기본 정책 차이*가 함정의 핵심

| 항목 | 로컬 MinIO (`compose.yml`) | 운영 R2 (`oshikore-beta` 버킷) |
|---|---|---|
| 스토리지 서버 | self-hosted MinIO Docker 컨테이너 | Cloudflare 관리형 R2 |
| 버킷 정책 | `mc anonymous set public local/oshikore-products-dev` — **anonymous public** | default *비공개* + 명시 CORS 필요 |
| CORS 기본 동작 | 관용적 — 정책 없어도 wildcard 응답 | 엄격 — 정책 없으면 *어떤 origin도* 차단 |
| Origin 관계 | `localhost:3000` ↔ `localhost:9000` | 별개 도메인 |

**MinIO는 식당 문 활짝 열어둠 / R2는 명단 예약자만 입장**. 같은 S3 호환 API라도 CORS 구현이 다름. 로컬에서 통과한 흐름이 베타에서 깨지는 *전형적 환경 불일치 함정*.

같은 패턴이 다른 자리에도 잠재:

| 자리 | 로컬 default | 운영 default | 함정 |
|---|---|---|---|
| R2 객체 public 접근 | MinIO anonymous public → URL 직접 접근 OK | R2 비공개 → R2.dev 또는 custom domain 필요 | 업로드 OK인데 *이미지 표시 깨짐* |
| Supabase auth | 로컬 동일 정책 | 동일 | 큰 함정 없음 |
| Function region latency | localhost ↔ localhost (0ms) | iad1 ↔ ap-northeast-2 (200ms) | lesson 11 참조 |

## 코드/문법

### Cloudflare R2 Dashboard 위치

R2 Dashboard → 버킷 선택 → **Settings** → **CORS Policy** → **Add CORS policy**.

### 권장 정책 (이 프로젝트 기준)

베타 단계 — 단일 origin만:

```json
[
  {
    "AllowedOrigins": [
      "https://iroiro-beta.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

PR preview·로컬 R2 직접 검증 필요 시 origin 추가:

```json
"AllowedOrigins": [
  "https://iroiro-beta.vercel.app",
  "http://localhost:3000"
]
```

origin은 **정확히 문자열 비교**되므로 PR마다 주소가 달라지는 preview는 wildcard로 일괄 허용할 수 없다. 필요하면 배포 후 확인된 정확한 origin을 개별 등록할 수 있지만, 반복적인 운영에는 **고정 preview 도메인**을 연결하는 방식을 권장한다.

`DELETE`는 Server Action에서만 호출 → 브라우저 직접 호출 안 함 → CORS에 두지 않음.

## 함정·주의

### 1. *정책 변경 후* 브라우저 캐싱

`MaxAgeSeconds=3600` 동안 *이전 preflight 결과*가 브라우저에 캐싱. 정책 추가 직후에도 *이전 403 응답*이 살아 있어 *여전히 실패로 보임*. 해결:

- **incognito 창**에서 재테스트 (가장 깔끔)
- DevTools(F12) → Network → "Disable cache" 체크 후 새로고침
- 또는 `MaxAgeSeconds`를 일시적으로 작게 (`60`) 두고 검증 후 복원

### 2. *버킷별로* 정책 분리

운영 버킷 한 곳에만 정책 등록하고 *베타 버킷에는 잊는* 사고. 환경 추가(staging, qa 등) 시 각 버킷에 *동일 정책 복제* 필요. 자동화 없으면 체크리스트로.

### 3. wildcard origin은 **동작하지 않는다**

R2 공식 문서는 **"Origin values must match exactly"** 로 못박는다([Configure CORS](https://developers.cloudflare.com/r2/buckets/cors/)). S3의 CORS와 달리 `https://*.vercel.app` 같은 서브도메인 wildcard는 **어떤 origin에도 매칭되지 않는다** — 등록해도 조용히 무효라, "설정했는데 preview에서만 CORS 오류"로 나타난다.

값은 경로 없이 `scheme://host[:port]` 형태여야 한다. 끝에 `/`가 붙은 `https://static.example.com/`도 무효.

preview처럼 주소가 달라지는 환경은 wildcard로 일괄 허용할 수 없다. 배포 후 확인된 정확한 origin을 그때그때 개별 등록하는 것도 가능하지만, PR마다 정책을 고쳐야 하므로 반복 운영에는 **고정 preview 도메인** 연결을 권장한다. 착수 게이트의 G11이 ACAO 정확 일치를 검사해 이 조건을 지킨다.

### 4. `ExposeHeaders` 누락 시 `null`

R2 PUT 응답의 `ETag`를 JS에서 `response.headers.get("ETag")`로 읽으려면 `ExposeHeaders: ["ETag"]` 필수. 누락 시 *조용히 null* 반환 — 디버깅 어려움.

### 5. *브라우저별 `MaxAgeSeconds` 상한*

| 브라우저 | 상한 |
|---|---|
| Chrome/Edge | 7200초 (2시간) |
| Firefox | 24시간 |
| Safari | 600초 (10분) — 가장 짧음 |

Safari 사용자 비중이 크면 *effective 상한이 10분*이라 자주 preflight 발생. 평균 latency 측정 시 고려.

## 이 프로젝트의 결정

### 1. CORS 정책 — 베타엔 단일 origin

`https://iroiro-beta.vercel.app`만 등록. wildcard는 R2에서 매칭되지 않으므로 대안이 아니다 — PR preview에서 업로드 검증이 필요하면 그 배포에 **고정 도메인을 붙이고** 해당 origin을 한시적으로 추가한 뒤 검증 종료 시 제거한다.

### 2. 검증 채널 — incognito 창 우선

CORS 정책 변경 후 *반드시* incognito로 첫 검증. 일반 창에서의 캐싱 함정 회피.

### 3. 환경별 버킷·정책 매트릭스 명문화

| 환경 | R2 endpoint | 버킷 | CORS origin |
|---|---|---|---|
| 로컬 | MinIO `http://localhost:9000` | `oshikore-products-dev` | anonymous public (정책 무관) |
| 베타 | Cloudflare R2 | `oshikore-beta` | `iroiro-beta.vercel.app` |
| production (예정) | Cloudflare R2 | `oshikore-products-prod` | `oshikore.kr` 등 |

새 환경 추가 시 *버킷 생성 + CORS 정책 등록 + Vercel env 등록* 3 단계 모두 수행. 누락 시 사고 자리.

## 참고

- [Cloudflare R2 — Configure CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [MDN — Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [MDN — `Access-Control-Max-Age`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Max-Age)
- [MDN — `Access-Control-Expose-Headers`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Expose-Headers)
- [`docs/r2-adoption.md` §5](../r2-adoption.md) — 셋업 절차의 CORS 단계
- [`docs/lessons/08-r2-storage-pattern.md`](./08-r2-storage-pattern.md) — R2 도입 전체 패턴
- [`docs/lessons/11-vercel-function-region.md`](./11-vercel-function-region.md) — 함께 자주 만나는 *로컬↔운영 환경 불일치* 함정
- 사고 사례: 2026-05-24 베타 배포 직후 어드민 사진 업로드 시 OPTIONS 403. CORS 정책 미설정이 원인. `https://iroiro-beta.vercel.app` origin 등록 후 정상화.

---

## 변경 이력

- 2026-08-01 — **wildcard origin 서술 정정**: `AllowedOrigins`가 wildcard 서브도메인(`*.vercel.app`)을 one-level 매칭한다고 서술했으나 사실이 아니다. R2는 origin을 정확히 문자열 비교하므로(공식 문서 "Origin values must match exactly") wildcard 항목은 등록해도 무효다. 관련 서술 4곳(필드 표·예시 JSON·함정 3번·프로젝트 결정)을 정정하고, preview는 확인된 정확한 origin을 개별 등록하거나 고정 preview 도메인을 연결하도록 안내를 바꿨다.
