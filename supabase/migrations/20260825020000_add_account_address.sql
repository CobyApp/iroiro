-- add_account_address: 마이페이지 주소록 — 자주 쓰는 배송지를 저장해 두고 고른다.
-- (order_address는 주문별 스냅샷이라 그대로 두고, 원본 주소록을 따로 관리.)

CREATE TABLE account_address
(
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      UUID        NOT NULL,
    label           TEXT,
    recipient_name  TEXT        NOT NULL,
    recipient_phone TEXT        NOT NULL,
    zipcode         TEXT        NOT NULL,
    base_address    TEXT        NOT NULL,
    detail_address  TEXT,
    is_default      BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX account_address_account_created_idx ON account_address (account_id, created_at);
-- 계정당 기본 배송지는 1개만.
CREATE UNIQUE INDEX account_address_default_unique ON account_address (account_id) WHERE is_default;

COMMENT ON TABLE account_address IS '회원 주소록(배송지)';
COMMENT ON COLUMN account_address.id IS 'PK';
COMMENT ON COLUMN account_address.account_id IS '회원 ID';
COMMENT ON COLUMN account_address.label IS '배송지 별칭 (집·회사 등)';
COMMENT ON COLUMN account_address.recipient_name IS '받는 사람';
COMMENT ON COLUMN account_address.recipient_phone IS '연락처';
COMMENT ON COLUMN account_address.zipcode IS '우편번호';
COMMENT ON COLUMN account_address.base_address IS '기본 주소';
COMMENT ON COLUMN account_address.detail_address IS '상세 주소';
COMMENT ON COLUMN account_address.is_default IS '기본 배송지 여부 (계정당 1개)';
COMMENT ON COLUMN account_address.created_at IS '생성일';
COMMENT ON COLUMN account_address.updated_at IS '수정일';

-- 주소록은 본인 CRUD 전부 필요.
GRANT SELECT, INSERT, UPDATE, DELETE ON account_address TO app;
