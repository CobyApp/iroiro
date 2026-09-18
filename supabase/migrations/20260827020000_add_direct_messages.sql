-- add_direct_messages: 유저 간 1:1 쪽지(DM). 중고 판매자·게시글 작성자에게 문의.
-- 한 쌍(pair)당 스레드 1개 — a_account_id < b_account_id로 정규화해 유일성 보장.

CREATE TABLE message_thread
(
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    a_account_id   UUID        NOT NULL,
    b_account_id   UUID        NOT NULL,
    a_last_read_at TIMESTAMPTZ,
    b_last_read_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT message_thread_pair_order_chk CHECK (a_account_id < b_account_id)
);

CREATE UNIQUE INDEX message_thread_pair_unique ON message_thread (a_account_id, b_account_id);
CREATE INDEX message_thread_a_idx ON message_thread (a_account_id, last_message_at DESC);
CREATE INDEX message_thread_b_idx ON message_thread (b_account_id, last_message_at DESC);

COMMENT ON TABLE message_thread IS '1:1 쪽지 스레드(pair당 1개)';
COMMENT ON COLUMN message_thread.a_account_id IS '참여자 A (id 사전순 앞)';
COMMENT ON COLUMN message_thread.b_account_id IS '참여자 B (id 사전순 뒤)';
COMMENT ON COLUMN message_thread.a_last_read_at IS 'A가 마지막으로 읽은 시각(미읽음 계산)';
COMMENT ON COLUMN message_thread.b_last_read_at IS 'B가 마지막으로 읽은 시각';
COMMENT ON COLUMN message_thread.last_message_at IS '최근 메시지 시각(수신함 정렬)';

CREATE TABLE message
(
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    thread_id        BIGINT      NOT NULL,
    sender_account_id UUID       NOT NULL,
    body             TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX message_thread_created_idx ON message (thread_id, created_at);
CREATE INDEX message_sender_created_idx ON message (sender_account_id, created_at);

COMMENT ON TABLE message IS '쪽지 메시지';
COMMENT ON COLUMN message.thread_id IS '스레드 ID';
COMMENT ON COLUMN message.sender_account_id IS '보낸 회원 ID';
COMMENT ON COLUMN message.body IS '내용';

GRANT SELECT, INSERT, UPDATE ON message_thread TO app;
GRANT SELECT, INSERT ON message TO app;
