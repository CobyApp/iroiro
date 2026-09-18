-- notification_type_message: 알림 type CHECK에 'message'(쪽지) 추가.
-- 겸사겸사 코드(NotificationType)에 있으나 제약에서 누락됐던 referral_joined·wish_alert도 포함.

ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_type_chk;
ALTER TABLE notification
  ADD CONSTRAINT notification_type_chk CHECK (
    type IN (
      'bid_outbid',
      'auction_won',
      'auction_expired',
      'order_paid',
      'order_shipped',
      'order_delivered',
      'referral_joined',
      'wish_alert',
      'message',
      'system'
    )
  );
