-- add_card_catalog: 토레카 마스터 데이터 — 외부 분석기 의존에서 자체 관리로.
-- 상품(product)·중고 매물(used_listing)은 "판매물"이고, card는 "카드 그 자체"의
-- 원본 데이터다. 외부 동기화 + 관리자 직접 등록 + 유저 제보(검수) 세 경로로 쌓인다.

CREATE TABLE card
(
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source                  TEXT        NOT NULL DEFAULT 'admin',
    external_id             BIGINT,
    item_code               TEXT,
    item_type               TEXT        NOT NULL DEFAULT 'photocard',
    team_id                 BIGINT,
    member_id               BIGINT,
    series_id               BIGINT,
    name                    TEXT        NOT NULL,
    description             TEXT,
    front_r2_key            TEXT,
    back_r2_key             TEXT,
    front_image_url         TEXT,
    back_image_url          TEXT,
    market_avg_jpy          INTEGER     NOT NULL DEFAULT 0,
    market_min_jpy          INTEGER     NOT NULL DEFAULT 0,
    market_max_jpy          INTEGER     NOT NULL DEFAULT 0,
    market_sold_count       INTEGER     NOT NULL DEFAULT 0,
    retail_price_jpy        INTEGER     NOT NULL DEFAULT 0,
    status                  TEXT        NOT NULL DEFAULT 'active',
    submitted_by_account_id UUID,
    review_note             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT card_source_chk CHECK (source IN ('external', 'admin', 'user')),
    CONSTRAINT card_status_chk CHECK (status IN ('active', 'pending', 'rejected'))
);

CREATE UNIQUE INDEX card_external_id_unique ON card (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX card_team_member_idx ON card (team_id, member_id);
CREATE INDEX card_series_idx ON card (series_id);
CREATE INDEX card_status_idx ON card (status);
CREATE INDEX card_created_at_idx ON card (created_at);

COMMENT ON TABLE card IS '토레카 마스터 (카드 원본 데이터)';
COMMENT ON COLUMN card.id IS 'PK';
COMMENT ON COLUMN card.source IS '출처 — external(분석기 동기화)/admin(관리자 등록)/user(유저 제보)';
COMMENT ON COLUMN card.external_id IS '외부 분석기 카드 ID (동기화 upsert 키)';
COMMENT ON COLUMN card.item_code IS '외부 아이템 코드';
COMMENT ON COLUMN card.item_type IS '아이템 종류 (photocard 등)';
COMMENT ON COLUMN card.team_id IS '그룹 ID';
COMMENT ON COLUMN card.member_id IS '멤버 ID';
COMMENT ON COLUMN card.series_id IS '시리즈 ID';
COMMENT ON COLUMN card.name IS '카드 이름';
COMMENT ON COLUMN card.description IS '설명';
COMMENT ON COLUMN card.front_r2_key IS '앞면 이미지 R2 키 (자체 업로드 — 63:88 정규화)';
COMMENT ON COLUMN card.back_r2_key IS '뒷면 이미지 R2 키';
COMMENT ON COLUMN card.front_image_url IS '앞면 외부 원본 URL (external)';
COMMENT ON COLUMN card.back_image_url IS '뒷면 외부 원본 URL';
COMMENT ON COLUMN card.market_avg_jpy IS '일본 시세 평균(엔)';
COMMENT ON COLUMN card.market_min_jpy IS '일본 시세 최저(엔)';
COMMENT ON COLUMN card.market_max_jpy IS '일본 시세 최고(엔)';
COMMENT ON COLUMN card.market_sold_count IS '시세 표본 거래 수';
COMMENT ON COLUMN card.retail_price_jpy IS '정가(엔)';
COMMENT ON COLUMN card.status IS '상태 — active(공개)/pending(제보 검수 대기)/rejected(반려)';
COMMENT ON COLUMN card.submitted_by_account_id IS '제보한 회원 ID (user 출처)';
COMMENT ON COLUMN card.review_note IS '검수 메모 (반려 사유 등)';
COMMENT ON COLUMN card.created_at IS '생성일';
COMMENT ON COLUMN card.updated_at IS '수정일';

-- 관리자 CRUD + 유저 제보(INSERT) — 앱 롤 전체 권한.
GRANT SELECT, INSERT, UPDATE, DELETE ON card TO app;
