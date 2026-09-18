import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAccount = vi.fn();
const notify = vi.fn();
const threadUpsert = vi.fn();
const threadFindUnique = vi.fn();
const threadUpdate = vi.fn();
const messageCreate = vi.fn();
const accountFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    messageThread: {
      upsert: threadUpsert,
      findUnique: threadFindUnique,
      update: threadUpdate,
    },
    message: { create: messageCreate },
    account: { findUnique: accountFindUnique },
    post: { findUnique: vi.fn() },
  },
}));
vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount }));
vi.mock("@/modules/notifications/lib/notify", () => ({ notify }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// 실제 계정 id와 같은 UUIDv7 형식(zod uuid 검증 통과) + 사전순 LOW < ME < OTHER
const ME = "01900000-0000-7000-8000-0000000000aa";
const OTHER = "01900000-0000-7000-8000-0000000000bb";
const LOW = "01900000-0000-7000-8000-000000000001"; // ME보다 사전순 앞

beforeEach(() => {
  vi.resetModules();
  getCurrentAccount.mockReset().mockResolvedValue({ id: ME, displayName: "나" });
  notify.mockReset().mockResolvedValue(undefined);
  threadUpsert.mockReset().mockResolvedValue({ id: 10n });
  threadFindUnique.mockReset().mockResolvedValue(null);
  threadUpdate.mockReset().mockResolvedValue({});
  messageCreate.mockReset().mockResolvedValue({});
  accountFindUnique.mockReset().mockResolvedValue({ id: OTHER, displayName: "상대" });
});

describe("sendMessageToAccount", () => {
  it("자기 자신에게 보내면 거부한다", async () => {
    const { sendMessageToAccount } = await import("@/modules/messages/actions");
    const res = await sendMessageToAccount({ toAccountId: ME, body: "hi" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("자기 자신");
  });

  it("상대가 없으면 거부한다", async () => {
    accountFindUnique.mockResolvedValue(null);
    const { sendMessageToAccount } = await import("@/modules/messages/actions");
    const res = await sendMessageToAccount({ toAccountId: OTHER, body: "hi" });
    expect(res.ok).toBe(false);
  });

  it("빈 내용은 거부한다", async () => {
    const { sendMessageToAccount } = await import("@/modules/messages/actions");
    const res = await sendMessageToAccount({ toAccountId: OTHER, body: "   " });
    expect(res.ok).toBe(false);
  });

  it("pair를 사전순으로 정규화하고(내가 앞) 수신자에게 알림한다", async () => {
    const { sendMessageToAccount } = await import("@/modules/messages/actions");
    const res = await sendMessageToAccount({ toAccountId: OTHER, body: "안녕" });
    expect(res.ok).toBe(true);
    // ME < OTHER 이므로 a=ME, b=OTHER, 내가 보낸 쪽이라 aLastReadAt 설정
    const where = threadUpsert.mock.calls[0][0].where.aAccountId_bAccountId;
    expect(where).toEqual({ aAccountId: ME, bAccountId: OTHER });
    expect(threadUpsert.mock.calls[0][0].create.aLastReadAt).toBeInstanceOf(Date);
    expect(threadUpsert.mock.calls[0][0].create.bLastReadAt).toBeNull();
    expect(messageCreate).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toBe(OTHER);
    expect(notify.mock.calls[0][1].link).toBe("/messages/10");
  });

  it("상대 id가 사전순으로 앞서면 a=상대, b=나로 정규화한다", async () => {
    getCurrentAccount.mockResolvedValue({ id: ME, displayName: "나" });
    accountFindUnique.mockResolvedValue({ id: LOW, displayName: "상대" });
    const { sendMessageToAccount } = await import("@/modules/messages/actions");
    await sendMessageToAccount({ toAccountId: LOW, body: "안녕" });
    const where = threadUpsert.mock.calls[0][0].where.aAccountId_bAccountId;
    expect(where).toEqual({ aAccountId: LOW, bAccountId: ME });
    // 내가 b쪽이므로 bLastReadAt 설정, aLastReadAt은 null
    expect(threadUpsert.mock.calls[0][0].create.bLastReadAt).toBeInstanceOf(Date);
    expect(threadUpsert.mock.calls[0][0].create.aLastReadAt).toBeNull();
  });

  it("비로그인은 거부한다", async () => {
    getCurrentAccount.mockResolvedValue(null);
    const { sendMessageToAccount } = await import("@/modules/messages/actions");
    const res = await sendMessageToAccount({ toAccountId: OTHER, body: "hi" });
    expect(res.ok).toBe(false);
  });
});

describe("markThreadRead", () => {
  it("참여자가 아니면 거부한다", async () => {
    threadFindUnique.mockResolvedValue({
      aAccountId: OTHER,
      bAccountId: "someone",
    });
    const { markThreadRead } = await import("@/modules/messages/actions");
    const res = await markThreadRead({ threadId: 1 });
    expect(res.ok).toBe(false);
    expect(threadUpdate).not.toHaveBeenCalled();
  });

  it("내가 a면 aLastReadAt을 갱신한다", async () => {
    threadFindUnique.mockResolvedValue({ aAccountId: ME, bAccountId: OTHER });
    const { markThreadRead } = await import("@/modules/messages/actions");
    const res = await markThreadRead({ threadId: 1 });
    expect(res.ok).toBe(true);
    expect(threadUpdate.mock.calls[0][0].data.aLastReadAt).toBeInstanceOf(Date);
  });

  it("내가 b면 bLastReadAt을 갱신한다", async () => {
    threadFindUnique.mockResolvedValue({ aAccountId: OTHER, bAccountId: ME });
    const { markThreadRead } = await import("@/modules/messages/actions");
    await markThreadRead({ threadId: 1 });
    expect(threadUpdate.mock.calls[0][0].data.bLastReadAt).toBeInstanceOf(Date);
  });
});
