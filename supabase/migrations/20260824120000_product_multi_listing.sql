-- ============================================================================
-- product_multi_listing: 같은 카드의 복수 매물 허용 — product를 매물 단위로
-- ============================================================================
-- 중고거래 확장 대비 구조 개선: 카탈로그 카드(외부 source_id / 시리즈)와
-- 매물(product 행)을 분리한다. 같은 카드라도 컨디션이 다르거나, 정가·경매를
-- 병행하거나, 경매를 여러 건 열면 각각 별도 product 행(별개 매물)이 된다.
-- 임포트 멱등성은 "source_id 행 존재 여부"를 앱이 확인하므로 유니크가 필요 없다.

DROP INDEX IF EXISTS product_source_id_unique;
CREATE INDEX product_source_id_idx ON product (source_id) WHERE (source_id IS NOT NULL);

DROP INDEX IF EXISTS product_item_code_unique;
CREATE INDEX product_item_code_idx ON product (item_code, item_type, condition)
    WHERE (item_code IS NOT NULL);

COMMENT ON COLUMN product.source_id IS '외부 카드 고유 id — 카탈로그 카드 키. 같은 카드의 매물이 여럿일 수 있어 유니크 아님(첫 임포트 멱등은 앱이 존재 확인)';
