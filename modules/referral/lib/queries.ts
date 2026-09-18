import "server-only";

import { db } from "@/lib/db";
import { REFERRAL_POINTS } from "@/modules/points/lib/rules";

export type ReferralStats = {
  /** 내 초대 코드(공개 작성자 코드 재사용). */
  code: string;
  invitedCount: number;
  earnedPoints: number;
};

export async function getReferralStats(
  accountId: string,
): Promise<ReferralStats | null> {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { publicCode: true },
  });
  if (!account) return null;

  const invitedCount = await db.referral.count({
    where: { inviterAccountId: accountId },
  });
  return {
    code: account.publicCode,
    invitedCount,
    earnedPoints: invitedCount * REFERRAL_POINTS,
  };
}
