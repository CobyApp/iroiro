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

// 발송 결과 요약 — 테스트/진단에서 실제 도달 여부를 사용자에게 보여주기 위해 반환한다.
export type PushSendResult = {
  configured: boolean;
  total: number;
  sent: number;
  removed: number; // 만료(404/410)로 정리된 구독
  failed: number; // 그 외 실패
  errorCodes: number[]; // 실패 상태 코드(진단용)
};

export async function sendPushToAccount(
  accountId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  const result: PushSendResult = {
    configured: ensureConfigured(),
    total: 0,
    sent: 0,
    removed: 0,
    failed: 0,
    errorCodes: [],
  };
  if (!result.configured) return result;

  const subscriptions = await db.pushSubscription.findMany({
    where: { accountId },
  });
  result.total = subscriptions.length;
  if (subscriptions.length === 0) return result;

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
        result.sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // 구독 만료/해지 — 죽은 endpoint 정리
          result.removed += 1;
          await db.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          result.failed += 1;
          if (typeof statusCode === "number") result.errorCodes.push(statusCode);
          console.error("[push] 발송 실패", { endpoint: sub.endpoint, error });
        }
      }
    }),
  );
  return result;
}
