import "server-only";

import { db } from "@/lib/db";
import { REFERRAL_POINTS } from "@/modules/points/lib/rules";
import { notify } from "@/modules/notifications/lib/notify";

export const REFERRAL_COOKIE = "iroiro_ref";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

/**
 * 가입 완료 직후 리퍼럴 귀속 — referral 행(피초대자 유니크)이 멱등 게이트.
 * 자기 초대·무효 코드는 조용히 무시. 성공 시 양쪽에 포인트 + 초대자 알림.
 */
export async function applyReferral(
  inviteeAccountId: string,
  refCode: string,
): Promise<void> {
  const code = refCode.trim();
  if (!code) return;

  const inviter = await db.account.findFirst({
    where: { publicCode: code, deletedAt: null },
    select: { id: true, displayName: true },
  });
  if (!inviter || inviter.id === inviteeAccountId) return;

  // 피초대자당 1건 — 유니크 충돌(이미 귀속) 시 보상 없이 종료.
  try {
    await db.referral.create({
      data: { inviterAccountId: inviter.id, inviteeAccountId },
    });
  } catch {
    return;
  }

  await db.pointTransaction.createMany({
    data: [
      {
        accountId: inviter.id,
        amount: REFERRAL_POINTS,
        reason: "referral",
        memo: "친구 초대 보상",
      },
      {
        accountId: inviteeAccountId,
        amount: REFERRAL_POINTS,
        reason: "referral",
        memo: "초대받아 가입 보상",
      },
    ],
  });

  await notify(inviter.id, {
    type: "referral_joined",
    title: "초대한 친구가 가입했어요!",
    body: `친구 초대 보상 ${REFERRAL_POINTS.toLocaleString()}P가 적립됐어요.`,
    link: "/mypage/points",
  });
}
