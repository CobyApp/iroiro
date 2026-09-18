"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  DomainError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";

// 주소록 CRUD — 본인 것만. 기본 배송지는 계정당 1개(partial unique가 최종 방어).

const MAX_ADDRESSES = 20;

const addressInputSchema = z.object({
  label: z.string().trim().max(30).optional(),
  recipientName: z.string().trim().min(1, "받는 사람을 입력해주세요").max(50),
  recipientPhone: z
    .string()
    .trim()
    .min(9, "연락처를 입력해주세요")
    .max(20)
    .regex(/^[0-9\-+ ]+$/, "연락처는 숫자로 입력해주세요"),
  zipcode: z.string().trim().min(1, "우편번호를 입력해주세요").max(10),
  baseAddress: z.string().trim().min(1, "주소를 입력해주세요").max(200),
  detailAddress: z.string().trim().max(200).optional(),
  isDefault: z.boolean().optional(),
});

export type AddressInput = z.infer<typeof addressInputSchema>;

async function requireLogin() {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
  return account;
}

function parse(input: AddressInput) {
  const parsed = addressInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError(
      parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      "invalid_input",
    );
  }
  return parsed.data;
}

function toData(data: ReturnType<typeof parse>) {
  return {
    label: data.label || null,
    recipientName: data.recipientName,
    recipientPhone: data.recipientPhone,
    zipcode: data.zipcode,
    baseAddress: data.baseAddress,
    detailAddress: data.detailAddress || null,
  };
}

function revalidate() {
  revalidatePath("/mypage/addresses");
}

export async function createAddress(
  input: AddressInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const data = parse(input);
    const count = await db.accountAddress.count({
      where: { accountId: account.id },
    });
    if (count >= MAX_ADDRESSES) {
      throw new DomainError(
        `배송지는 최대 ${MAX_ADDRESSES}개까지 저장할 수 있어요`,
        "too_many",
      );
    }
    // 첫 배송지는 자동으로 기본 지정.
    const makeDefault = data.isDefault === true || count === 0;
    const row = await db.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.accountAddress.updateMany({
          where: { accountId: account.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.accountAddress.create({
        data: {
          accountId: account.id,
          ...toData(data),
          isDefault: makeDefault,
        },
      });
    });
    revalidate();
    return { id: Number(row.id) };
  });
}

export async function updateAddress(
  id: number,
  input: AddressInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const data = parse(input);
    const existing = await db.accountAddress.findFirst({
      where: { id: BigInt(id), accountId: account.id },
    });
    if (!existing) throw new DomainError("배송지를 찾을 수 없어요", "not_found");
    const makeDefault = data.isDefault === true;
    await db.$transaction(async (tx) => {
      if (makeDefault && !existing.isDefault) {
        await tx.accountAddress.updateMany({
          where: { accountId: account.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      await tx.accountAddress.update({
        where: { id: BigInt(id) },
        data: {
          ...toData(data),
          ...(makeDefault ? { isDefault: true } : {}),
          updatedAt: new Date(),
        },
      });
    });
    revalidate();
  });
}

export async function setDefaultAddress(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const existing = await db.accountAddress.findFirst({
      where: { id: BigInt(id), accountId: account.id },
    });
    if (!existing) throw new DomainError("배송지를 찾을 수 없어요", "not_found");
    await db.$transaction(async (tx) => {
      await tx.accountAddress.updateMany({
        where: { accountId: account.id, isDefault: true },
        data: { isDefault: false },
      });
      await tx.accountAddress.update({
        where: { id: BigInt(id) },
        data: { isDefault: true, updatedAt: new Date() },
      });
    });
    revalidate();
  });
}

export async function deleteAddress(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const existing = await db.accountAddress.findFirst({
      where: { id: BigInt(id), accountId: account.id },
    });
    if (!existing) throw new DomainError("배송지를 찾을 수 없어요", "not_found");
    await db.accountAddress.delete({ where: { id: BigInt(id) } });
    revalidate();
  });
}
