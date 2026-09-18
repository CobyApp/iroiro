-- 리뷰 적립용 — 어떤 리뷰(주문×상품)에 대한 적립인지 식별 + 중복 적립 백스톱.
ALTER TABLE point_transaction ADD COLUMN product_id BIGINT;

-- 같은 주문×상품 리뷰로는 1회만 적립(동시 요청·삭제 후 재작성 모두 차단).
CREATE UNIQUE INDEX point_tx_review_once
  ON point_transaction (order_id, product_id)
  WHERE reason = 'review';
