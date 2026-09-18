// 실 DB 검증 — 단위 테스트는 db를 mock하므로 "edited_at 컬럼이 실제로 있고 Prisma가 쓰는가",
// "무변경 저장이 정말 DB를 건드리지 않는가"는 여기서만 확인된다.
//
// 실행: npm run services:up 후 npm run test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrivilegedDb, privilegedDb } from "./_privileged-db";

const enabled = process.env.RUN_INTEGRATION === "1";

// FK를 쓰지 않는 스키마라 임의 UUID로 픽스처를 만들 수 있다(저장소 규칙).
const ACCOUNT = "0198cccc-0000-4000-8000-00000000ed17";
const PUBLIC_CODE = "edt-test";

async function fixtures() {
  const { db } = await import("@/lib/db");
  return db;
}

// 픽스처 정리는 hard delete가 필요한데 app 롤에는 그 권한이 없다 → 특권 연결로만 수행.
async function cleanup(): Promise<void> {
  const admin = privilegedDb();
  await admin.postComment.deleteMany({ where: { accountId: ACCOUNT } });
  await admin.post.deleteMany({ where: { accountId: ACCOUNT } });
  await admin.account.deleteMany({ where: { id: ACCOUNT } });
}

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  const db = await fixtures();
  await db.account.create({
    data: { id: ACCOUNT, displayName: "수정테스터", publicCode: "EDITTST1" },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await disconnectPrivilegedDb();
  const db = await fixtures();
  await db.$disconnect();
});

async function seedComment(body: string) {
  const db = await fixtures();
  const post = await db.post.upsert({
    where: { publicCode: PUBLIC_CODE },
    update: {},
    create: {
      accountId: ACCOUNT,
      publicCode: PUBLIC_CODE,
      topic: "talk",
      title: "제목",
      body: "본문",
    },
  });
  return db.postComment.create({
    data: {
      postId: post.id,
      accountId: ACCOUNT,
      body,
    },
  });
}

describe.skipIf(!enabled)("댓글 edited_at — 실 DB", () => {
  it("새 댓글의 edited_at은 NULL이다", async () => {
    const created = await seedComment("최초 내용");
    expect(created.editedAt).toBeNull();
  });

  it("본문을 바꾸면 edited_at이 기록되고 updated_at과 같은 시각이다", async () => {
    const { updateComment } = await import("@/modules/posts/lib/mutations");
    const db = await fixtures();
    const created = await seedComment("바꾸기 전");

    await updateComment(ACCOUNT, { id: Number(created.id), body: "바꾼 뒤" });

    const row = await db.postComment.findUnique({ where: { id: created.id } });
    expect(row!.body).toBe("바꾼 뒤");
    expect(row!.editedAt).not.toBeNull();
    // updated_at은 숨김·해제로도 바뀌므로 표시용 시각은 edited_at으로 분리한다.
    expect(row!.editedAt!.getTime()).toBe(row!.updatedAt.getTime());
  });

  it("같은 본문으로 저장하면 edited_at이 NULL로 남는다 — 저장만 눌러도 '수정됨'이 붙으면 안 된다", async () => {
    const { updateComment } = await import("@/modules/posts/lib/mutations");
    const db = await fixtures();
    const created = await seedComment("그대로");
    const before = await db.postComment.findUnique({ where: { id: created.id } });

    await updateComment(ACCOUNT, { id: Number(created.id), body: "그대로" });

    const after = await db.postComment.findUnique({ where: { id: created.id } });
    expect(after!.editedAt).toBeNull();
    // updated_at도 건드리지 않는다(UPDATE 자체를 실행하지 않으므로).
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });

  it("숨김 처리는 edited_at을 건드리지 않는다 — '수정됨' 오표시 방지", async () => {
    const db = await fixtures();
    const created = await seedComment("숨김 대상");

    await db.postComment.update({
      where: { id: created.id },
      data: { hiddenAt: new Date(), hiddenReason: "테스트", hiddenBy: ACCOUNT },
    });

    const row = await db.postComment.findUnique({ where: { id: created.id } });
    expect(row!.hiddenAt).not.toBeNull();
    expect(row!.editedAt).toBeNull(); // 관리자 조치로는 '수정됨'이 붙지 않는다
  });
});
