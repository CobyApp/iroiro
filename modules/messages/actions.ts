"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/lib/db";
import { getCurrentAccount } from "@/modules/auth/dal";
import { notify } from "@/modules/notifications/lib/notify";
import {
  copyUgcObject,
  deleteUgcObject,
  headUgcObject,
  presignUgcPut,
} from "@/lib/r2/ugc";
import { canonicalPair } from "./types";

async function requireAccount() {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account;
}

// ── 쪽지 이미지 첨부 ────────────────────────────────────────────────
const MSG_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MSG_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const EXT_BY_TYPE: Record<(typeof MSG_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
// 최종 키만 서명 GET 대상 — tmp 키는 클라 업로드용(presign PUT)이라 별도 prefix 로 격리.
const MSG_TMP_KEY_RE = /^messages\/tmp\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

const presignImageSchema = z.object({
  contentType: z.enum(MSG_IMAGE_TYPES),
  sizeBytes: z.number().int().positive().max(MSG_IMAGE_MAX_BYTES),
});

// 쪽지 이미지 업로드 presign — 비공개 UGC 버킷 tmp 키에 PUT URL 발급.
export async function presignMessageImage(input: {
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ r2Key: string; uploadUrl: string }>> {
  return runAction(async () => {
    await requireAccount();
    const data = parseActionInput(presignImageSchema, input);
    const key = `messages/tmp/${uuidv7()}.${EXT_BY_TYPE[data.contentType]}`;
    const uploadUrl = await presignUgcPut(key, data.contentType, data.sizeBytes);
    return { r2Key: key, uploadUrl };
  });
}

// 업로드된 tmp 이미지를 검증하고 최종 키로 복사한다 — 최종 키만 저장·서빙된다.
// 클라가 보낸 임의 키 서빙 방지(tmp 패턴·HEAD 실측 검증 후 복사).
async function finalizeMessageImage(tmpKey: string): Promise<string> {
  if (!MSG_TMP_KEY_RE.test(tmpKey)) {
    throw new DomainError("잘못된 이미지입니다");
  }
  const head = await headUgcObject(tmpKey);
  if (!head) throw new DomainError("이미지 업로드를 다시 진행해주세요");
  const type = head.contentType ?? "";
  if (!(MSG_IMAGE_TYPES as readonly string[]).includes(type)) {
    throw new DomainError("지원하지 않는 이미지 형식입니다");
  }
  if (head.contentLength !== null && head.contentLength > MSG_IMAGE_MAX_BYTES) {
    throw new DomainError("이미지는 5MB 이하여야 합니다");
  }
  const finalKey = tmpKey.replace("messages/tmp/", "messages/");
  await copyUgcObject(tmpKey, finalKey, head.etag, type);
  void deleteUgcObject(tmpKey); // best-effort 정리
  return finalKey;
}

// 상대 계정에게 쪽지 발송 — 스레드 없으면 생성. 스레드 id 반환.
const sendSchema = z
  .object({
    toAccountId: z.string().uuid(),
    body: z.string().trim().max(2000).default(""),
    imageKey: z.string().max(200).nullable().optional(),
  })
  .refine((v) => v.body.length > 0 || !!v.imageKey, {
    message: "내용을 입력하세요",
    path: ["body"],
  });

export async function sendMessageToAccount(input: {
  toAccountId: string;
  body?: string;
  imageKey?: string | null;
}): Promise<ActionResult<{ threadId: number }>> {
  return runAction(async () => {
    const data = parseActionInput(sendSchema, input);
    const me = await requireAccount();
    // 이미지가 있으면 검증·최종 복사 후 최종 키를 저장한다.
    const imageR2Key = data.imageKey
      ? await finalizeMessageImage(data.imageKey)
      : null;
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
        body: data.body.length > 0 ? data.body : null,
        imageR2Key,
      },
    });

    const threadId = Number(thread.id);
    const preview = data.body.length > 0
      ? data.body.length > 40
        ? `${data.body.slice(0, 40)}…`
        : data.body
      : "사진을 보냈어요";
    await notify(data.toAccountId, {
      type: "message",
      title: `${me.displayName}님의 쪽지`,
      body: preview,
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
