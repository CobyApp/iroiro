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
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";

// 이메일 또는 닉네임 정확 일치로 계정을 찾는다 — 잘못 지급 방지(부분 일치 금지).
async function findGrantTarget(query: string) {
  const trimmed = query.trim();
  if (!trimmed) throw new DomainError("이메일 또는 닉네임을 입력해주세요");
  const account = await db.account.findFirst({
    where: {
      deletedAt: null,
      OR: [{ email: trimmed }, { displayName: trimmed }],
    },
    select: { id: true, displayName: true, email: true },
  });
  if (!account) throw new DomainError("일치하는 회원이 없습니다");
  return account;
}

const grantPointsSchema = z.object({
  query: z.string().trim().min(1).max(100),
  // 음수 = 차감(정정). 0 금지, 한 번에 최대 100만.
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "0은 지급할 수 없습니다")
    .refine((n) => Math.abs(n) <= 1_000_000, "한 번에 최대 1,000,000P"),
  memo: z.string().trim().max(200).optional(),
});

export async function adminGrantPoints(input: {
  query: string;
  amount: number;
  memo?: string;
}): Promise<ActionResult<{ accountName: string; balance: number }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(grantPointsSchema, input);
    const account = await findGrantTarget(data.query);

    // 차감은 잔액 한도 내에서만 — 원장이 음수 잔액으로 내려가지 않게.
    if (data.amount < 0) {
      const agg = await db.pointTransaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      if ((agg._sum.amount ?? 0) + data.amount < 0) {
        throw new DomainError("차감액이 보유 잔액을 초과합니다");
      }
    }

    await db.pointTransaction.create({
      data: {
        accountId: account.id,
        amount: data.amount,
        reason: "admin",
        memo: data.memo || "운영자 지급",
      },
    });
    const agg = await db.pointTransaction.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    revalidatePath("/admin/points");
    return {
      accountName: account.displayName,
      balance: agg._sum.amount ?? 0,
    };
  });
}

const grantCouponsSchema = z.object({
  query: z.string().trim().min(1).max(100),
  count: z.number().int().min(1).max(10),
});

export async function adminGrantCoupons(input: {
  query: string;
  count: number;
}): Promise<ActionResult<{ accountName: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(grantCouponsSchema, input);
    const account = await findGrantTarget(data.query);

    await db.accountCoupon.createMany({
      data: Array.from({ length: data.count }, () => ({
        accountId: account.id,
        kind: "free_shipping",
        issuedReason: "admin",
      })),
    });
    revalidatePath("/admin/points");
    return { accountName: account.displayName };
  });
}

// ── 회원 상세에서 특정 계정에 직접 지급(accountId 기준) ──────────────────────
async function requireActiveAccount(accountId: string) {
  const account = await db.account.findFirst({
    where: { id: accountId, deletedAt: null },
    select: { id: true, displayName: true },
  });
  if (!account) throw new DomainError("일치하는 회원이 없습니다");
  return account;
}

const grantPointsToSchema = z.object({
  accountId: z.string().uuid(),
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "0은 지급할 수 없습니다")
    .refine((n) => Math.abs(n) <= 1_000_000, "한 번에 최대 1,000,000P"),
  memo: z.string().trim().max(200).optional(),
});

export async function adminGrantPointsToAccount(input: {
  accountId: string;
  amount: number;
  memo?: string;
}): Promise<ActionResult<{ accountName: string; balance: number }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(grantPointsToSchema, input);
    const account = await requireActiveAccount(data.accountId);

    if (data.amount < 0) {
      const agg = await db.pointTransaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      if ((agg._sum.amount ?? 0) + data.amount < 0) {
        throw new DomainError("차감액이 보유 잔액을 초과합니다");
      }
    }
    await db.pointTransaction.create({
      data: {
        accountId: account.id,
        amount: data.amount,
        reason: "admin",
        memo: data.memo || "운영자 지급",
      },
    });
    const agg = await db.pointTransaction.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    revalidatePath(`/admin/users/${account.id}`);
    revalidatePath("/admin/points");
    return { accountName: account.displayName, balance: agg._sum.amount ?? 0 };
  });
}

const grantCouponsToSchema = z.object({
  accountId: z.string().uuid(),
  count: z.number().int().min(1).max(10),
});

export async function adminGrantCouponsToAccount(input: {
  accountId: string;
  count: number;
}): Promise<ActionResult<{ accountName: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(grantCouponsToSchema, input);
    const account = await requireActiveAccount(data.accountId);
    await db.accountCoupon.createMany({
      data: Array.from({ length: data.count }, () => ({
        accountId: account.id,
        kind: "free_shipping",
        issuedReason: "admin",
      })),
    });
    revalidatePath(`/admin/users/${account.id}`);
    revalidatePath("/admin/points");
    return { accountName: account.displayName };
  });
}
