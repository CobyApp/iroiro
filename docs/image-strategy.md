# 이미지 저장 및 최적화 전략

상품 사진이 많은 커머스에서 이미지 스토리지·CDN을 어떻게 선택했는지에 대한 기록.

## 결정

**Cloudflare R2 + Cloudflare Image Resizing**

## 핵심 판단 기준

커머스의 이미지 비용은 **저장이 아닌 egress(outbound 전송)에서 발생**한다.
사용자가 페이지를 열 때마다 상품 이미지가 다운로드되므로 트래픽이 곧 egress다.
따라서 egress 단가가 0인 스토리지가 트래픽 증가에 비용이 거의 영향받지 않는다.

### Egress 비용 비교

1MB 이미지를 10만 명이 조회하는 경우 (≈ 100GB egress):

| 스토리지 | 저장 단가 | Egress 단가 | 100GB egress 비용 |
|---|---|---|---|
| AWS S3 | $0.023/GB | $0.09/GB | **약 $9/월** |
| Supabase Storage | 무료 1GB | $0.09/GB (2GB 초과) | 약 $8.8/월 |
| **Cloudflare R2** | $0.015/GB | **$0** | **$0/월** |

## 후보 비교

| 옵션 | 무료 티어 | 장점 | 단점 |
|---|---|---|---|
| **Cloudflare R2 + Images** | R2 10GB 저장 + egress 무료, Images 5,000장 변환 | egress 무료, S3 호환 API | 이미지 변환 기능은 유료 분리 |
| Supabase Storage | 1GB 저장 + 2GB 전송 | DB·Auth와 같은 콘솔 | egress 과금, 변환 기능 제한적 |
| Cloudinary | 25 credits/월 (변환·대역폭 합산) | 최강 이미지 변환 (스마트 크롭, 포커스 등) | credits가 빠르게 소진 |
| AWS S3 + CloudFront | 5GB 저장, 12개월 한정 | 표준, 생태계 풍부 | egress 비싸고 1년 후 전부 유료 |
| Vercel Blob | 1GB | Next.js 통합 매끄러움 | 용량·전송 단가 모두 비쌈 |

## 선택 근거

### Cloudflare R2를 선택한 이유

1. **egress 무료** — 커머스에서 가장 큰 비용 항목을 제거
2. **무료 티어 10GB** — 상품 수백~수천 장 수용 가능
3. **S3 호환 API** — 후속 마이그레이션 비용이 낮음
4. **Image Resizing 통합** — 동일 도메인에서 on-the-fly 변환

### Cloudinary를 선택하지 않은 이유

이미지 변환 품질은 가장 우수하지만, MVP 단계에서 25 credits는 다음과 같이 빠르게 소진된다.
- 1 credit ≈ 1,000 변환 또는 1GB 대역폭
- 상품 100개 × 5 사이즈 변환 = 500 변환
- 페이지 조회 1만 건 × 평균 10장 노출 = 약 10GB 대역폭 → 10 credits

트래픽이 늘어날수록 비용이 빠르게 증가해 MVP 비용 통제 목표와 충돌한다.

### Supabase Storage를 선택하지 않은 이유

DB·Auth와 같은 콘솔에서 관리할 수 있다는 통합 이점이 있지만, 다음 두 한계가 컸다.
- 무료 1GB는 상품 사진이 많은 커머스에 부족
- 2GB 초과 시 egress 과금 ($0.09/GB)이 시작되어 비용 예측이 어려움

DB는 Supabase, **이미지는 R2로 분리**하고 메타데이터(URL)만 Supabase에 저장하는 구조가 비용·확장성 모두 유리하다.

## 구현 전략

### 저장 구조

- 원본만 R2에 저장 (변환본을 미리 만들지 않음)
- 요청 시 Cloudflare Image Resizing이 URL 파라미터 기반으로 WebP/AVIF 변환·리사이즈
- DB(Supabase)에는 원본 R2 URL과 메타데이터(width, height, alt 등)만 저장

### Next.js 통합

- `next.config.ts`의 `images.remotePatterns`에 R2 도메인 등록
- `<Image>` 컴포넌트로 자동 srcset·lazy loading
- LCP 이미지에 `priority` 속성 부여
- 그 외 이미지는 lazy loading 기본값 활용

### 업로드 흐름

1. 관리자가 어드민 페이지에서 이미지 선택
2. 서버에서 R2 presigned URL 발급
3. 브라우저가 R2에 직접 업로드 (서버 부하 없음)
4. 업로드 완료 후 메타데이터를 Supabase에 저장

## 확장 시 검토 항목

- 변환 5,000장/월 초과 시 Cloudflare Images 유료 플랜 ($5/월부터)
- 글로벌 트래픽이 많아지면 R2 + Workers 조합으로 엣지 캐싱 강화
- 이미지 검색·태깅이 필요해지면 Cloudinary 부분 도입 검토
