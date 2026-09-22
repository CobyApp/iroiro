# 고객용 이미지 보호 — 두 벌(clean·wm) 원칙

## 원칙

이미지는 업로드 시점에 **두 벌**로 저장한다. 서빙 시 합성하지 않는다(예전 요청별 워터마크 합성은 느려서 제거).

| 벌 | 내용 | 접근 |
|---|---|---|
| **wm** | 브랜드 워터마크가 구워진 사본 | 공개 — 고객 화면 |
| **clean** | 워터마크 없는 원본(해상도 정리만) | 비공개 — 소유자·관리자 경로만 |

| 대상 | wm 키(DB 저장) | clean 키(규약 파생) | 규약 |
|---|---|---|---|
| 카드 앞면(카탈로그 버킷, 환경별) | `cards/wm/<uuid>.jpg` | `cards/clean/<uuid>.jpg` | `modules/cards/lib/image-keys.ts` |
| 상품 사진(상품 버킷) | `products/original/<uuid>.jpg` | `products/clean/<uuid>.jpg` | `modules/products/lib/photo-keys.ts` |

## 누가 어느 벌을 보나

| 화면 | 경로 | 벌 | 가드 |
|---|---|---|---|
| 고객 상품 상세·목록 | `/media/product-photos/{photoId}/{g\|d}/{sig}`, `/media/product-thumbnails/{productId}/{g}/{sig}` | wm | HMAC 서명(ID·변형) |
| 고객 **소유자 컬렉션** | 같은 라우트의 `cg`·`cd` 변형 | **clean** | 서명 + 세션 + `ownsProduct`(활성 보유). 응답 `Cache-Control: private` |
| 고객 카드 이미지(제보·매물·게시글) | `CATALOG_PUBLIC_BASE/cards/wm/…` 직접 | wm | 버킷 정책 public read(`cards/wm/*`만) |
| 카탈로그 관리(/catalog) | `/media/catalog-clean/{key}` | **clean** | site admin(`isAdmin`) — 라우트가 직접 검증, `private` 캐시 |
| 관리자 상품 사진 다운로드 | `/admin/products/{id}/photos/…/download` | clean(없으면 wm) | `requireAdmin` |
| AI 임베딩 입력 | 서버 내부 | clean(없으면 wm) | — |

`{variant}`는 `modules/products/lib/customer-media.ts`의 `MEDIA_VARIANTS`(`g`/`d`/`cg`/`cd` — 폭 600/1100, WebP 품질)만 허용하고, 서명은 스토리지 secret(`R2_SECRET_ACCESS_KEY`)에서 도메인 분리한 HMAC이다. ID·variant·서명이 변조되면 DB·스토리지 조회 전에 404. 정상 요청도 원본을 그대로 주지 않고 20MB·4천만 픽셀 상한 → 최대 1100×1500 축소 → WebP 재인코딩 → same-origin CORP·nosniff·inline 응답으로 처리한다.

## 스토리지 쪽 경계 (`infra/aws/setup.sh catalog`)

앱 서버는 공개 URL이 아니라 S3 API 서명 GET으로 원본을 읽는다. 공개 읽기는 버킷 정책이 **프리픽스 단위**로 연다.

- 카탈로그 버킷 `iroiro-kr-catalog-<env>`(환경별): `cards/wm/*`만 public. `cards/clean/*`는 정책에 없음 → 키를 알아도 익명 접근 불가.
- 상품 버킷 `iroiro-kr-products-<env>`: `products/original/*`·`notices/*`·`banners/*`·`avatars/*`·`used/*`(+ 컷오버 전 임시 `cards/original/*`)만 public. `products/clean/*`는 비공개.
- Public Access Block: ACL 차단, 정책만 허용. CDN은 아직 없음(도입 시 clean 프리픽스가 캐시되지 않게 함께 설정).

## 예전 데이터

두 벌 저장 이전에 올라간 상품 사진은 워터마크가 구워진 사본만 있다(clean 없음). 소유자·관리자 경로는 clean이 없으면 wm으로 폴백한다(`fetchProductPhotoOriginal`). 카드는 분석기 원본에서 재수집해 전량 두 벌로 맞췄다(2026-09).

## 한계

브라우저에 표시된 픽셀은 스크린샷이나 촬영으로 100% 회수 방지할 수 없다. 목표는 원본 파일·무워터마크 이미지를 **고객 공개 경로**로 제공하지 않고, 캡처된 결과에도 반복 워터마크가 남도록 만드는 것이다. CSS 오버레이나 우클릭 차단은 보안 경계로 간주하지 않는다.
