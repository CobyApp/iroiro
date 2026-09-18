import "server-only";

import webpush from "web-push";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

// 웹 푸시 발송 — VAPID 키 미설정이면 조용히 no-op (인앱 알림은 별도로 동작).
// 만료·해지된 구독(404/410)은 발송 시점에 정리한다.

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT ?? "mailto:hello@iroiro.example",
    pub,
    priv,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body?: string;
  /** 앱 내 딥링크 경로 — 알림 클릭 시 이동 */
  link?: string;
};

export async function sendPushToAccount(
  accountId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await db.pushSubscription.findMany({
    where: { accountId },
  });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // 구독 만료/해지 — 죽은 endpoint 정리
          await db.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          console.error("[push] 발송 실패", { endpoint: sub.endpoint, error });
        }
      }
    }),
  );
}
