# Cloudflare R2 도입 검토

Cloudflare R2를 도입·운영하면서 결정해야 할 사항을 모아두는 살아있는 문서.
관련 문서:

- **선택 근거** (왜 R2인가, 후보 비교) → [image-strategy.md](./image-strategy.md)
- **코드 패턴** (DB는 메타, 스토리지는 바이트) → [lessons/08-r2-storage-pattern.md](./lessons/08-r2-storage-pattern.md)
- **이 문서** → 운영 한도, Dashboard 셋업 절차, CORS·API Token·환경 분리, 보안 모범 사례

---

## 무료 플랜 할당량 (2026-05 기준)

### 한눈에 보기

| 영역 | 무료 한도 / 월 |
|---|---|
| **Storage** | 10 GB |
| **Class A operations** (write: PUT/POST/COPY/LIST) | 1,000,000 |
| **Class B operations** (read: GET/HEAD) | 10,000,000 |
| **Egress** (outbound 트래픽) | **무제한 무료** |
| **API 요청 수 자체** | 무제한 |
| **버킷 개수** | 1,000 / 계정 |
| **파일 크기** | 4.995 TB / object |
| **객체 키 길이** | 1,024 bytes |

출처: [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)

### 핵심 가치 — Egress 무료

R2가 S3·Supabase Storage 대비 가지는 단 하나의 가장 큰 차별점.

| 시나리오 | S3 egress | R2 egress |
|---|---|---|
| 100 GB / 월 외부 트래픽 | ~$9.0 | **$0** |
| 1 TB / 월 | ~$90 | **$0** |
| 10 TB / 월 | ~$900 | **$0** |

→ 트래픽이 늘어도 비용 증가가 사실상 0. 굿즈 카탈로그처럼 *조회 트래픽이 큰* 서비스에 결정적 이점.

### Free 한도 초과 시 단가

| 항목 | 단가 |
|---|---|
| Storage | $0.015 / GB·월 |
| Class A (write) | $4.50 / 1M ops |
| Class B (read) | $0.36 / 1M ops |
| Egress | **항상 $0** |

→ 100 GB 저장 + 월 10M 조회: 약 $1.5 + $0.36 = **$1.86 / 월** 수준.

---

## 운영 셋업 실전 절차 (Dashboard 경로)

### 0. 사전 확인

| 항목 | 확인 |
|---|---|
| Cloudflare 계정 | https://dash.cloudflare.com 가입 (또는 로그인) |
| 결제 카드 등록 | R2 활성화에 필요 (무료 한도 안에선 청구 0이지만 카드 필요) |
| iroiro에 사용할 도메인 | 추후 커스텀 도메인 연결 시 필요 |

### 1. R2 활성화 (계정당 1회)

- Dashboard 좌측 사이드바 > **R2** 클릭
- 처음이라면 **Purchase R2 Plan** 버튼 → "Continue with free plan" 선택
- 결제 카드 정보 입력 (한도 안에선 0 청구)

### 2. 운영 버킷 생성 — 공개 상품 버킷 + 비공개 UGC 버킷

이 앱은 **버킷 2개**를 쓴다. 하나로 합칠 수 없다 — R2에서 공개 여부는 **버킷 단위** 속성이라, 상품 이미지를 공개하려면 그 버킷 전체가 공개된다. 사용자가 올린 사진을 같은 버킷에 두면 키만 알면 누구나 열 수 있는 개인 사진 저장소가 된다.

| 버킷 | 용도 | 공개 여부 | 환경변수 |
|---|---|---|---|
| `oshikore-products-prod` | 어드민이 등록하는 상품 이미지·공지 첨부(notices/) | **공개** (커스텀 도메인) | `R2_BUCKET` |
| `oshikore-ugc-prod` | 커뮤니티 글에 첨부된 사용자 사진 | **비공개** (서명 URL로만 접근) | `R2_UGC_BUCKET` |

두 버킷 모두 R2 메뉴 > **Create bucket**으로 같은 입력값을 쓴다:

| 항목 | 권장 값 | 비고 |
|---|---|---|
| Bucket Name | `oshikore-products-prod` / `oshikore-ugc-prod` | 소문자·숫자·하이픈, 3~63자, 전역 unique |
| Location | **Asia-Pacific (APAC)** | 한국 사용자 latency 최적 |
| Default Storage Class | **Standard** | IA(Infrequent Access)는 조회가 드문 데이터용 |

- **Create bucket** → 생성 완료

> ⚠️ **UGC 버킷에는 Step 4의 공개 액세스 설정을 하지 않는다.** R2.dev도, 커스텀 도메인도 연결하지 않는다. 앱은 매 요청마다 15분짜리 서명 GET URL을 발급해 읽는다. 공개로 열면 서명 검증이 통째로 무의미해진다.

> Beta 환경을 별도로 둘 거면 같은 절차로 `oshikore-products-beta`·`oshikore-ugc-beta` 추가 생성. 환경별 버킷 분리는 prod 데이터 오염 방지의 핵심.

#### UGC 버킷 Lifecycle 규칙 (필수)

업로드는 `posts/tmp/`에 먼저 올라가고, 서버 검증을 통과해야 `posts/`로 승격된다. 사용자가 첨부만 하고 글을 등록하지 않으면 `posts/tmp/` 객체가 그대로 남으므로 자동 정리가 필요하다.

- UGC 버킷 > **Settings** > **Object lifecycle rules** > **Add rule**

| 항목 | 값 |
|---|---|
| Rule Name | `Staged Upload Expiration Rule` |
| 규칙 범위 (prefix) | `posts/tmp/` |
| 수명 주기 작업 | **다음 이후 업로드된 개체 삭제** — **1일** |

> prefix를 비우면 `posts/`의 정상 사진까지 1일 후 삭제된다. 반드시 `posts/tmp/`로 한정할 것.

### 3. API Token 발급 (운영용·최소권한)

버킷은 2개지만 **토큰은 환경당 1개**를 발급하고, 스코프에 두 버킷을 모두 포함한다(2026-08-02 결정).

| 토큰 | 스코프 버킷 | 환경변수 |
|---|---|---|
| `oshikore-prod-rw` | `oshikore-products-prod` · `oshikore-ugc-prod` | `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` |

