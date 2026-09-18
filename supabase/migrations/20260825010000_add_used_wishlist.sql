-- add_used_wishlist: 중고 매물 찜 — 스토어 wishlist와 동일한 토글 UX를 유저 매물에도 제공.

CREATE TABLE used_wishlist
(
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID        NOT NULL,
    listing_id BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX used_wishlist_account_listing_unique ON used_wishlist (account_id, listing_id);
CREATE INDEX used_wishlist_listing_idx ON used_wishlist (listing_id);
CREATE INDEX used_wishlist_account_created_idx ON used_wishlist (account_id, created_at);

COMMENT ON TABLE used_wishlist IS '중고 매물 찜';
COMMENT ON COLUMN used_wishlist.id IS 'PK';
COMMENT ON COLUMN used_wishlist.account_id IS '회원 ID';
COMMENT ON COLUMN used_wishlist.listing_id IS '중고 매물 ID';
COMMENT ON COLUMN used_wishlist.created_at IS '생성일';

-- 찜 토글(생성·해제)이라 UPDATE 불필요 — wishlist와 동일 권한.
GRANT SELECT, INSERT, DELETE ON used_wishlist TO app;
