import "server-only";

import { Prisma } from "@prisma/client";

// 주문/거래에 쓴 배송지를 주소록에 자동 저장하고 "최근 사용" 으로 승격한다(계정당 기본 배송지 1개).
// 다음 결제 화면이 기본 배송지를 자동으로 채우므로, 한 번 쓴 주소가 다음에 그대로 채워진다.
// 주문 트랜잭션 안에서 호출한다(tx). 실패해도 주문을 막지 않도록 caller 가 best-effort 로 감싼다.

const MAX_ADDRESSES = 20;

export type RememberAddressInput = {
  recipientName: string;
  recipientPhone: string;
  zipcode: string;
  baseAddress: string;
  detailAddress: string | null;
};

export async function rememberAddress(
  tx: Prisma.TransactionClient,
  accountId: string,
  addr: RememberAddressInput,
): Promise<void> {
  const detailAddress = addr.detailAddress?.trim() ? addr.detailAddress.trim() : null;
  // 완전히 동일한 배송지가 이미 있으면 그걸 최근(기본)으로 올린다.
  const existing = await tx.accountAddress.findFirst({
    where: {
      accountId,
      zipcode: addr.zipcode,
      baseAddress: addr.baseAddress,
      detailAddress,
      recipientName: addr.recipientName,
      recipientPhone: addr.recipientPhone,
    },
    select: { id: true },
  });
  // 기본 배송지는 계정당 1개(부분 유니크) — 기존 기본을 먼저 해제한 뒤 이번 배송지를 기본으로.
  await tx.accountAddress.updateMany({
    where: { accountId, isDefault: true },
    data: { isDefault: false },
  });
  if (existing) {
    await tx.accountAddress.update({
      where: { id: existing.id },
      data: { isDefault: true, updatedAt: new Date() },
    });
    return;
  }
  // 주소록이 가득 차 있으면 가장 오래 안 쓴 것을 하나 비우고 저장(한도 유지, 주문은 계속).
  const count = await tx.accountAddress.count({ where: { accountId } });
  if (count >= MAX_ADDRESSES) {
    const oldest = await tx.accountAddress.findFirst({
      where: { accountId },
      orderBy: { updatedAt: "asc" },
      select: { id: true },
    });
    if (oldest) await tx.accountAddress.delete({ where: { id: oldest.id } });
  }
  await tx.accountAddress.create({
    data: {
      accountId,
      recipientName: addr.recipientName,
      recipientPhone: addr.recipientPhone,
      zipcode: addr.zipcode,
      baseAddress: addr.baseAddress,
      detailAddress,
      isDefault: true,
    },
  });
}