R2 Object 토큰은 **여러 버킷에 스코프할 수 있다**([R2 API 토큰 문서](https://developers.cloudflare.com/r2/api/tokens/)). 버킷별 전용 토큰으로 나누면 한쪽 토큰·코드 경로가 침해돼도 다른 버킷에 닿지 않는 이점이 있으나, pre-launch 단계의 운영 단순화를 우선해 공유로 결정했다. 분리로 되돌리려면 UGC 전용 토큰을 발급하고 `lib/env.ts`에 `R2_UGC_ACCESS_KEY_ID`/`R2_UGC_SECRET_ACCESS_KEY` 필드와 전용 클라이언트를 복원한다.

반면 **Admin 권한 토큰은 계정 범위**라 버킷으로 좁힐 수 없다. 앱 런타임 자격증명으로는 부적합하다.

#### 토큰 종류 선택 — 계정 API 토큰

발급 페이지에 "**계정 API 토큰**"과 "**사용자 API 토큰**" 두 옵션이 있다.

| 토큰 종류 | 소유 주체 | 우리 선택 |
|---|---|---|
| **계정 API 토큰** | 계정 (Organization) | ✅ **운영 앱 표준** |
| 사용자 API 토큰 | 개인 사용자 | ❌ 사용자 탈퇴·계정 이전 시 무효화 |

→ 앱은 특정 사람을 대표하지 않으므로 계정 단위 소유가 의미상 정확.

#### 발급 절차

- R2 좌측 메뉴 > **Manage R2 API Tokens** > **계정 API 토큰 만들기**
- 입력값:

| 항목 | 권장 값 | 이유 |
|---|---|---|
| Token Name | `oshikore-prod-rw` | 환경·권한 명시 |
| Permissions | **Object Read & Write** | 앱은 객체 단위만. Admin은 불필요·위험 (버킷 삭제·CORS 변경 가능) |
| Specify Bucket | **Apply to specific buckets** → `oshikore-products-prod` + `oshikore-ugc-prod` | 앱이 쓰는 두 버킷만 지정. 계정 전체(Apply to all buckets)로 넓히지 않는다 |
| TTL | **계속 (Never expires)** | 자동 만료는 사고 트리거. 회전은 별도 수동 정책 |
| Client IP Filter | **비워둠 (포함·제외 모두)** | Vercel 동적 IP라 필터 적용 불가 |

#### 생성 후 화면에 표시되는 4개 값

| 화면 표시 | 의미 | 우리 환경변수 |
|---|---|---|
| **토큰** (Bearer Token) | Cloudflare 네이티브 API용 (`wrangler` CLI 등) | **안 씀** (무시 OK) |
| **액세스 키 ID** | S3 호환 인증 공개 식별자 | `R2_ACCESS_KEY_ID` |
| **비밀 액세스 키** | S3 호환 서명 키 (**1회만** 표시) | `R2_SECRET_ACCESS_KEY` (Sensitive) |
| **S3 클라이언트 관할지별 엔드포인트** | S3 API URL | `R2_ENDPOINT` |

##### 왜 Bearer Token은 안 쓰는가

발급 화면의 **토큰** 값은 Cloudflare 자체 API 인증 방식. 우리 [`lib/r2/client.ts`](../lib/r2/client.ts)는 **AWS SDK (S3 호환)** 를 사용하므로 *액세스 키 + 비밀 키 + 엔드포인트* 3개만 필요. Bearer Token은 `wrangler` CLI나 Cloudflare API 직접 호출 시에만 필요 — 그런 작업 추가하면 그때 별도 토큰 발급.

##### 엔드포인트 관할지 선택

| 관할지 | 데이터 저장 위치 | 우리 선택 |
|---|---|---|
| **Default (관할지 없음)** | 전세계 분산 자동 라우팅 | ✅ 한국·아시아 사용자 |
| EU | EU 내부 (GDPR 준수) | EU 한정 비즈니스 시만 |
| FedRAMP | 미국 정부 컴플라이언스 | 해당 없음 |

→ **Default 엔드포인트** 복사 (`<account-id>.r2.cloudflarestorage.com` 형태).

> ⚠️ **비밀 액세스 키는 다시 볼 수 없음**. 1Password 같은 비밀번호 관리자에 즉시 저장. 분실 시 토큰 Revoke + 재발급 외에 복구 방법 없음.

#### UGC 버킷 스코프 포함 확인 (필수)

UGC 버킷용 별도 토큰은 발급하지 않는다 — UGC 서명도 같은 자격증명을 쓰므로, 위 토큰의 Specify Buckets에 `oshikore-ugc-prod`가 포함됐는지 확인한다. 상품 버킷만으로 이미 발급된 토큰이 있다면 **토큰 편집으로 UGC 버킷을 스코프에 추가**한다 — roll 하지 않는 한 액세스 키·시크릿이 유지되므로 환경변수 교체는 불필요하다.

> Object R&W면 충분하다. UGC 경로는 presign·HEAD·range GET·CopyObject·DELETE만 수행하고 버킷 설정은 건드리지 않는다. Admin 권한 토큰은 **계정 범위**라 버킷으로 좁힐 수 없어 런타임 자격증명으로 부적합하다.

#### 베타 환경용 별도 토큰 발급

같은 절차를 beta 버킷 2개 스코프로 **한 번 더** 진행. 토큰들이 같은 페이지에 나란히 표시되며 완전 독립.

| 토큰 | 스코프 | Vercel 환경 |
|---|---|---|
| `oshikore-prod-rw` | `oshikore-products-prod` · `oshikore-ugc-prod` | Production |
| `oshikore-beta-rw` | `oshikore-products-beta` · `oshikore-ugc-beta` | Preview |

→ 한 토큰 유출이 다른 환경·다른 버킷에 영향 없음. **토큰 분리가 격리의 핵심**.

#### 토큰 회전 정책 (수동)

TTL "계속"이지만 보안을 위해 **수동 회전 캘린더** 운영:

| 시기 | 액션 |
|---|---|
| 6개월마다 | 정기 회전 (보안 best practice) |
| 키 유출 의심 시 | 즉시 Revoke + 재발급 |
| 멤버 이탈 시 (해당 시) | 즉시 |

**무중단 회전 순서**: 새 토큰 발급 → Vercel 환경변수 갱신 + 재배포 → 동작 확인 → 기존 토큰 Revoke. 다운타임 0.

### 4. 공개 액세스 설정 (상품 버킷 **한정**)

이미지를 브라우저에서 직접 보려면 두 옵션 중 하나 (또는 둘 다).

> ⚠️ 이 단계는 `oshikore-products-prod`에만 적용한다. **UGC 버킷은 건너뛴다** — R2.dev도 커스텀 도메인도 연결하지 않는다. 사용자 사진은 앱이 발급하는 15분짜리 서명 GET URL로만 읽는다.

#### 옵션 A — R2.dev 임시 도메인 (MVP·테스트용)

- 버킷 > **Settings** > **Public Development URL** > **Enable / Allow Access**
- 생성 URL 패턴: `https://pub-<hash>.r2.dev` (해시는 Cloudflare 자동 발급)
- 이 URL이 `R2_PUBLIC_BASE` 값

##### R2.dev의 운영 부적합 사유

> ⚠️ Cloudflare가 "**for development purposes only**" 명시. 운영에서 의존하면 안 되는 이유들:

| 단점 | 운영 영향 |
|---|---|
| **Rate Limit** | 트래픽 폭증(바이럴·캠페인) 시 일부 요청 차단 → 사용자에게 이미지 깨짐 |
| **ToS 위반** | 상업적·운영 트래픽은 약관 위반. Cloudflare 일방 비활성화 가능 |
| **CDN 캐시 제한적** | 기본 TTL만 적용. `Cache-Control: max-age=31536000` 같은 적극 캐싱 불가 → Class B operations 카운트 증가 |
| **응답 헤더 통제 X** | `Content-Disposition`·보안 헤더 등 커스터마이즈 불가 |
| **URL 변경 위험** | Cloudflare가 정책 변경 시 hash 변경 가능. 버킷 재생성 시 새 hash |
| **신뢰도 낮음** | `pub-xxxxxx.r2.dev`는 사용자가 의심·피싱처럼 인식 |
| **Workers 통합 X** | 동적 이미지 변환·워터마크·인증 게이트 불가 |
| **SEO·OG 약함** | 검색·소셜 미리보기에서 페널티 가능 |

##### 적합 시나리오

| 시나리오 | R2.dev 적합? |
|---|---|
| 로컬 개발 (이미 MinIO) | 해당 없음 |
| **Vercel Preview (베타) 배포** | ✅ 내부 검증, 트래픽 낮음 |
| MVP 검증 (도메인 미보유) | △ 한시적 OK — 빨리 도메인 확보 |
| **본격 운영 (실판매)** | ❌ **부적합** — 옵션 B 필수 |
| 외부 사용자에게 URL 직접 공유 | ❌ 신뢰도 문제 |

#### 옵션 B — 커스텀 도메인 (운영용 권장)

##### 비용

| 항목 | 비용 |
|---|---|
| Cloudflare 커스텀 도메인 연결 기능 | **$0** (R2 무료 기능) |
| SSL 인증서 자동 발급·갱신 | $0 |
| Cloudflare CDN·DDoS 보호 | $0 (Free 플랜) |
| R2 Egress (커스텀 도메인 경유) | $0 (항상 무료) |
| **도메인 등록비** (도메인 미보유 시) | TLD에 따라 — `.com` ~$10/년, `.kr` ~₩15,000/년 |

→ Cloudflare 측 추가 비용 0. 도메인 보유했으면 부담 없이 추가 가능.

##### 셋업 절차

도메인이 이미 있다면 (예: `oshikore.kr`):

- 버킷 > **Settings** > **Custom Domains** > **Connect Domain**
- 입력: 서브도메인 (예: `images.oshikore.kr` 또는 `cdn.oshikore.kr`)
- 도메인이 Cloudflare DNS면 → **자동으로 DNS·SSL 설정** (별도 작업 없음)
- 도메인이 외부 DNS면 → 안내되는 CNAME 값을 외부 DNS에 추가
- 1~10분 후 SSL 발급 완료 → `https://images.oshikore.kr`로 접근 가능
- 이 URL이 `R2_PUBLIC_BASE` 값

##### 도메인 등록처 추천

| 등록처 | `.com` 가격 | 비고 |
|---|---|---|
| **Cloudflare Registrar** | $10.44/년 (도매가) | ⭐ R2 통합 1-클릭 셋업 |
| Porkbun | ~$9/년 | 가성비 |
| Namecheap | 첫해 ~$8 (이후 ~$13) | 첫해 할인 강함 |
| 가비아 | ~₩30,000/년 | `.kr` 등록 가능 |

→ R2 통합 편의 + 도매 가격이라 **Cloudflare Registrar 추천**.

##### prod·beta 모두 커스텀 도메인 (선택)

도메인 보유 시 베타에도 커스텀 도메인 적용 가능 — 추가 비용 0.

| 환경 | URL 예시 |
|---|---|
| Production | `https://images.oshikore.kr` |
| Beta | `https://beta-images.oshikore.kr` |

베타 사이트를 외부 사용자에게 보여줄 계획이면 권장. 내부 검증 한정이면 R2.dev로도 충분.

### 5. CORS 설정 (브라우저 직접 업로드용)

어드민에서 사진 업로드 시 브라우저가 R2에 PUT 요청을 직접 보냄 ([`lib/r2/presign.ts`](../lib/r2/presign.ts)). CORS 허용 없으면 차단.

**두 버킷 모두 각각 설정한다.** CORS는 버킷 단위 속성이라 상품 버킷에 걸어도 UGC 버킷에는 적용되지 않는다. 커뮤니티 사진 업로드도 브라우저가 UGC 버킷에 직접 PUT한다.

공개 버킷으로 직접 PUT하는 경로는 **상품 사진과 공지 첨부 사진(`notices/` prefix) 둘 다**다. 아래 상품 버킷 정책이 `PUT` + `AllowedHeaders: ["*"]`를 이미 포함하므로 공지 사진에 별도 CORS 작업은 필요 없다(공지 업로드는 `Content-Type` 헤더만 보낸다).

- 버킷 > **Settings** > **CORS Policy** > **Add CORS policy**

```json
[
  {
    "AllowedOrigins": [
      "https://oshikore.kr",
      "https://beta.oshikore.kr",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- `localhost:3000`은 로컬 개발용 (production 배포 후 제거 가능)
- ⚠️ **wildcard origin은 동작하지 않는다.** R2는 요청 `Origin`을 `AllowedOrigins` 값과 **정확히 문자열 비교**하므로 `https://*.vercel.app`은 어떤 Vercel preview도 허용하지 않는다 ([R2 CORS 문서](https://developers.cloudflare.com/r2/buckets/cors/)). preview에서 업로드가 필요하면 배포 후 확인된 정확한 origin을 개별 등록할 수 있지만, PR마다 정책을 고쳐야 하므로 반복 운영에는 **고정 도메인**(`beta.oshikore.kr` 등)을 preview 배포에 붙이고 그 origin을 등록하는 방식을 권장한다.
- 착수 게이트의 G11이 같은 원칙을 검사한다 — ACAO 응답이 정확히 일치하지 않으면(wildcard 포함) FAIL.

#### UGC 버킷 CORS (더 좁게)

UGC 버킷은 브라우저가 **PUT만** 한다. 읽기는 서버가 발급한 서명 URL을 `<img>`가 로드하므로 CORS 대상이 아니다. 메서드와 헤더를 상품 버킷보다 좁힌다.

```json
[
  {
    "AllowedOrigins": [
      "https://oshikore.kr",
      "https://beta.oshikore.kr",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- `AllowedHeaders`에 `Content-Type`·`If-None-Match`가 없으면 preflight에서 막힌다. presign이 `Content-Length`도 서명하지만 이 헤더는 브라우저가 직접 설정하므로 CORS 목록에 넣을 수 없고, 넣을 필요도 없다.
- 착수 게이트(`docs/superpowers/spikes/2026-07-26-real-r2-gate/`)를 돌리는 동안에는 `http://localhost:8789`를 임시로 추가하고, 통과 후 제거한다.

### 6. Vercel 환경변수 등록

Vercel Dashboard > Project > Settings > Environment Variables에서 다음 **6개** 추가:

```
# 공통
R2_ENDPOINT                = https://<account-id>.r2.cloudflarestorage.com

# 상품·UGC 공용 자격증명 (oshikore-prod-rw 토큰 — 두 버킷 스코프)
R2_ACCESS_KEY_ID           = <Step 3 토큰 값>
R2_SECRET_ACCESS_KEY       = <Step 3 토큰 값>            ← Sensitive 체크
R2_BUCKET                  = oshikore-products-prod
R2_PUBLIC_BASE             = https://images.oshikore.kr   (또는 R2.dev URL)

# UGC 비공개 버킷 (자격증명은 위 토큰 공유 — 스코프에 이 버킷 포함 필수)
R2_UGC_BUCKET              = oshikore-ugc-prod
```

> `R2_PUBLIC_BASE`는 끝에 `/`를 붙이지 않음 — 코드에서 `${R2_PUBLIC_BASE}/${r2_key}`로 조합됨. UGC 버킷에는 대응하는 public base가 **없다**(비공개이므로).

> ⚠️ `R2_UGC_BUCKET`은 미설정 시 **로컬 MinIO 기본값**(`oshikore-ugc-dev`)으로 조용히 폴백한다. 부팅은 성공하고 사진 업로드 시점에야 실패하므로, 배포 전 반드시 값을 확인한다.

### 7. 검증

#### 7-1. R2 SDK 연결 확인 (로컬에서)

`.env.local`에 운영 값을 임시로 박고 `npm run dev:all`로 실 R2 연결 테스트:

```bash
# .env.local에 운영 값 임시 입력
R2_ENDPOINT=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=oshikore-products-prod
R2_PUBLIC_BASE=https://images.oshikore.kr
```

```bash
npm run dev:all
```

- 어드민 > 상품 등록 > 사진 업로드 시도
- 성공하면 R2 콘솔 > 버킷 > **Objects** 탭에 파일 생김
- 실패 시 브라우저 콘솔에서 에러 메시지 확인 (CORS·권한·키 오류)

> ⚠️ 검증 후 `.env.local`은 **로컬 MinIO 값으로 복구**. 운영 키를 로컬 파일에 두지 말 것.

#### 7-2. 공개 URL 검증

업로드한 파일을 브라우저에서 직접 열기:

```
https://images.oshikore.kr/<uploaded-key>
```

이미지가 표시되면 OK.

---

## CDN 캐싱 — Cache Rules (적극 캐싱)

상품 이미지 키는 **불변**(UUID 기반, 교체 시 새 키 = 새 URL — [image-path-strategy.md](./image-path-strategy.md))이라 브라우저·CDN이 **1년 캐시**해도 stale 위험이 없다. Cache Rule로 적극 캐싱을 걸면 재방문·페이지 이동 시 네트워크 0, Class B(GET) 카운트도 절감된다.

> ⚠️ **커스텀 도메인 필요.** Cache Rules는 도메인 zone(예: `oshikore.kr`)에 적용되므로 R2 공개는 **옵션 B(커스텀 도메인)** 여야 한다. R2.dev URL은 zone 밖이라 Cache Rule 적용 불가(위 R2.dev 한계 표의 "CDN 캐시 제한적"이 이 때문).

### 설정 절차 (Dashboard)

위치: Cloudflare Dashboard > **해당 도메인 zone**(R2 메뉴 아님) > **Caching** > **Cache Rules** > **Create rule**

| 항목 | 값 |
|---|---|
| Rule name | `R2 product images - immutable` |
| When incoming requests match | `(http.host eq "images.oshikore.kr" and starts_with(http.request.uri.path, "/products/"))` |
| Cache eligibility | **Eligible for cache** |
| Edge TTL | **Override origin → 1 year** (`31536000`초) |
| Browser TTL | **Override origin → 1 year** (`31536000`초) |

- `http.host`는 실제 이미지 커스텀 도메인으로 교체(예: `images.oshikore.kr`).
- 경로를 `/products/`로 한정 — 버킷에 다른 용도 객체가 생겨도 안전.
- Free 플랜도 Cache Rules 사용 가능(룰 개수 제한 내).

### (선택) `immutable` 디렉티브까지

Cache Rule의 Browser TTL은 `max-age`만 내보내고 `immutable`은 안 붙는다. 새로고침 시 재검증(conditional request)까지 생략하려면 — 이점은 작음:

- zone > **Rules** > **Transform Rules** > **Modify Response Header** > Create
- 같은 match 식, Action **Set static** → `Cache-Control` = `public, max-age=31536000, immutable`
- 이때 Cache Rule의 Browser TTL은 **Respect origin**으로 두어 충돌 방지.

### 검증

업로드된 이미지에 두 번 요청:

```bash
curl -sI https://images.oshikore.kr/products/original/<uuid>.jpg
```

- `cache-control: public, max-age=31536000` (immutable 적용 시 `, immutable` 포함)
- `cf-cache-status: HIT` (2번째 요청부터)

---

## 항목별 세부

### Class A vs Class B Operations

R2 작업은 단가 기준 세 단계로 나뉜다 — **상태 변경이냐(A) · 단순 읽기냐(B) · 삭제·정리냐(Free)**.

| Class | 본질 | 단가 |
|---|---|---|
| **Class A** | 쓰기·상태 변경·메타·**LIST** | $4.50 / 1M |
| **Class B** | 단순 읽기 (GET·HEAD·설정 조회) | $0.36 / 1M |
| **Free** | 삭제·정리 (DELETE·Abort) | **$0** |

→ DELETE는 **Class A가 아니라 무료**. R2는 정리(cleanup) 작업에 비용을 매기지 않으므로 마음껏 삭제·lifecycle 정리해도 청구 0.

#### Class A 전체 목록

##### (1) 객체 조작 — 업로드·복사·multipart

| API | 무엇 | 우리 코드에서 |
|---|---|---|
| `PutObject` | 객체 업로드 | 어드민 사진 업로드 (signed URL → 브라우저가 직접 PUT) |
| `CopyObject` | 객체 복사 (같은·교차 버킷) | 사용 X |
| `CreateMultipartUpload` | 큰 파일 분할 업로드 시작 | 큰 사진 업로드 시 자동 사용 가능 |
| `UploadPart` | 분할 업로드 각 조각 | 동일 |
| `UploadPartCopy` | 분할 복사 각 조각 | 사용 X |
| `CompleteMultipartUpload` | 분할 업로드 완료 처리 | 동일 |

##### (2) 목록·메타 조회 — 의외로 Class A

| API | 무엇 | 주의점 |
|---|---|---|
| `ListObjects` / `ListObjectsV2` | 버킷 내 객체 목록 | **가장 잘 빠뜨리는 함정** — 핫패스에서 호출 금지. DB 메타로 처리 |
| `ListBuckets` | 계정의 버킷 목록 | 운영 중 거의 호출 X |
| `ListMultipartUploads` | 진행 중 multipart 목록 | 운영 중 거의 호출 X |
| `ListParts` | 분할 업로드의 part 목록 | 운영 중 거의 호출 X |

##### (3) 버킷 설정 변경 — 초기 셋업 시에만

| API | 무엇 | 우리 코드에서 |
|---|---|---|
| `CreateBucket` | 버킷 생성 | 1회 (셋업) |
| `PutBucketCors` | CORS 정책 등록·수정 | 1회 (셋업) |
| `PutBucketEncryption` | 암호화 설정 | 사용 X |
| `PutBucketLifecycleConfiguration` | lifecycle 룰 등록 | 필요 시 1회 |

#### Class B 전체 목록 (대비용)

| API | 무엇 | 우리 코드에서 |
|---|---|---|
| `GetObject` | 객체 다운로드 | 모든 페이지 이미지 로드 |
| `HeadObject` | 객체 메타만 (ETag·Content-Length) | 무결성 검증 시 |
| `HeadBucket` | 버킷 존재 확인 | 운영 중 안 부름 |
| `GetBucketCors` | CORS 설정 조회 | 운영 중 안 부름 |
| `GetBucketEncryption` | 암호화 설정 조회 | 운영 중 안 부름 |
| `GetBucketLifecycleConfiguration` | lifecycle 설정 조회 | 운영 중 안 부름 |
| `GetBucketLocation` | 버킷 region 조회 | 운영 중 안 부름 |
| `UsageSummary` | 사용량 요약 | 운영 중 안 부름 |

#### Free operations (청구 0)

| API | 무엇 |
|---|---|
| `DeleteObject` | 객체 삭제 |
| `DeleteObjects` (batch) | 다중 객체 삭제 |
| `DeleteBucket` | 버킷 삭제 |
| `AbortMultipartUpload` | 진행 중 multipart 중단 |

#### 우리 스택에서의 호출 패턴

| 위치 | 호출 작업 | Class | 빈도 |
|---|---|---|---|
| 어드민 사진 업로드 (`lib/r2/presign.ts` + 브라우저 PUT) | `PutObject` | A | 월 ~수백 |
| 사용자 페이지 이미지 로드 | `GetObject` | B | 월 ~수십만 |
| 어드민 사진 삭제 | `DeleteObject` | Free | 월 ~수십 |
| 초기 셋업 | `CreateBucket`, `PutBucketCors` | A | 1회만 |

**관찰**:
- 업로드는 어드민이 가끔만 → Class A는 한도 1M의 **<0.1%**
- 조회는 페이지뷰마다 → Class B가 더 빠르게 누적
- 5K 사용자 × 30 PV × 3 이미지 ≈ 450K → Class B 한도 10M의 **4.5%**

→ **운영 첫 해 동안 Class A/B 모두 무료 한도 안**.

#### 가장 흔한 함정 — ListObjects

**LIST가 Class A**라는 게 가장 자주 빠뜨리는 부분. 어드민 페이지에서 "이 상품의 사진 목록을 R2에서 직접 가져오자"는 유혹이 있지만, 그 패턴은 **사진 보유량 × 어드민 페이지뷰만큼 Class A 누적**.

| ❌ 안 좋은 패턴 | ✅ 좋은 패턴 |
|---|---|
| 어드민에서 R2 LIST로 사진 목록 표시 | DB `product_photo` 테이블 조회 |
| 매 요청마다 LIST로 최신 N장 | DB INDEX로 `created_at DESC LIMIT N` |
| 백업 스크립트가 매시간 LIST | DB 메타 기준으로 필요 키만 처리 |

iroiro은 [`product_photo.r2_key`](../supabase/migrations/20260508132935_init_catalog.sql)로 DB가 R2 키를 관리하는 패턴 ([lessons/08-r2-storage-pattern.md](./lessons/08-r2-storage-pattern.md)). LIST 호출 없이도 모든 사진 목록·메타 조회 가능 — 비용·성능 양쪽에서 옳은 설계.

### Storage GB-Hr

R2의 저장 측정은 supabase Storage와 동일한 **GB-Hours** 방식 (1 GB × 1시간 = 1 GB-Hr).

#### 핵심 — "누적 충전"이 아니라 "평균 보유량"

| 잘못된 이해 | 올바른 이해 |
|---|---|
| ❌ "매월 10 GB 새로 받음, 다음 달 또 10 GB" | ✅ "월평균 10 GB 이하로 *보관*" |
| ❌ "다 채우면 다음 달까지 못 씀" | ✅ "지운 만큼 다음 부분 사용 가능" |

→ Class A/B operations(흐름 한도)는 매월 리셋되지만, **Storage는 현재 보유량 기반**.

#### 시나리오별 계산

| 시나리오 | 계산 | GB-Hr |
|---|---|---|
| 1 GB × 30일 보관 | 1 × 720 | 720 (10%) |
| 5 GB × 30일 보관 | 5 × 720 | 3,600 (50%) |
| 10 GB × 30일 보관 | 10 × 720 | 7,200 (한도 100%) |
| 20 GB × 15일 후 삭제 | 20 × 360 | 7,200 (한도 100%) |
| 1 GB 올리고 1시간 후 삭제 | 1 × 1 | 1 |

→ Free 한도 = **7,200 GB-Hr / 월** (= 10 GB × 720시간). 빠른 회전(올렸다 빨리 삭제) 패턴엔 유리.

#### 우리 스택 예상

| 상태 | 보유량 | GB-Hr | 한도 대비 |
|---|---|---|---|
| MVP (사진 1,500장 × 200 KB) | 300 MB | 216 | 3% |
| 성장 (사진 6,000장) | 1.2 GB | 864 | 12% |
| 확장 (사진 15,000장) | 3 GB | 2,160 | 30% |
| 한도 도달 시점 | 10 GB | 7,200 | 100% → 사진 ~50,000장 |

→ 사진 5만장 시점에 도달. 그 전에 *lifecycle rule*(오래된 사진 자동 삭제) 또는 *유료 전환* ($0.015/GB·월).

#### Class A/B와의 성격 차이

| 한도 | 성격 | 매월 리셋? |
|---|---|---|
| Storage 10 GB | 보유량(상태) | ❌ 누적 — 지운 만큼만 빠짐 |
| Class A 1M | 실행 횟수(흐름) | ✅ 매월 0으로 리셋 |
| Class B 10M | 실행 횟수(흐름) | ✅ 매월 0으로 리셋 |

### Egress — 무료의 진짜 의미

#### 개념 — "나가는 트래픽"

**Egress** = 라틴어 *ex (밖) + gress (가다)* = 서버 → 외부 인터넷 outbound 데이터.

| 용어 | 방향 | 청구 대상 (일반 클라우드) |
|---|---|---|
| **Egress** (outbound) | 서버 → 외부 | ✅ 보통 청구 |
| **Ingress** (inbound) | 외부 → 서버 | ❌ 무료 |

데이터센터에서 외부 인터넷으로 데이터를 내보낼 때 **ISP 비용**이 발생해 클라우드가 사용자에게 전가하는 게 일반적.

#### 클라우드별 1 TB / 월 Egress 가격 비교

| 클라우드 | 비용 |
|---|---|
| AWS S3 | ~$90 |
| Google Cloud | ~$120 |
| Azure Blob | ~$87 |
| Supabase Storage (Free) | 5 GB 무료, 이후 종량 |
| **Cloudflare R2** | **$0 (항상)** |

→ S3에 1 TB/월 = 연 $1,080. R2 = 연 $0. 트래픽 폭증 시 차이가 더 벌어짐.

#### R2가 Egress를 무료로 줄 수 있는 이유

- Cloudflare 자체 글로벌 네트워크 (200+ PoP) — ISP 의존 낮음
- Bandwidth Alliance로 주요 ISP와 무료 peering
- Workers·Pages·R2 트래픽이 회사 내부에서 종료
- 마케팅 전략 (AWS S3 이탈 유도의 결정적 카드)

#### 무엇이 무료인가 — 모든 outbound

| 트래픽 경로 | R2 청구? |
|---|---|
| R2 → 사용자 브라우저 (이미지 다운로드) | ❌ |
| R2 → Cloudflare CDN (캐시 워밍) | ❌ |
| R2 → Cloudflare Workers / Pages | ❌ |
| R2 → Vercel·외부 서비스 | ❌ |
| R2 → 다른 R2 버킷 (복사) | ❌ |
| 사용자 → R2 (업로드, *inbound*) | ❌ |

→ 모든 outbound + inbound 무료. **트래픽 크기 무관**.

#### "응답 바이트" vs "요청 횟수"

요청 1회 = **두 라인이 별도로 측정**됨:

```
이미지 1장 (200 KB) 조회
  ├─ ① GetObject 요청 1회 → Class B 카운트 +1 (10M 한도, 단가 $0.36/1M)
  └─ ② 200 KB 응답         → Egress 트래픽 +200 KB (무료, 무한)
```

→ Egress(바이트)는 영원 무료이고, Class B(횟수)만 무료 한도 안에서 측정. **응답 크기는 청구에 영향 없음** (50 MB 동영상이든 200 KB 이미지든 Class B 카운트는 +1 동일).

#### 우리 스택의 3-Layer Egress

```
[사용자 브라우저]
        ▲
        │ HTML·JS·CSS·API 응답 ──── Vercel Egress (Pro 1 TB 포함)
        │ 상품 이미지 ─────────────── R2 Egress (항상 무료) ⭐
        └ DB 응답 ─────────────────── Supabase Egress (Free 5 GB)
```

가장 큰 부피(이미지)가 무료(R2)인 게 비용 구조의 핵심.

### Storage Class — Standard vs Infrequent Access

| 항목 | Standard | Infrequent Access (IA) |
|---|---|---|
| 저장 단가 | $0.015/GB·월 | $0.010/GB·월 |
| Class B (read) 단가 | $0.36/1M | **$0.90/1M + $0.01/GB retrieval** |
| 적합 데이터 | 자주 조회 | 30일+ 미접근 데이터 |

→ 상품 사진은 자주 조회되므로 **Standard 유지**. IA는 어드민 첨부파일·송장 같은 *드물게 조회되는* 데이터에 적합.

---

## iroiro 통합 패턴

### 환경 분리 — 로컬 MinIO vs 운영 R2

| 환경 | 스토리지 | 이유 |
|---|---|---|
| 로컬 개발 | **MinIO** (Docker) | 외부 의존성 없이 오프라인 작업, 폭파해도 무관 |
| Vercel Preview | 운영 R2 (또는 별도 beta 버킷) | 실 환경과 동일 확인 |
| Vercel Production | 운영 R2 | — |

S3 호환 API를 쓰므로 **애플리케이션 코드는 환경에 따라 달라지지 않는다**.

로컬 → 운영 전환은 상품·UGC 버킷과 각 자격증명을 포함한 **R2 환경변수 8개**를 환경별 값으로 설정하면 된다.

### 환경변수 매트릭스

| 변수 | 로컬 | Preview | Production |
|---|---|---|---|
| `R2_ENDPOINT` | `http://localhost:9000` | R2 API endpoint | R2 API endpoint |
| `R2_ACCESS_KEY_ID` | `minioadmin` | 상품 beta 토큰 key | 상품 prod 토큰 key |
| `R2_SECRET_ACCESS_KEY` | `minioadmin` | 상품 beta 토큰 secret | 상품 prod 토큰 secret |
| `R2_BUCKET` | `oshikore-products-dev` | `oshikore-products-beta` | `oshikore-products-prod` |
| `R2_PUBLIC_BASE` | `http://localhost:9000/oshikore-products-dev` | R2 beta public URL | R2 prod public URL |
| `R2_UGC_BUCKET` | `oshikore-ugc-dev` | `oshikore-ugc-beta` | `oshikore-ugc-prod` |

> Preview를 prod 버킷으로 묶으면 **PR 미들 어드민이 prod 데이터를 오염**시킬 위험. 가능하면 beta 버킷 분리.

> `R2_UGC_BUCKET`은 값이 없으면 로컬 기본값으로 폴백한다 — Preview·Production 어느 쪽이든 **비워두면 안 된다**. 자격증명은 `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`를 공유하므로 해당 토큰 스코프에 UGC 버킷이 포함돼 있어야 한다.

### 운영 배포 체크리스트 — R2

배포 전 다음을 확인한다. 하나라도 빠지면 사진 기능이 런타임에 실패한다.

- [ ] 버킷 2개 존재: `oshikore-products-prod`(공개) · `oshikore-ugc-prod`(**비공개 — 공개 도메인 미연결**)
- [ ] 토큰 1개 발급, **두 버킷 모두** 스코프(Object R&W, Apply to specific buckets — 계정 전체 금지)
- [ ] Vercel 환경변수 6개 설정 — 특히 `R2_UGC_BUCKET`(미설정 시 `oshikore-ugc-dev` 폴백)
- [ ] 시크릿 Sensitive 체크(`R2_SECRET_ACCESS_KEY`)
- [ ] 두 버킷 CORS 각각 적용(UGC는 PUT만 + `Content-Type`·`If-None-Match`)
- [ ] CORS `AllowedOrigins`가 **정확한 origin**만 담고 있는지 — wildcard(`https://*.vercel.app`)는 R2에서 매칭되지 않아 등록해도 무효. preview는 확인된 정확한 origin을 등록(반복 운영이면 고정 도메인 권장)
- [ ] UGC 버킷 lifecycle `Staged Upload Expiration Rule`(`posts/tmp/` 1일) 존재
- [ ] UGC 버킷에 공개 액세스(R2.dev·커스텀 도메인)가 **없음**을 확인

### 보안 모범 사례

| 항목 | 권장 |
|---|---|
| 공개·비공개 분리 | 버킷 단위로 분리 (공개 여부가 버킷 속성이라 한 버킷에 섞을 수 없음) |
| API Token 권한 | **Object R&W** (Admin 금지 — 계정 범위라 버킷으로 좁힐 수 없음) |
| API Token 스코프 | 버킷 한정 (Apply to specific bucket). R2는 다중 버킷 지정도 가능하나, 침해 범위를 나누기 위해 **버킷마다 별도 토큰** |
| 키 회전 주기 | 6개월 또는 멤버 이탈 시 즉시 |
| 키 저장 | Vercel Sensitive 환경변수만, `.env.local`에 운영 키 X |
| Secret Access Key | 1Password 등 비밀번호 관리자 |
| Public Access | 운영은 커스텀 도메인 (R2.dev는 dev 전용) |
| 버킷 이름 | 비밀이 아님 (public URL에 노출) — 추측 가능한 이름 OK |
| 객체 키 패턴 | UUID·해시 권장. `<timestamp>-<random>` 같은 예측 어려운 패턴 |

---

## CORS 정책 상세

### AllowedOrigins — 누구의 요청을 허락할지

```json
"AllowedOrigins": [
  "https://oshikore.kr",       // 운영 도메인
  "https://www.oshikore.kr",   // www 변형 (사용 시)
  "https://beta.oshikore.kr",  // preview 배포에 붙인 고정 도메인
  "http://localhost:3000"      // 로컬 개발 (운영 후 제거 가능)
]
```

`*` (모두 허용)도 가능하지만 보안상 권장 X — origin 명시.

> R2는 origin을 **정확히 문자열 비교**한다. `https://*.vercel.app` 같은 wildcard 항목은 매칭되지 않으므로
> 등록해도 아무 origin을 허용하지 않는다. preview는 확인된 정확한 origin을 개별 등록하거나,
> 반복 운영이라면 **고정 도메인을 붙여** 그 origin을 등록한다.

### AllowedMethods — 어떤 HTTP 메서드 허용할지

| 메서드 | 용도 |
|---|---|
| `GET` | 이미지 다운로드 (사용자 페이지) |
| `HEAD` | 이미지 메타 (Content-Length 등) |
| `PUT` | 어드민 업로드 (signed URL 사용) |
| `POST` | multipart upload (큰 파일 분할) |

`DELETE`는 코드 패턴상 Server Action에서만 호출 → 브라우저 직접 호출 안 함 → CORS에 둘 필요 없음.

### ExposeHeaders — 브라우저가 읽을 수 있는 응답 헤더

- `ETag` 노출 필수 — 업로드 응답에서 ETag로 무결성 검증

---

## 모니터링·비용 추적

### 4가지 모니터링 방법

| 방법 | 실시간성 | 자동화 | 권장 |
|---|---|---|---|
| **Cloudflare Dashboard - R2 Metrics** | ~10분 지연 | 수동 | 일상 점검 |
| Cloudflare Billing Dashboard | 일 단위 집계 | 수동 | 월 청구 확인 |
| `UsageSummary` API (S3 호환) | ~5분 지연 | API | 코드 통합 |
| GraphQL Analytics API | 시간 단위 | 프로그래매틱 | 대시보드 자동 |

> "진짜 실시간"은 어느 클라우드도 불가능 — 측정·집계에 5~30분 지연이 표준.

### Cloudflare Dashboard

- R2 메뉴 > 버킷 클릭 > **Metrics** 탭
- 그래프로 확인 가능:
  - 스토리지 사용량 추이 (GB)
  - Class A / Class B operations / 일
  - Egress (참고용, 어차피 무료)

### 사용량 알림 (Cloudflare Billing Notifications)

- 좌측 사이드바 > **Billing** > **Notifications**

#### Storage 알림 임계값 (bytes 입력)

| % | 입력값 (binary, 1024³) | 의미 |
|---|---|---|
| 50% | `5368709120` | 정상 추이 확인 |
| 70% | `7516192768` | 점진 증가 점검 |
| **80%** | **`8589934592`** ⭐ | **권장 — 정리 시작** |
| 90% | `9663676416` | 즉시 처리 |
| 95% | `10200547328` | 다급 |

#### Class A 알림 임계값 (호출 횟수 입력)

Class A는 *이상 감지* 용도가 적합 (한도 도달 알림 X).

| 입력값 | 한도 대비 | 의미 |
|---|---|---|
| `10000` | 1% | 초기 시드 시 트리거 가능 |
| **`50000`** | **5%** ⭐ | **권장 — 평소의 100배** |
| `200000` | 20% | 명확한 사고 |
| `800000` | 80% | 한도 임박 (정상 운영에선 안 닿음) |

→ 우리 평소 사용량(월 수백 회)의 100배 = `50000`이 가장 유용한 이상 감지 임계값.

#### Class B 알림 임계값 (호출 횟수 입력)

Class B는 *한도 임박* 용도 (자연 증가하는 라인).

| 입력값 | 한도 대비 | 의미 |
|---|---|---|
| `5000000` | 50% | 초기 경고 |
| **`8000000`** | **80%** ⭐ | **권장 — 캐싱 강화 시작** |
| `9500000` | 95% | 즉시 대응 |

#### 결제 금액 알림

월 청구액이 $1 초과 시 이메일 — 무료 한도 살짝 넘은 시점에 즉시 인지.

### 한도 80% 도달 시 행동

| 항목 | 한도 80% 대응 |
|---|---|
| Storage 10 GB → 8 GB | 오래된 객체 정리 (lifecycle rule) 또는 유료 전환 ($0.015/GB·월) |
| Class A 1M → 800K | 업로드 패턴·재시도 루프·LIST 호출 점검 |
| Class B 10M → 8M | 캐싱 강화 — `Cache-Control` 헤더·CDN 활용·lazy loading |

### 객체 정리 — Lifecycle Rules

자동으로 일정 기간 후 객체 삭제·이동:

- 버킷 > **Settings** > **Object lifecycle rules** > **Add rule**
- 예: "soft-deleted/" 접두 객체를 30일 후 자동 삭제
- **운영 필수 규칙**: UGC 버킷의 `Staged Upload Expiration Rule`(`posts/tmp/` 1일) — Step 2 참조. 글로 등록되지 않은 임시 업로드를 걷어낸다.

---

## 향후 검토 항목

### Cloudflare Images 연동 (이미지 변환)

R2에 원본을 두고 Cloudflare Images로 실시간 리사이즈·포맷 변환:

- 5,000장 변환 / 월 무료
- 자동 WebP·AVIF 변환
- 임의 크기 요청 (`?w=400&h=400`)

도입 시점: 모바일·고해상도 디스플레이 대응이 필요해질 때.

출처: [Cloudflare Images Pricing](https://developers.cloudflare.com/images/pricing/)

### Cloudflare Workers + R2 직접 통합

Cloudflare Pages로 호스팅 이전 시 R2 Bindings로 SDK 없이 직접 접근 가능 — egress·latency 양쪽 이점. (자세히는 [vercel-adoption.md](./vercel-adoption.md)의 Cloudflare Pages 섹션 참조)

### Multi-region 배포

R2는 기본적으로 단일 region이지만, **자동 jurisdictional routing**으로 사용자에게 가까운 endpoint로 자동 라우팅. 별도 설정 불필요.

---

## 참고 자료

- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — 한도·단가 일람
- [R2 Get Started](https://developers.cloudflare.com/r2/get-started/) — 공식 quickstart
- [R2 API Tokens](https://developers.cloudflare.com/r2/api/s3/tokens/) — 토큰 생성·관리
- [R2 Custom Domains](https://developers.cloudflare.com/r2/buckets/public-buckets/#connect-a-bucket-to-a-custom-domain) — 커스텀 도메인 연결
- [R2 CORS Configuration](https://developers.cloudflare.com/r2/buckets/cors/) — CORS 설정 가이드
- [R2 Object Lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) — 자동 정리 규칙
- [R2 vs S3 Migration Guide](https://developers.cloudflare.com/r2/data-migration/) — S3에서 옮길 때
- [Cloudflare Images Pricing](https://developers.cloudflare.com/images/pricing/) — 이미지 변환

---

## 변경 이력

- 2026-05-19 — 최초 작성: 무료 한도 (Storage 10 GB·Class A 1M·Class B 10M·Egress 무료) + Free 초과 시 단가 + Dashboard 운영 셋업 실전 절차(계정·버킷·API Token·공개 액세스 옵션 A/B·CORS·Vercel 환경변수·검증) + 항목별 세부(Class A/B·Storage Class·Egress 무료의 진짜 의미) + iroiro 통합(MinIO/R2 환경 분리·환경변수 매트릭스·보안 모범 사례) + CORS 정책 상세(AllowedOrigins·Methods·ExposeHeaders) + 모니터링·비용 추적 + 향후 검토(Cloudflare Images·Workers Bindings·Multi-region).
- 2026-05-20 — Class A vs Class B vs Free operations 섹션 정정·확장: **DELETE는 Class A가 아니라 Free**로 수정. Class A 전체 API 목록을 3그룹(객체 조작·목록 메타 조회·버킷 설정)으로 표로 정리. Class B·Free 전체 목록 별도 표. ListObjects가 Class A라는 함정과 DB 메타 기반 회피 패턴(`product_photo.r2_key`) 명시.
- 2026-05-20 — Step 3 (API Token) 대폭 확장: **계정 vs 사용자 API 토큰** 차이와 계정 선택 이유, **Bearer Token vs S3 자격 증명** 구분 (4개 값 중 3개만 사용), TTL "계속" 권장 근거(자동 만료는 사고 트리거)와 6개월 수동 회전 정책, Client IP Filter 비우는 이유(Vercel 동적 IP), 엔드포인트 관할지(Default·EU·FedRAMP) 선택 가이드, 베타용 별도 토큰 발급 절차.
- 2026-05-20 — Step 4 (공개 액세스) 확장: R2.dev URL의 운영 부적합 사유 7가지 표로 정리 (Rate Limit·ToS 위반·CDN 캐시 제한·응답 헤더 통제 불가·URL 변경 위험·신뢰도·Workers 통합 X·SEO 약함). 커스텀 도메인 비용 분석(Cloudflare $0 + 도메인 등록비만), Cloudflare Registrar 등 도메인 등록처 비교.
- 2026-05-20 — Storage GB-Hr 섹션 보강: **"누적 충전이 아니라 평균 보유량"** 멘탈 모델 명시, 시나리오별 GB-Hr 계산표(10 GB × 30일 = 7,200 GB-Hr), Class A/B(흐름 한도, 매월 리셋) vs Storage(상태, 누적) 성격 차이.
- 2026-05-20 — Egress 섹션 보강: Egress 개념(ex-gress, outbound) + Ingress 대비, 클라우드별 1 TB Egress 가격 비교(AWS $90 vs R2 $0), R2가 무료인 이유(Cloudflare 글로벌 네트워크·Bandwidth Alliance), "응답 바이트(무료) vs 요청 횟수(Class B 카운트)" 분리 측정 설명, 3-Layer Egress(Vercel·R2·Supabase) 흐름.
- 2026-05-20 — 모니터링 섹션 확장: 4가지 모니터링 방법(Dashboard·Billing·UsageSummary API·GraphQL API)과 실시간성 한계(5~30분 지연 표준), **알림 임계값 권장값** 명시 — Storage 8 GiB(`8589934592`), Class A 50K(이상 감지), Class B 8M(80% 임계), 결제 알림 $1.
- 2026-06-01 — CDN 캐싱(Cache Rules) 섹션 추가: 불변 키 전제로 product 이미지에 Edge/Browser 1년 TTL을 거는 절차(도메인 zone > Caching > Cache Rules, 커스텀 도메인 필수), `immutable`용 Transform Rule 선택지, `cf-cache-status`·`cache-control` curl 검증. 설계 근거는 [image-path-strategy.md](./image-path-strategy.md).
- 2026-08-01 — **버킷·토큰 2벌 구조 반영**: 커뮤니티 사진(UGC) 도입으로 공개 상품 버킷과 비공개 UGC 버킷을 분리(R2는 공개 여부가 버킷 단위 속성이라 한 버킷에 섞을 수 없음). Step 2에 UGC 버킷 생성·`Staged Upload Expiration Rule`(`posts/tmp/` 1일), Step 3에 UGC 전용 Object R&W 토큰 발급(버킷별 스코프 — Admin 토큰은 버킷 제한 불가), Step 4에 UGC 버킷 공개 액세스 금지, Step 5에 UGC 버킷 전용 CORS(PUT만 + `Content-Type`·`If-None-Match`), Step 6 환경변수 5개 → **8개**(`R2_UGC_BUCKET`·`R2_UGC_ACCESS_KEY_ID`·`R2_UGC_SECRET_ACCESS_KEY` — 미설정 시 `minioadmin` 폴백으로 조용히 실패), 환경변수 매트릭스에 3행 추가 + **운영 배포 체크리스트** 신설.
- 2026-08-01 — **CORS wildcard·토큰 스코프 사실관계 정정**: (1) `AllowedOrigins`에 있던 `https://*.vercel.app`을 제거했다. R2는 origin을 정확히 문자열 비교하므로(공식 문서 "Origin values must match exactly") wildcard는 등록해도 무효이고, 그 상태로 배포하면 preview 업로드가 CORS에서 막힌다. preview는 고정 도메인 origin으로 등록하도록 바꾸고 배포 체크리스트에 정확한 origin 확인 항목을 추가했다. (2) "한 토큰을 두 버킷에 스코프할 수 없다"는 서술은 사실이 아니다 — R2 Object 토큰은 버킷 집합에 스코프할 수 있다. 토큰 2개 분리 결정은 유지하되 근거를 '침해 범위 분리'로 정정했고, 계정 범위라 버킷으로 좁힐 수 없는 것은 Admin 토큰임을 명확히 했다. (3) 환경 분리 절의 "환경변수 5개" 잔재를 8개 기준으로 갱신했다.
- 2026-08-02 — **토큰 공유로 전환(환경당 1개)**: UGC 전용 자격증명(`R2_UGC_ACCESS_KEY_ID`/`R2_UGC_SECRET_ACCESS_KEY`)과 전용 클라이언트(`ugcR2`)를 제거하고, 상품·UGC가 `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` 한 벌을 공유한다. 토큰은 두 버킷을 모두 스코프에 포함해 발급(기존 토큰은 편집으로 UGC 버킷 추가 — roll 없으면 키 값 유지). 침해 범위 분리 이점보다 pre-launch 운영 단순화를 우선한 결정으로, 버킷 분리(공개 상품 / 비공개 UGC)는 유지한다. 환경변수 8개 → 6개.
