import type { AccountAddress as PrismaAccountAddress } from "@prisma/client";
import type { AccountAddress } from "../types";

export function toAccountAddress(row: PrismaAccountAddress): AccountAddress {
  return {
    id: Number(row.id),
    label: row.label,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    zipcode: row.zipcode,
    baseAddress: row.baseAddress,
    detailAddress: row.detailAddress,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}
