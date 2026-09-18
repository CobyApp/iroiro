-- 인앱 알림 — 입찰(추월·낙찰·기한만료)·주문/배송 등 이벤트를 계정별로 쌓는다.
-- link_path = 앱 내 딥링크 경로(예: /products/300, /orders/O-2026...). 탭하면 이동.
CREATE TABLE notification (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID        NOT NULL,
    type       TEXT        NOT NULL,
    title      TEXT        NOT NULL,
    body       TEXT,
    link_path  TEXT,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification
    ADD CONSTRAINT notification_type_chk CHECK (
        type IN ('bid_outbid', 'auction_won', 'auction_expired', 'order_paid', 'order_shipped', 'order_delivered', 'system')
    );

-- 계정별 최신순 목록.
CREATE INDEX notification_account_idx ON notification (account_id, created_at DESC);
-- 미읽음 뱃지 카운트 — 부분 인덱스로 저렴하게.
CREATE INDEX notification_account_unread_idx ON notification (account_id) WHERE read_at IS NULL;

COMMENT ON TABLE notification IS '계정별 인앱 알림. FK 없음 — 앱 레벨 정합성(data-modeling.md)';
COMMENT ON COLUMN notification.type IS 'bid_outbid(입찰 추월) | auction_won(낙찰) | auction_expired(결제기한 만료) | order_paid | order_shipped | order_delivered | system';
COMMENT ON COLUMN notification.link_path IS '앱 내 딥링크 경로 — 알림 탭 시 이동';
