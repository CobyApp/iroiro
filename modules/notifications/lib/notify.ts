import "server-only";

import { db } from "@/lib/db";
import { sendPushToAccount } from "./push";

export type NotificationType =
  | "bid_outbid"
  | "auction_won"
  | "auction_expired"
  | "order_paid"
  | "order_shipped"
  | "order_delivered"
  | "referral_joined"
  | "wish_alert"
  | "message"
  | "system";

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string;
  /** 앱 내 딥링크 경로 — 탭하면 이동 (예: /products/300, /orders/O-2026...) */
  link?: string;
};

/**
 * 계정에 인앱 알림을 쌓는다. 알림은 부가 기능 — 실패해도 본 흐름(입찰·결제)을
 * 깨지 않도록 오류를 삼키고 로그만 남긴다.
 */
export async function notify(
  accountId: string,
  input: NotifyInput,
): Promise<void> {
  try {
    await db.notification.create({
      data: {
        accountId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkPath: input.link ?? null,
      },
    });
    // 웹 푸시 병행 발송 — 구독 기기가 있으면 휴대폰·PC에도 도착.
    await sendPushToAccount(accountId, {
      title: input.title,
      body: input.body,
      link: input.link,
    });
  } catch (error) {
    console.error("[notify] 알림 생성 실패", { accountId, input, error });
  }
}
