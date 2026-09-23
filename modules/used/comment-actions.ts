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

// 중고 매물 공개 댓글 액션 — 로그인 회원 누구나 작성, 본인 댓글만 삭제.
// 대댓글은 최상위 댓글에만 달 수 있다(1단계). 각 액션이 자체 인증한다(공개 라우트 호출 대비).

async function requireLogin() {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
  return account;
}

const createSchema = z.object({
  listingId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable().default(null),
  body: z.string().trim().min(1, "내용을 입력해주세요").max(1000, "1000자 이내로 입력해주세요"),
});

export async function createUsedComment(input: {
  listingId: number;
  parentId?: number | null;
  body: string;
}): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const data = parseActionInput(createSchema, {
      listingId: input.listingId,
      parentId: input.parentId ?? null,
      body: input.body,
    });

    // 매물 존재 확인.
    const listing = await db.usedListing.findUnique({
      where: { id: BigInt(data.listingId) },
      select: { id: true },
    });
    if (!listing) throw new DomainError("매물을 찾을 수 없습니다");

    // 대댓글은 같은 매물의 최상위(부모 없음) 댓글에만 — 스레드는 1단계로 평탄화.
    if (data.parentId !== null) {
      const parent = await db.usedListingComment.findUnique({
        where: { id: BigInt(data.parentId) },
        select: { listingId: true, parentId: true, deletedAt: true },
      });
      if (!parent || Number(parent.listingId) !== data.listingId) {
        throw new DomainError("답글 대상을 찾을 수 없습니다");
      }
      if (parent.parentId !== null) {
        throw new DomainError("답글에는 답글을 달 수 없습니다");
      }
      if (parent.deletedAt !== null) {
        throw new DomainError("삭제된 댓글에는 답글을 달 수 없습니다");
      }
    }

    const created = await db.usedListingComment.create({
      data: {
        listingId: BigInt(data.listingId),
        accountId: account.id,
        parentId: data.parentId === null ? null : BigInt(data.parentId),
        body: data.body,
      },
      select: { id: true },
    });
    revalidatePath(`/used/${data.listingId}`);
    revalidatePath("/used");
    return { id: Number(created.id) };
  });
}

export async function deleteUsedComment(
  commentId: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const id = parseActionInput(z.number().int().positive(), commentId);

    const comment = await db.usedListingComment.findUnique({
      where: { id: BigInt(id) },
      select: { accountId: true, listingId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt !== null) {
      throw new DomainError("댓글을 찾을 수 없습니다");
    }
    // 본인 댓글만 삭제 — 소프트 삭제(스레드 유지).
    if (comment.accountId !== account.id) {
      throw new DomainError("본인 댓글만 삭제할 수 있습니다");
    }
    const now = new Date();
    await db.usedListingComment.updateMany({
      where: { id: BigInt(id), accountId: account.id, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
    revalidatePath(`/used/${Number(comment.listingId)}`);
    revalidatePath("/used");
  });
}
