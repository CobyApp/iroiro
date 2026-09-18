-- 도착 인증 리뷰 — 배송된 주문의 구매자만 상품별로 남기는 별점+텍스트 리뷰.
-- (주문·상품·계정 조합당 1건. 사진 리뷰는 후속 버전에서 확장.)
CREATE TABLE product_review (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  account_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_review_once_per_order UNIQUE (order_id, product_id, account_id)
);

CREATE INDEX product_review_product_idx ON product_review (product_id, created_at DESC);
CREATE INDEX product_review_account_idx ON product_review (account_id);

-- 앱은 제한된 app 롤로 접속 — GRANT 없으면 프로덕션에서 42501 (PR #31 사례).
GRANT SELECT, INSERT, UPDATE, DELETE ON product_review TO app;
