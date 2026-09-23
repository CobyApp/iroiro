"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { db } from "@/lib/db";
import { getCurrentAccount } from "@/modules/auth/dal";
import { sendPushToAccount } from "./lib/push";

async function requireAccountId(): Promise<string> {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account.id;
}

const markReadSchema = z.object({ id: z.number().int().positive() });

/** 알림 1건 읽음 처리 — 본인 것만 (accountId 스코프). */
export async function markNotificationRead(input: {
  id: number;
}): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(markReadSchema, input);
    const accountId = await requireAccountId();
    await db.notification.updateMany({
      where: { id: BigInt(data.id), accountId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/", "layout");
  });
}

/** 내 알림 전체 읽음 처리. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const accountId = await requireAccountId();
    await db.notification.updateMany({
      where: { accountId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/", "layout");
  });
}

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

/** 웹 푸시 구독 저장 — 같은 endpoint는 계정 갱신(기기 재구독·계정 전환 대응). */
export async function savePushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(pushSubscriptionSchema, input);
    const accountId = await requireAccountId();
    await db.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: {
        accountId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
      },
      update: { accountId, p256dh: data.keys.p256dh, auth: data.keys.auth },
    });
  });
}

/** 이 기기(내 구독)로 테스트 푸시 발송 — 사용자가 실제 도착 여부를 직접 확인. */
export async function sendTestPush(): Promise<ActionResult<{ sent: number }>> {
  return runAction(async () => {
    const accountId = await requireAccountId();
    const subs = await db.pushSubscription.count({ where: { accountId } });
    if (subs === 0) {
      throw new DomainError(
        "이 계정에 등록된 기기가 없어요. 먼저 이 기기에서 푸시 알림을 켜주세요.",
      );
    }
    await sendPushToAccount(accountId, {
      title: "이로이로 테스트 알림",
      body: "이 알림이 보이면 이 기기 푸시가 정상 동작해요! 🎉",
      link: "/mypage",
    });
    return { sent: subs };
  });
}

/** 웹 푸시 구독 해제 — 본인 소유 endpoint만 삭제. */
export async function deletePushSubscription(input: {
  endpoint: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(
      z.object({ endpoint: z.string().url().max(2000) }),
      input,
    );
    const accountId = await requireAccountId();
    await db.pushSubscription.deleteMany({
      where: { endpoint: data.endpoint, accountId },
    });
  });
}
