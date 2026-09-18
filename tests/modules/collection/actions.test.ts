import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/action-result";

vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/modules/collection/lib/mutations", () => ({
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  registerItem: vi.fn(),
  unregisterItem: vi.fn(),
  reorderItems: vi.fn(),
  setCollectionPublic: vi.fn(),
  setCollectionTitle: vi.fn(),
}));

import { getCurrentAccount } from "@/modules/auth/dal";
import * as mutations from "@/modules/collection/lib/mutations";
import {
  createCollection,
  deleteCollection,
  registerItem,
  reorderItems,
  setCollectionPublic,
  setCollectionTitle,
  unregisterItem,
} from "@/modules/collection/actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAccount).mockResolvedValue({ id: "acc" } as never);
});

describe("collection actions — 인증·검증·wiring", () => {
  it("미로그인이면 거절하고 mutation을 호출하지 않는다", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(null as never);
    const result = await createCollection({ title: "가을" });
    expect(result).toMatchObject({ ok: false, message: "로그인이 필요합니다" });
    expect(mutations.createCollection).not.toHaveBeenCalled();
  });

  it("입력 검증 실패(제목 20자 초과)면 mutation을 호출하지 않는다", async () => {
    const result = await createCollection({ title: "가".repeat(21) });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(mutations.createCollection).not.toHaveBeenCalled();
  });

  it("createCollection — 생성 후 관리·공개 경로 revalidate, publicCode 반환", async () => {
    vi.mocked(mutations.createCollection).mockResolvedValue({
      id: 1,
      publicCode: "CODE",
    });
    const result = await createCollection({ title: "  가을  " });
    expect(mutations.createCollection).toHaveBeenCalledWith("acc", "가을"); // trim 반영
    expect(result).toEqual({ ok: true, data: { publicCode: "CODE" } });
    expect(revalidatePath).toHaveBeenCalledWith("/collections");
    expect(revalidatePath).toHaveBeenCalledWith("/collections/CODE");
  });

  it("deleteCollection — 관리 경로만 revalidate", async () => {
    await deleteCollection({ collectionId: 1 });
    expect(mutations.deleteCollection).toHaveBeenCalledWith("acc", 1);
    expect(revalidatePath).toHaveBeenCalledWith("/collections");
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("등록/해제/재배치/공개/이름 — 계정 스코프로 위임하고 양 경로 revalidate", async () => {
    const pub = { publicCode: "CODE" };
    vi.mocked(mutations.registerItem).mockResolvedValue(pub);
    vi.mocked(mutations.unregisterItem).mockResolvedValue(pub);
    vi.mocked(mutations.reorderItems).mockResolvedValue(pub);
    vi.mocked(mutations.setCollectionPublic).mockResolvedValue(pub);
    vi.mocked(mutations.setCollectionTitle).mockResolvedValue(pub);

    await registerItem({ collectionId: 1, productId: 5 });
    expect(mutations.registerItem).toHaveBeenCalledWith("acc", 1, 5);

    await unregisterItem({ collectionId: 1, productId: 5 });
    expect(mutations.unregisterItem).toHaveBeenCalledWith("acc", 1, 5);

    await reorderItems({ collectionId: 1, orderedProductIds: [7, 5] });
    expect(mutations.reorderItems).toHaveBeenCalledWith("acc", 1, [7, 5]);

    await setCollectionPublic({ collectionId: 1, isPublic: true });
    expect(mutations.setCollectionPublic).toHaveBeenCalledWith("acc", 1, true);

    await setCollectionTitle({ collectionId: 1, title: "최애" });
    expect(mutations.setCollectionTitle).toHaveBeenCalledWith("acc", 1, "최애");

    expect(vi.mocked(revalidatePath).mock.calls.filter(([p]) => p === "/collections/CODE"))
      .toHaveLength(5);
  });

  it("도메인 오류 — 존재하지 않는 컬렉션 삭제는 throw가 아니라 ok:false 결과로 반환(프로덕션 메시지 보존)", async () => {
    vi.mocked(mutations.deleteCollection).mockRejectedValue(
      new DomainError("컬렉션을 찾을 수 없습니다"),
    );
    const result = await deleteCollection({ collectionId: 1 });
    expect(result).toEqual({
      ok: false,
      message: "컬렉션을 찾을 수 없습니다",
      code: undefined,
    });
  });
});
