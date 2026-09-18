-- add_account_board_role: 게시판 권한 등급 + 작성 제재.
--  board_role: member(기본) | moderator(게시판 관리 — 남의 글 관리·공지 등록)
--  site admin(is_admin)은 상위 권한으로 moderator 권한을 자동 포함한다(앱 판정).
--  posting_banned_at: 신고 등으로 글·댓글 작성이 제한된 시각(NULL=정상).

ALTER TABLE account
    ADD COLUMN board_role        TEXT        NOT NULL DEFAULT 'member',
    ADD COLUMN posting_banned_at TIMESTAMPTZ,
    ADD COLUMN posting_ban_reason TEXT;

ALTER TABLE account
    ADD CONSTRAINT account_board_role_chk CHECK (board_role IN ('member', 'moderator'));

CREATE INDEX account_board_role_idx ON account (board_role) WHERE board_role <> 'member';

COMMENT ON COLUMN account.board_role IS '게시판 권한 — member | moderator';
COMMENT ON COLUMN account.posting_banned_at IS '작성 제재 시각 (NULL=정상). 글·댓글 작성 차단';
COMMENT ON COLUMN account.posting_ban_reason IS '작성 제재 사유';
