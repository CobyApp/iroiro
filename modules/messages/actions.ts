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
import { notify } from "@/modules/notifications/lib/notify";
import { canonicalPair } from "./types";

async function requireAccount() {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account;
}

// 상대 계정에게 쪽지 발송 — 스레드 없으면 생성. 스레드 id 반환.
const sendSchema = z.object({
  toAccountId: z.string().uuid(),
  body: z.string().trim().min(1, "내용을 입력하세요").max(2000),
});

export async function sendMessageToAccount(input: {
  toAccountId: string;
  body: string;
}): Promise<ActionResult<{ threadId: number }>> {
  return runAction(async () => {
    const data = parseActionInput(sendSchema, input);
    const me = await requireAccount();
    if (data.toAccountId === me.id) {
      throw new DomainError("자기 자신에게는 보낼 수 없습니다");
    }
    const target = await db.account.findUnique({
      where: { id: data.toAccountId },
      select: { id: true, displayName: true },
    });
    if (!target) throw new DomainError("상대를 찾을 수 없습니다");

    const { a, b } = canonicalPair(me.id, data.toAccountId);
    const now = new Date();
    const meIsA = a === me.id;

    const thread = await db.messageThread.upsert({
      where: { aAccountId_bAccountId: { aAccountId: a, bAccountId: b } },
      create: {
        aAccountId: a,
        bAccountId: b,
        lastMessageAt: now,
        // 보낸 사람은 자기 메시지를 이미 읽은 상태.
        aLastReadAt: meIsA ? now : null,
        bLastReadAt: meIsA ? null : now,
      },
      update: {
        lastMessageAt: now,
        ...(meIsA ? { aLastReadAt: now } : { bLastReadAt: now }),
      },
    });

    await db.message.create({
      data: {
        threadId: thread.id,
        senderAccountId: me.id,
        body: data.body,
      },
    });

    const threadId = Number(thread.id);
    await notify(data.toAccountId, {
      type: "message",
      title: `${me.displayName}님의 쪽지`,
      body: data.body.length > 40 ? `${data.body.slice(0, 40)}…` : data.body,
      link: `/messages/${threadId}`,
    });

    revalidatePath("/messages");
    revalidatePath(`/messages/${threadId}`);
    return { threadId };
  });
}

// 게시글 작성자에게 쪽지 — account_id를 노출하지 않도록 publicCode로 서버가 해석.
const sendToPostSchema = z.object({
  postPublicCode: z.string().min(1),
  body: z.string().trim().min(1, "내용을 입력하세요").max(2000),
});

export async function sendMessageToPostAuthor(input: {
  postPublicCode: string;
  body: string;
}): Promise<ActionResult<{ threadId: number }>> {
  return runAction(async () => {
    const data = parseActionInput(sendToPostSchema, input);
    // 인증은 위임하는 sendMessageToAccount가 강제한다.
    const post = await db.post.findUnique({
      where: { publicCode: data.postPublicCode },
      select: { accountId: true, deletedAt: true },
    });
    if (!post || post.deletedAt) throw new DomainError("글을 찾을 수 없습니다");
    const result = await sendMessageToAccount({
      toAccountId: post.accountId,
      body: data.body,
    });
    if (!result.ok) throw new DomainError(result.message, result.code);
    return result.data;
  });
}

// 스레드 읽음 처리 — 내 last_read_at을 현재 시각으로.
const readSchema = z.object({ threadId: z.number().int().positive() });

export async function markThreadRead(input: {
  threadId: number;
}): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(readSchema, input);
    const me = await requireAccount();
    const thread = await db.messageThread.findUnique({
      where: { id: BigInt(data.threadId) },
      select: { aAccountId: true, bAccountId: true },
    });
    if (!thread) throw new DomainError("스레드를 찾을 수 없습니다");
    if (thread.aAccountId !== me.id && thread.bAccountId !== me.id) {
      throw new DomainError("접근 권한이 없습니다");
    }
    const now = new Date();
    await db.messageThread.update({
      where: { id: BigInt(data.threadId) },
      data:
        thread.aAccountId === me.id
          ? { aLastReadAt: now }
          : { bLastReadAt: now },
    });
    revalidatePath("/messages");
  });
}
