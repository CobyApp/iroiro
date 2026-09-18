# 09. URL Slug 전략

## 왜 알아야 하는가

공개 URL 구조는 SEO, 사용자 경험, 보안(enumeration), 운영 비용에 모두 영향을 줍니다. 처음 정한 패턴은 바꾸기 어렵고(외부 링크가 끊김), 한국어 사이트는 영미권보다 결정 포인트가 더 많습니다.

## slug란

URL에 넣을 수 있게 만든, **사람이 읽을 수 있는 짧은 식별자**.

```
일반 제목: "TXT 'Bring the Soul' 트레카 (Pre-order Bonus)"
↓ slug
slug: "txt-bring-the-soul-pob"
↓ URL
URL: https://iroiro.club/products/txt-bring-the-soul-pob
```

룰: 소문자, 영숫자·하이픈만, 공백·특수문자 X, 보통 3~5단어 / 60~100자 이하.

## 세 가지 패턴

| 패턴 | URL 예 | 사용처 |
|---|---|---|
| **숫자 id만** | `/products/12345` | 한국 대형 이커머스 (쿠팡·네이버·무신사) |
| **slug-only** | `/products/txt-bring-the-soul` | Shopify, WooCommerce, WordPress |
| **하이브리드** | `/products/12345/txt-bring-the-soul` | Amazon, Etsy, Walmart |

## 영미권 vs 한국 — 실제 사이트 패턴

### 영미권

| 사이트 | 패턴 | 비고 |
|---|---|---|
| Shopify (스토어) | `/products/{handle}` | handle = 자동 slug, 32자 제한 |
| Amazon | `/{slug}/dp/{ASIN}` | ASIN이 진짜 ID, slug는 표시용 |
| Etsy | `/listing/{numericId}/{slug}` | 숫자 id가 canonical |
| Walmart | `/ip/{slug}/{numericId}` | 하이브리드 |
| eBay | `/itm/{slug}/{numericId}` | 하이브리드 |

### 한국 (실제 URL)

| 사이트 | 패턴 | slug? |
|---|---|---|
| 쿠팡 | `coupang.com/vp/products/{numericId}?...` | ❌ |
| 네이버 스마트스토어 | `smartstore.naver.com/{shop}/products/{numericId}` | ❌ |
| 무신사 | `musinsa.com/products/{numericId}` | ❌ |
| 마켓컬리 | `kurly.com/goods/{numericId}` | ❌ |
| 29CM | `29cm.co.kr/products/{numericId}` | ❌ |

**한국 대형 이커머스 대부분이 slug 없이 숫자 id.** 한국어 상품명을 ASCII slug로 변환하는 일관 룰이 까다롭고, 검색 트래픽이 네이버/구글 검색결과 → 페이지 진입이라 URL을 사람이 읽을 일이 적기 때문.

## SEO best practices (영미권 기준)

- **소문자만**, 대소문자 혼용 X
- **하이픈 `-`**, 언더스코어 `_` 금지 (구글이 단어 구분으로 인식)
- **3~5단어, 100자 미만**
- **키워드를 앞쪽에**, stop words(`a`, `the`, `and`) 제거
- **숫자 id만 노출 금지** (Google 가이드 직접 권고)
- **canonical URL을 영구 유지** — timestamp·session id 금지

slug 변경 시:
- **301 redirect**가 표준. SEO 가치 거의 그대로 이전
- redirect chain (`A→B→C`) 피하기 — 항상 최종 URL로
- **변경 자체를 최소화** 하는 게 더 나음

## 한국어 처리 — 세 갈래

영문 사이트엔 없는 고유 고민. 한국어 굿즈명을 어떻게 URL에 넣을지:

| 방식 | 예 | 장점 | 단점 |
|---|---|---|---|
| **로마자 변환** | `/products/teureka-bring-the-soul` | ASCII 안전, 메신저 깨짐 X | 변환 룰 표준 X (트레카 → tracha vs treka), 라이브러리 필요 |
| **한글 그대로** | `/products/트레카-브링더소울` (실제: `%ED%8A%B8...`) | 한국어 SEO 매칭, 변환 고민 X | URL 인코딩 시 메신저·로그에서 깨짐 |
| **하이브리드** | `/products/{numericId}/트레카` | 안정성 + SEO + 가독성 | 복잡도 ↑ |

네이버는 한글 URL을 영문보다 *불리하게* 다루지 않습니다. 다만 외부 유입(블로그·SNS 공유) 시 깨질 위험이 영문보다 큼.

## 하이브리드 패턴 (Amazon·Etsy형)

```
canonical: /products/12345/txt-bring-the-soul

사용자가 slug 부분만 바꿔서 링크 보냈을 때:
old: /products/12345/old-title
new: /products/12345/new-title  ← 라우터가 id로 해석 → 정상 동작

응답 처리:
const product = await getProductById(id);
if (product.slug !== requestedSlug) {
    redirect(`/products/${id}/${product.slug}`); // 정규형으로 301
}
```

핵심 이점: 라우팅이 *id*만 보고 작동. slug가 바뀌어도/잘못 입력돼도 페이지가 뜸. canonical URL로 redirect.

**slug-only는 의외로 까다로움**: 중복 처리, 한글 변환 룰, 변경 시 redirect 매핑을 직접 운영해야 함. Shopify처럼 *플랫폼이 책임지는 구조*에서나 깔끔하게 유지됨.

## 이 프로젝트의 결정

**숫자 id만 (한국 패턴)**, slug 없음.

이유:
- 한국 대형 이커머스 컨벤션과 일치 (쿠팡·무신사형)
- MVP 단계, slug 운영 비용(중복·변환·redirect 매핑) 회피
- BIGINT IDENTITY PK와 자연스럽게 어울림 ([03. Primary Key 전략](./03-primary-key-strategy.md))

URL 형태:
```
/products/12345
/products/12345/photos      (사진 갤러리)
```

## 향후 전환 시나리오

SEO·검색 유입이 중요해지면 **하이브리드로 전환** 권장 (slug-only는 권장 X):

1. `product` 테이블에 `slug TEXT` 컬럼 추가
2. 자동 생성 정책 결정 (제목 기반 + 충돌 시 `-2`, `-3` 접미사)
3. CHECK 제약: `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`
4. 라우팅: `/products/{id}/{slug}` 형태, 라우터는 id만 사용
5. slug 변경 시 옛 slug 매핑 테이블(`product_slug_redirects`)로 301 처리

전환 시 마이그레이션:
```sql
ALTER TABLE product
    ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX product_slug_unique ON product (slug) WHERE slug IS NOT NULL;

ALTER TABLE product
    ADD CONSTRAINT product_slug_format_check
        CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
```

## 트레이드오프 정리

이 결정으로 *얻은 것*:
- 운영 단순 (slug 생성·중복·redirect 정책 불필요)
- 한국 사용자에게 익숙한 URL 패턴
- 빠른 MVP 출시

이 결정으로 *잃은 것*:
- `/products/1`, `/products/2` 형태 → 셀러 총 상품 수 추정 가능 (enumeration)
- URL에 키워드 없음 → SEO 약간 불리
- 사용자가 URL만 보고 페이지 내용 짐작 어려움

소규모 셀러 사이트면 잃는 것보다 얻는 게 큼.

## 참고

- [Google: Designing a URL structure for ecommerce sites](https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites)
- [Shopify: SEO URL Structure — 7 Best Practices](https://www.shopify.com/blog/seo-url)
- [Yoast: What is a slug](https://yoast.com/slug/)
- [SEMrush: 301 Redirects — How They Affect SEO](https://www.semrush.com/blog/301-redirects/)
