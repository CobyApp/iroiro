-- used_listing_card_ref: 중고 매물 ↔ 토레카 마스터(card) 연결.
-- 매물 등록이 "카드 선택" 기반으로 바뀌면서 제목·그룹·멤버·시리즈를
-- 카드에서 파생한다 — 어떤 카드의 매물인지 정규 참조를 남긴다.

ALTER TABLE used_listing
    ADD COLUMN card_id BIGINT;

CREATE INDEX used_listing_card_idx ON used_listing (card_id);

COMMENT ON COLUMN used_listing.card_id IS '토레카 마스터 카드 ID (제목·계층 파생 원본)';
