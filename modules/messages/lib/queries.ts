import "server-only";

import { db } from "@/lib/db";
import type {
  MessageThreadSummary,
  MessageThreadView,
} from "../types";

// 스레드에서 나/상대 구분 및 내 last_read_at을 계산한다.
function sideOf(
  thread: {
    aAccountId: string;
    bAccountId: string;
    aLastReadAt: Date | null;
    bLastReadAt: Date | null;
  },
  me: string,
): { otherAccountId: string; myLastReadAt: Date | null } {
  const isA = thread.aAccountId === me;
  return {
    otherAccountId: isA ? thread.bAccountId : thread.aAccountId,
    myLastReadAt: isA ? thread.aLastReadAt : thread.bLastReadAt,
  };
}

// 내 수신함 — 참여 스레드 목록(최근 메시지순) + 상대 이름 + 미읽음 수.
export async function listThreads(
  me: string,
): Promise<MessageThreadSummary[]> {
  const threads = await db.messageThread.findMany({
    where: { OR: [{ aAccountId: me }, { bAccountId: me }] },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  if (threads.length === 0) return [];

  const otherIds = new Set<string>();
  for (const t of threads) {
    otherIds.add(sideOf(t, me).otherAccountId);
  }
  const [accounts, lastMessages, unreadCounts] = await Promise.all([
    db.account.findMany({
      where: { id: { in: [...otherIds] } },
      select: { id: true, displayName: true },
    }),
    // 각 스레드의 최신 메시지 본문(미리보기).
    Promise.all(
      threads.map((t) =>
        db.message.findFirst({
          where: { threadId: t.id },
          orderBy: { createdAt: "desc" },
          select: { body: true },
        }),
      ),
    ),
    // 각 스레드의 미읽음 수 — 상대가 보낸 & 내 last_read 이후.
    Promise.all(
      threads.map((t) => {
        const { otherAccountId, myLastReadAt } = sideOf(t, me);
        return db.message.count({
          where: {
            threadId: t.id,
            senderAccountId: otherAccountId,
            ...(myLastReadAt ? { createdAt: { gt: myLastReadAt } } : {}),
          },
        });
      }),
    ),
  ]);
  const nameBy = new Map(accounts.map((a) => [a.id, a.displayName]));

  return threads.map((t, i) => {
    const { otherAccountId } = sideOf(t, me);
    return {
      id: Number(t.id),
      otherAccountId,
      otherName: nameBy.get(otherAccountId) ?? "탈퇴한 회원",
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastBody: lastMessages[i]?.body ?? null,
      unread: unreadCounts[i],
    };
  });
}

// 내 총 미읽음 쪽지 수 — 헤더 뱃지용.
export async function countUnreadMessages(me: string): Promise<number> {
  const threads = await db.messageThread.findMany({
    where: { OR: [{ aAccountId: me }, { bAccountId: me }] },
    select: {
      id: true,
      aAccountId: true,
      bAccountId: true,
      aLastReadAt: true,
      bLastReadAt: true,
    },
  });
  if (threads.length === 0) return 0;
  const counts = await Promise.all(
    threads.map((t) => {
      const { otherAccountId, myLastReadAt } = sideOf(t, me);
      return db.message.count({
        where: {
          threadId: t.id,
          senderAccountId: otherAccountId,
          ...(myLastReadAt ? { createdAt: { gt: myLastReadAt } } : {}),
        },
      });
    }),
  );
  return counts.reduce((a, b) => a + b, 0);
}

// 스레드 상세 — 참여자만 접근. 메시지 시간순.
export async function getThreadForViewer(
  threadId: number,
  me: string,
): Promise<MessageThreadView | null> {
  const thread = await db.messageThread.findUnique({
    where: { id: BigInt(threadId) },
  });
  if (!thread) return null;
  if (thread.aAccountId !== me && thread.bAccountId !== me) return null;

  const { otherAccountId } = sideOf(thread, me);
  const [other, messages] = await Promise.all([
    db.account.findUnique({
      where: { id: otherAccountId },
      select: { displayName: true },
    }),
    db.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  ]);

  return {
    id: Number(thread.id),
    otherAccountId,
    otherName: other?.displayName ?? "탈퇴한 회원",
    messages: messages.map((m) => ({
      id: Number(m.id),
      senderAccountId: m.senderAccountId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderAccountId === me,
    })),
  };
}

// 상대와의 기존 스레드 id 조회(없으면 null) — 진입 버튼에서 링크 판단용.
export async function findThreadWith(
  me: string,
  other: string,
): Promise<number | null> {
  const { a, b } =
    me < other ? { a: me, b: other } : { a: other, b: me };
  const thread = await db.messageThread.findUnique({
    where: { aAccountId_bAccountId: { aAccountId: a, bAccountId: b } },
    select: { id: true },
  });
  return thread ? Number(thread.id) : null;
}
