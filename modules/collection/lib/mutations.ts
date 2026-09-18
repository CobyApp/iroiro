import "server-only";

import { Prisma } from "@prisma/client";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import { generatePublicCode } from "@/lib/public-code";

type Db = Pick<
  typeof defaultDb,
  "collection" | "collectionItem" | "inventoryItem" | "$transaction"
>;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

// 소유 컬렉션 스코프 검증 — 미존재·타인 소유를 같은 에러로(존재 여부 비노출).
async function requireOwnedCollection(
  db: Db,
  accountId: string,
  collectionId: bigint,
): Promise<{ id: bigint; publicCode: string }> {
  const collection = await db.collection.findFirst({
    where: { id: collectionId, accountId },
    select: { id: true, publicCode: true },
  });
  if (!collection) throw new DomainError("컬렉션을 찾을 수 없습니다");
  return collection;
}

// 컬렉션 생성 — sort_order = 회원 내 MAX+1(첫 컬렉션 1), public_code 충돌(P2002) 시 재생성.
export async function createCollection(
  accountId: string,
  title: string,
  db: Db = defaultDb,
): Promise<{ id: number; publicCode: string }> {
  const max = await db.collection.aggregate({
    where: { accountId },
    _max: { sortOrder: true },
  });
  const sortOrder = (max._max.sortOrder ?? 0) + 1;

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const row = await db.collection.create({
        data: { accountId, publicCode: generatePublicCode(), title, sortOrder },
        select: { id: true, publicCode: true },
      });
      return { id: Number(row.id), publicCode: row.publicCode };
    } catch (error) {
      if (isUniqueViolation(error)) continue; // public_code 충돌 → 새 code로 재생성
      throw error;
    }
  }
  throw new Error("컬렉션 생성 재시도 초과");
}

// 컬렉션 삭제 — 등록 항목도 같은 tx에서 삭제(FK 없음 — 앱 cascade). 보유 원장은 무관.
export async function deleteCollection(
  accountId: string,
  collectionId: number,
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(collectionId);
  await db.$transaction(async (tx) => {
    const deleted = await tx.collection.deleteMany({ where: { id, accountId } });
    if (deleted.count === 0) throw new DomainError("컬렉션을 찾을 수 없습니다");
    await tx.collectionItem.deleteMany({ where: { collectionId: id } });
  });
}

// 보유 상품 등록 — 활성 보유 > 0 검증(UX용 — 동시 환불 경합은 도출이 자가 치유, 락 불필요).
// sort_order = 컬렉션 내 MAX+1. 중복 등록은 UNIQUE(collection_id, product_id) P2002 → 도메인 에러.
export async function registerItem(
  accountId: string,
  collectionId: number,
  productId: number,
  db: Db = defaultDb,
): Promise<{ publicCode: string }> {
  const cid = BigInt(collectionId);
  const pid = BigInt(productId);
  const collection = await requireOwnedCollection(db, accountId, cid);

  const active = await db.inventoryItem.aggregate({
    where: { accountId, productId: pid, reversedAt: null },
    _sum: { quantity: true },
  });
  if ((active._sum.quantity ?? 0) <= 0) {
    throw new DomainError("보유하지 않은 상품입니다");
  }

  const max = await db.collectionItem.aggregate({
    where: { collectionId: cid },
    _max: { sortOrder: true },
  });
  try {
    await db.collectionItem.create({
      data: { collectionId: cid, productId: pid, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("이미 등록된 상품입니다");
    throw error;
  }
  return { publicCode: collection.publicCode };
}

// 등록 해제 — 행 삭제(보유 원장은 무관).
export async function unregisterItem(
  accountId: string,
  collectionId: number,
  productId: number,
  db: Db = defaultDb,
): Promise<{ publicCode: string }> {
  const cid = BigInt(collectionId);
  const collection = await requireOwnedCollection(db, accountId, cid);
  const removed = await db.collectionItem.deleteMany({
    where: { collectionId: cid, productId: BigInt(productId) },
  });
  if (removed.count === 0) throw new DomainError("등록된 상품이 없습니다");
  return { publicCode: collection.publicCode };
}

// 카드 재배치 — 배열 순서대로 sort_order 1..N 재부여(유니크 없음 — 단순 일괄 UPDATE).
// 배열에 없는 등록은 기존 순번 유지(부분 재배치 허용, 동순위는 id로 안정 정렬).
export async function reorderItems(
  accountId: string,
  collectionId: number,
  orderedProductIds: number[],
  db: Db = defaultDb,
): Promise<{ publicCode: string }> {
  const cid = BigInt(collectionId);
  const collection = await requireOwnedCollection(db, accountId, cid);
  await db.$transaction(async (tx) => {
    for (const [index, productId] of orderedProductIds.entries()) {
      await tx.collectionItem.updateMany({
        where: { collectionId: cid, productId: BigInt(productId) },
        data: { sortOrder: index + 1, updatedAt: new Date() },
      });
    }
  });
  return { publicCode: collection.publicCode };
}

export async function setCollectionPublic(
  accountId: string,
  collectionId: number,
  isPublic: boolean,
  db: Db = defaultDb,
): Promise<{ publicCode: string }> {
  const cid = BigInt(collectionId);
  const collection = await requireOwnedCollection(db, accountId, cid);
  await db.collection.updateMany({
    where: { id: cid, accountId },
    data: { isPublic, updatedAt: new Date() },
  });
  return { publicCode: collection.publicCode };
}

export async function setCollectionTitle(
  accountId: string,
  collectionId: number,
  title: string,
  db: Db = defaultDb,
): Promise<{ publicCode: string }> {
  const cid = BigInt(collectionId);
  const collection = await requireOwnedCollection(db, accountId, cid);
  await db.collection.updateMany({
    where: { id: cid, accountId },
    data: { title, updatedAt: new Date() },
  });
  return { publicCode: collection.publicCode };
}
