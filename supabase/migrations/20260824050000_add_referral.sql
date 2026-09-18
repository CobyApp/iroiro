-- 친구 초대(리퍼럴) — 초대 코드는 account.public_code 재사용.
-- 피초대자당 1건(다중 귀속 불가). 보상 지급의 멱등 게이트 역할.
CREATE TABLE referral (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inviter_account_id UUID NOT NULL,
  invitee_account_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_invitee_once UNIQUE (invitee_account_id)
);
CREATE INDEX referral_inviter_idx ON referral (inviter_account_id, created_at DESC);

-- 앱은 제한된 app 롤로 접속 — GRANT 없으면 프로덕션에서 42501 (PR #31 사례).
GRANT SELECT, INSERT ON referral TO app;
