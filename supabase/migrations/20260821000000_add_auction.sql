-- 입찰 경매 판매 방식 (메루카리식) — product 확장 + auction_bid 원장.
-- sale_mode: 'fixed'(고정가) | 'auction'(입찰 경매).
-- 경매 진행 상태(auction_status): 'live'(진행) | 'awarded'(낙찰, 결제 대기)
--   | 'passed'(유찰 — 입찰 없음 또는 낙찰자 미결제).
-- 낙찰 시 salePrice/regularPrice를 낙찰가로 갱신해 기존 장바구니·주문 흐름을
-- 그대로 재사용한다(낙찰자 전용 구매권은 cart 액션에서 검증).

ALTER TABLE product ADD COLUMN sale_mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE product ADD COLUMN auction_start_price INT;
ALTER TABLE product ADD COLUMN auction_current_price INT;
ALTER TABLE product ADD COLUMN auction_bid_count INT NOT NULL DEFAULT 0;
ALTER TABLE product ADD COLUMN auction_ends_at TIMESTAMPTZ;
ALTER TABLE product ADD COLUMN auction_status TEXT;
ALTER TABLE product ADD COLUMN auction_winner_account_id UUID;
ALTER TABLE product ADD COLUMN auction_pay_due_at TIMESTAMPTZ;

ALTER TABLE product
    ADD CONSTRAINT product_sale_mode_chk CHECK (sale_mode IN ('fixed', 'auction')),
    ADD CONSTRAINT product_auction_status_chk
        CHECK (auction_status IS NULL OR auction_status IN ('live', 'awarded', 'passed')),
    ADD CONSTRAINT product_auction_fields_chk CHECK (
        sale_mode = 'fixed'
        OR (
            auction_start_price IS NOT NULL
            AND auction_start_price > 0
            AND auction_ends_at IS NOT NULL
            AND auction_status IS NOT NULL
        )
    );

-- 마감 스윕(lazy + cron)이 '기한 지난 live'만 빠르게 찾도록.
CREATE INDEX product_auction_due_idx
    ON product (auction_status, auction_ends_at)
    WHERE sale_mode = 'auction';

-- 입찰 원장 — 입찰은 취소 불가라 INSERT만 일어난다.
CREATE TABLE auction_bid (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT      NOT NULL,
    account_id UUID        NOT NULL,
    amount     INT         NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE auction_bid
    ADD CONSTRAINT auction_bid_amount_positive CHECK (amount > 0);

-- 상품별 최고가·내역 조회(금액 내림차순, 동가면 먼저 넣은 쪽 우선).
CREATE INDEX auction_bid_product_idx ON auction_bid (product_id, amount DESC, id ASC);
-- 계정별 입찰 내역.
CREATE INDEX auction_bid_account_idx ON auction_bid (account_id, created_at DESC);

COMMENT ON COLUMN product.sale_mode IS '판매 방식: fixed(고정가) | auction(입찰 경매)';
COMMENT ON COLUMN product.auction_start_price IS '경매 시작가(KRW). auction 모드 필수';
COMMENT ON COLUMN product.auction_current_price IS '현재 최고 입찰가(KRW). 입찰 없으면 NULL — auction_bid 최대값의 비정규화 캐시';
COMMENT ON COLUMN product.auction_bid_count IS '누적 입찰 수 — auction_bid 건수의 비정규화 캐시';
COMMENT ON COLUMN product.auction_ends_at IS '경매 마감 시각. 마감 직전 입찰 시 스나이핑 방지로 연장될 수 있음';
COMMENT ON COLUMN product.auction_status IS 'live(진행) | awarded(낙찰, 결제 대기) | passed(유찰)';
COMMENT ON COLUMN product.auction_winner_account_id IS '낙찰자 account.id — awarded 상태에서만 의미';
COMMENT ON COLUMN product.auction_pay_due_at IS '낙찰자 결제 기한 — 지나면 유찰(passed) 처리';
COMMENT ON TABLE auction_bid IS '경매 입찰 원장 (취소 불가, append-only). FK 없음 — 앱 레벨 정합성(data-modeling.md)';
