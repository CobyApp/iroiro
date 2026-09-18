import { beforeEach, describe, expect, it, vi } from "vitest";

const threadFindMany = vi.fn();
const threadFindUnique = vi.fn();
const messageFindFirst = vi.fn();
const messageFindMany = vi.fn();
const messageCount = vi.fn();
const accountFindMany = vi.fn();
const accountFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    messageThread: { findMany: threadFindMany, findUnique: threadFindUnique },
    message: {
      findFirst: messageFindFirst,
      findMany: messageFindMany,
      count: messageCount,
    },
    account: { findMany: accountFindMany, findUnique: accountFindUnique },
  },
}));

const ME = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000bb";

beforeEach(() => {
  vi.resetModules();
  threadFindMany.mockReset().mockResolvedValue([]);
  threadFindUnique.mockReset().mockResolvedValue(null);
  messageFindFirst.mockReset().mockResolvedValue(null);
  messageFindMany.mockReset().mockResolvedValue([]);
  messageCount.mockReset().mockResolvedValue(0);
  accountFindMany.mockReset().mockResolvedValue([]);
  accountFindUnique.mockReset().mockResolvedValue(null);
});

describe("listThreads", () => {
  it("내가 b쪽일 때 상대는 a, 미읽음은 상대 발신 & 내 last_read 이후로 집계한다", async () => {
    // 나(ME)는 b_account_id, 상대(OTHER)는 a_account_id
    threadFindMany.mockResolvedValue([
      {
        id: 5n,
        aAccountId: OTHER,
        bAccountId: ME,
        aLastReadAt: null,
        bLastReadAt: new Date("2026-01-01T00:00:00Z"),
        lastMessageAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    accountFindMany.mockResolvedValue([{ id: OTHER, displayName: "상대" }]);
    messageFindFirst.mockResolvedValue({ body: "안녕하세요" });
    messageCount.mockResolvedValue(3);

    const { listThreads } = await import("@/modules/messages/lib/queries");
    const rows = await listThreads(ME);

    expect(rows).toHaveLength(1);
    expect(rows[0].otherAccountId).toBe(OTHER);
    expect(rows[0].otherName).toBe("상대");
    expect(rows[0].lastBody).toBe("안녕하세요");
    expect(rows[0].unread).toBe(3);
    // 미읽음 카운트는 "상대가 보낸 것" + "내 last_read 이후"만
    const countArg = messageCount.mock.calls[0][0].where;
    expect(countArg.senderAccountId).toBe(OTHER);
    expect(countArg.createdAt).toEqual({ gt: new Date("2026-01-01T00:00:00Z") });
  });

  it("내 last_read가 없으면 상대 발신 전체를 미읽음으로 센다", async () => {
    threadFindMany.mockResolvedValue([
      {
        id: 7n,
        aAccountId: ME,
        bAccountId: OTHER,
        aLastReadAt: null,
        bLastReadAt: null,
        lastMessageAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    const { listThreads } = await import("@/modules/messages/lib/queries");
    await listThreads(ME);
    const countArg = messageCount.mock.calls[0][0].where;
    expect(countArg.senderAccountId).toBe(OTHER);
    expect(countArg.createdAt).toBeUndefined();
  });

  it("스레드가 없으면 빈 배열", async () => {
    const { listThreads } = await import("@/modules/messages/lib/queries");
    expect(await listThreads(ME)).toEqual([]);
  });
});

describe("getThreadForViewer", () => {
  it("참여자가 아니면 null을 반환한다(접근 차단)", async () => {
    threadFindUnique.mockResolvedValue({
      id: 1n,
      aAccountId: OTHER,
      bAccountId: "someone-else",
      aLastReadAt: null,
      bLastReadAt: null,
    });
    const { getThreadForViewer } = await import(
      "@/modules/messages/lib/queries"
    );
    expect(await getThreadForViewer(1, ME)).toBeNull();
    // 접근 거부 시 메시지 조회조차 하지 않는다
    expect(messageFindMany).not.toHaveBeenCalled();
  });

  it("참여자면 mine 플래그를 발신자 기준으로 채운다", async () => {
    threadFindUnique.mockResolvedValue({
      id: 1n,
      aAccountId: ME,
      bAccountId: OTHER,
      aLastReadAt: null,
      bLastReadAt: null,
    });
    accountFindUnique.mockResolvedValue({ displayName: "상대" });
    messageFindMany.mockResolvedValue([
      { id: 1n, senderAccountId: ME, body: "hi", createdAt: new Date() },
      { id: 2n, senderAccountId: OTHER, body: "yo", createdAt: new Date() },
    ]);
    const { getThreadForViewer } = await import(
      "@/modules/messages/lib/queries"
    );
    const view = await getThreadForViewer(1, ME);
    expect(view?.otherAccountId).toBe(OTHER);
    expect(view?.messages[0].mine).toBe(true);
    expect(view?.messages[1].mine).toBe(false);
  });

  it("스레드가 없으면 null", async () => {
    const { getThreadForViewer } = await import(
      "@/modules/messages/lib/queries"
    );
    expect(await getThreadForViewer(999, ME)).toBeNull();
  });
});

describe("countUnreadMessages", () => {
  it("모든 스레드의 미읽음 합을 반환한다", async () => {
    threadFindMany.mockResolvedValue([
      { id: 1n, aAccountId: ME, bAccountId: OTHER, aLastReadAt: null, bLastReadAt: null },
      { id: 2n, aAccountId: OTHER, bAccountId: ME, aLastReadAt: null, bLastReadAt: null },
    ]);
    messageCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const { countUnreadMessages } = await import(
      "@/modules/messages/lib/queries"
    );
    expect(await countUnreadMessages(ME)).toBe(3);
  });

  it("스레드가 없으면 0", async () => {
    const { countUnreadMessages } = await import(
      "@/modules/messages/lib/queries"
    );
    expect(await countUnreadMessages(ME)).toBe(0);
  });
});
