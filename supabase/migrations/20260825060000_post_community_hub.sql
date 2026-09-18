-- post_community_hub: 게시판을 팬 커뮤니티 허브로 재편.
-- 토픽 2개(event=이벤트·모임 / community=자랑·수다)로 압축하고, 이벤트 구조화 필드
-- (일시·장소)·링크 첨부·최애(그룹/멤버) 태그·토레카 첨부 컬럼을 추가한다.

-- 기존 토픽 데이터 이관 — talk/info/question → community (이벤트성 글은 없었음).
UPDATE post SET topic = 'community' WHERE topic IN ('talk', 'info', 'question');

ALTER TABLE post
    ADD COLUMN team_id         BIGINT,
    ADD COLUMN member_id       BIGINT,
    ADD COLUMN card_id         BIGINT,
    ADD COLUMN link_url        TEXT,
    ADD COLUMN link_label      TEXT,
    ADD COLUMN event_starts_at TIMESTAMPTZ,
    ADD COLUMN event_ends_at   TIMESTAMPTZ,
    ADD COLUMN event_place     TEXT;

-- 이벤트 정렬(다가오는 순)·최애 필터·카드 역참조용 인덱스.
CREATE INDEX post_event_starts_at_idx ON post (event_starts_at) WHERE event_starts_at IS NOT NULL;
CREATE INDEX post_team_idx ON post (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX post_member_idx ON post (member_id) WHERE member_id IS NOT NULL;
CREATE INDEX post_card_idx ON post (card_id) WHERE card_id IS NOT NULL;

COMMENT ON COLUMN post.team_id IS '최애 태그 — 그룹 ID';
COMMENT ON COLUMN post.member_id IS '최애 태그 — 멤버 ID';
COMMENT ON COLUMN post.card_id IS '첨부한 토레카 ID (card 마스터)';
COMMENT ON COLUMN post.link_url IS '외부 링크 URL (예약·공지 등)';
COMMENT ON COLUMN post.link_label IS '외부 링크 라벨';
COMMENT ON COLUMN post.event_starts_at IS '이벤트 시작 일시';
COMMENT ON COLUMN post.event_ends_at IS '이벤트 종료 일시(기간 이벤트)';
COMMENT ON COLUMN post.event_place IS '이벤트 장소';
