-- 웹 푸시 구독 — 브라우저(기기)별 PushSubscription 저장. 계정당 여러 기기 가능.
-- endpoint가 기기 고유 키. 만료/해지(404·410) 응답 시 서버가 행을 지운다.
CREATE TABLE push_subscription (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID        NOT NULL,
    endpoint   TEXT        NOT NULL,
    p256dh     TEXT        NOT NULL,
    auth       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_subscription
    ADD CONSTRAINT push_subscription_endpoint_uq UNIQUE (endpoint);

CREATE INDEX push_subscription_account_idx ON push_subscription (account_id);

COMMENT ON TABLE push_subscription IS '웹 푸시 구독(기기별). FK 없음 — 앱 레벨 정합성(data-modeling.md)';
