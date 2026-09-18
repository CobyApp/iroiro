-- 최애(좋아하는) 그룹·멤버 — 가입/회원정보에서 복수 선택, 홈 맞춤 추천에 사용.
CREATE TABLE account_favorite (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID        NOT NULL,
    kind       TEXT        NOT NULL,
    target_id  BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE account_favorite
    ADD CONSTRAINT account_favorite_kind_chk CHECK (kind IN ('team', 'member')),
    ADD CONSTRAINT account_favorite_uq UNIQUE (account_id, kind, target_id);

CREATE INDEX account_favorite_account_idx ON account_favorite (account_id);

COMMENT ON TABLE account_favorite IS '계정별 최애 그룹·멤버. FK 없음 — 앱 레벨 정합성(data-modeling.md)';
COMMENT ON COLUMN account_favorite.kind IS 'team | member — target_id가 가리키는 대상';

-- GRANT — 앱은 조회·등록·해제(전량 교체 저장).
GRANT SELECT, INSERT, DELETE ON account_favorite TO app;
