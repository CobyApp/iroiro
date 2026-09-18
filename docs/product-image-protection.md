# 고객용 상품 이미지 보호

## 적용 경계

고객 화면의 모든 트레카 이미지는 S3 원본 주소가 아니라 다음 same-origin 경로를 사용한다.

- 개별 앞·뒷면: `/media/product-photos/{photoId}/{variant}/{signature}`
- 대표 이미지: `/media/product-thumbnails/{productId}/{variant}/{signature}`

`{variant}`는 `modules/products/lib/customer-media.ts`의 `MEDIA_VARIANTS` 키(`g`/`d`/`cg`/`cd` — 폭 600/1100, 워터마크 유무, WebP 품질)만 허용한다.

서명은 서버의 스토리지 secret(`R2_SECRET_ACCESS_KEY`)에서 도메인 분리한 HMAC으로 생성한다. ID·variant·서명이 변조되면 DB·스토리지를 조회하기 전에 404로 응답한다. 정상 요청도 원본을 그대로 전달하지 않고 다음 순서로 처리한다.

1. S3 API 서명 GET으로 원본 읽기(`lib/r2/get.ts` — 버킷 `R2_BUCKET`)
2. 입력 20MB·4천만 픽셀 상한 검사
3. 최대 1100×1500으로 축소
4. 이로이로 워드마크 반복 합성(워터마크 variant)
5. WebP로 재인코딩(variant별 품질)
6. same-origin CORP·nosniff·inline 응답 + `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000`

## 운영에서 반드시 닫아야 하는 우회 경로

애플리케이션만 배포하고 공개 원본 URL을 그대로 두면 과거에 알려진 키나 추측한 키로 원본에 접근할 수 있다. S3 버킷 설정도 함께 적용해야 보호 경계가 완성된다.

1. 앱 서버는 공개 URL이 아니라 `R2_ENDPOINT/R2_BUCKET` S3 API와 access key로 원본을 읽는다(현행).
2. 상품·공지·배너가 같은 공개 버킷(`iroiro-kr-products-<env>`)을 공유하는 동안, 버킷 정책의 public read를 `products/original/*` prefix에는 허용하지 않도록 조정한다(공지 `notices/`·배너 `banners/`·아바타 `avatars/`만 공개). 현재 `infra/aws/setup.sh core`는 버킷 전체 public read를 걸어 두므로 **미완 항목**이다.
3. 장기적으로 상품 원본 버킷을 공지·배너 공개 버킷과 분리하고 상품 버킷에는 public read를 걸지 않는다.
4. 공개 URL이 CDN 뒤에 놓이게 되면 `products/original/` 응답이 캐시에 남지 않도록 함께 purge한다(현재는 S3 URL 직접 서빙이라 해당 없음).

> 이력: R2 시절의 `r2.dev` 공개 개발 URL 비활성화·Cloudflare WAF 경로 차단 항목은 S3 이전으로 사라졌고, 위 2·3이 그 역할을 대신한다.

## 한계

브라우저에 표시된 픽셀은 스크린샷이나 촬영으로 100% 회수 방지할 수 없다. 이 구현의 목표는 원본 파일·원본 해상도·무워터마크 이미지를 고객 경로로 제공하지 않고, 캡처된 결과에도 반복 워터마크가 남도록 만드는 것이다. CSS 오버레이나 우클릭 차단만을 보안 경계로 간주하지 않는다.
