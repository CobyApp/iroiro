-- 포인트 원장(append-only) + 무료배송 쿠폰.
-- 잔액 = SUM(amount). 정정도 새 행으로만(행 수정·삭제 없음).
CREATE TABLE point_transaction (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id UUID NOT NULL,
  amount INT NOT NULL CHECK (amount <> 0),
  -- welcome | order_use | order_refund | review | admin
  reason TEXT NOT NULL,
  order_id BIGINT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX point_tx_account_idx ON point_transaction (account_id, created_at DESC);
-- 이벤트별 멱등 백스톱 — 웰컴 1회/계정, 주문당 사용·환급 각 1회.
CREATE UNIQUE INDEX point_tx_welcome_once ON point_transaction (account_id) WHERE reason = 'welcome';
CREATE UNIQUE INDEX point_tx_order_use_once ON point_transaction (order_id) WHERE reason = 'order_use';
CREATE UNIQUE INDEX point_tx_order_refund_once ON point_transaction (order_id) WHERE reason = 'order_refund';

-- 계정 보유 쿠폰 — v1은 무료배송(free_shipping)만.
CREATE TABLE account_coupon (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id UUID NOT NULL,
  kind TEXT NOT NULL,
  -- welcome | admin
  issued_reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_order_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX account_coupon_account_idx ON account_coupon (account_id, used_at, kind);

-- 앱은 제한된 app 롤로 접속 — GRANT 없으면 프로덕션에서 42501 (PR #31 사례).
-- 포인트 원장은 append-only라 UPDATE/DELETE 권한을 주지 않는다.
GRANT SELECT, INSERT ON point_transaction TO app;
GRANT SELECT, INSERT, UPDATE ON account_coupon TO app;
