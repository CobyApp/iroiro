-- add_used_bundle: 같은 판매자의 여러 매물을 한 번에 구매(배송비 1회) — 메루카리 묶음(おまとめ).
-- 묶음은 배송비·수령지·QR·진행상태를 한 곳에서 관리하고, 개별 매물 거래(used_trade)는
-- bundle_id로 묶인다. 묶음 거래의 used_trade.shipping_fee는 0(배송비는 묶음이 보유).

CREATE TABLE used_bundle
(
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    buyer_account_id  UUID        NOT NULL,
    seller_account_id UUID        NOT NULL,
    item_total        INTEGER     NOT NULL,
    shipping_fee      INTEGER     NOT NULL DEFAULT 0,
    points_used       INTEGER     NOT NULL DEFAULT 0,
    fee_amount        INTEGER     NOT NULL DEFAULT 0,
    seller_payout     INTEGER     NOT NULL DEFAULT 0,
    status            TEXT        NOT NULL DEFAULT 'paid',
    recipient_name    TEXT,
    recipient_phone   TEXT,
    recipient_address TEXT,
    post_tracking_code TEXT,
    post_qr_issued_at TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT used_bundle_status_chk CHECK (status IN ('paid', 'shipped', 'completed', 'canceled'))
);

CREATE INDEX used_bundle_buyer_idx ON used_bundle (buyer_account_id, created_at DESC);
CREATE INDEX used_bundle_seller_idx ON used_bundle (seller_account_id, created_at DESC);

COMMENT ON TABLE used_bundle IS '중고 묶음 구매(같은 판매자, 배송비 1회)';
COMMENT ON COLUMN used_bundle.item_total IS '상품가 합계(배송비 제외)';
COMMENT ON COLUMN used_bundle.shipping_fee IS '묶음 배송비(1회)';
COMMENT ON COLUMN used_bundle.points_used IS '사용 포인트';
COMMENT ON COLUMN used_bundle.fee_amount IS '플랫폼 수수료 합계';
COMMENT ON COLUMN used_bundle.seller_payout IS '판매자 정산 합계';
COMMENT ON COLUMN used_bundle.status IS 'paid | shipped | completed | canceled';

ALTER TABLE used_trade
    ADD COLUMN bundle_id BIGINT;
CREATE INDEX used_trade_bundle_idx ON used_trade (bundle_id) WHERE bundle_id IS NOT NULL;
COMMENT ON COLUMN used_trade.bundle_id IS '묶음 구매 ID (단건이면 NULL)';

GRANT SELECT, INSERT, UPDATE ON used_bundle TO app;
