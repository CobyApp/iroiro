import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// requireAdmin은 세션 DAL 기반 — 액션 경계(허용/거부)만 검증하도록 스텁한다.
// 가드 자체의 세션·isAdmin 판정은 requireAdmin 단위 테스트에서 검증한다.
const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({
  requireAdmin: mockRequireAdmin,
}));

const create = vi.fn();
const update = vi.fn();
const deleteFn = vi.fn();
const findUnique = vi.fn();
const teamMemberCount = vi.fn();
const productCount = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    team: { create, update, delete: deleteFn, findUnique },
    teamMember: { count: teamMemberCount },
    product: { count: productCount },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function rowFrom(data: Record<string, unknown>) {
  return {
    id: 1n,
    name: data.name ?? "그룹",
    nameI18n: data.nameI18n ?? null,
    debutDate: data.debutDate ?? null,
    disbandDate: data.disbandDate ?? null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

beforeEach(() => {
  vi.resetModules();
  mockRequireAdmin
    .mockReset()
    .mockResolvedValue({ id: "admin-1", isAdmin: true });
  create.mockReset().mockImplementation(async ({ data }) => rowFrom(data));
  update.mockReset().mockImplementation(async ({ data }) => rowFrom(data));
  deleteFn.mockReset().mockResolvedValue(rowFrom({}));
  findUnique.mockReset().mockResolvedValue(rowFrom({}));
  teamMemberCount.mockReset().mockResolvedValue(0);
  productCount.mockReset().mockResolvedValue(0);
});

describe("teams actions", () => {
  it("관리자가 아니면 mutation 전에 거부한다(권한)", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { createTeam } = await import("@/modules/teams/actions");

    await expect(createTeam({ name: "x" })).rejects.toThrow(/관리자/);
    expect(create).not.toHaveBeenCalled();
  });

  describe("createTeam", () => {
    it("필수 필드만으로 생성 — 옵션은 null로 정규화", async () => {
      const { createTeam } = await import("@/modules/teams/actions");
      const result = await createTeam({ name: "테스트그룹" });

      const data = create.mock.calls[0][0].data;
      expect(data.name).toBe("테스트그룹");
      expect(data.debutDate).toBeNull();
      expect(data.disbandDate).toBeNull();
      if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
      expect(result.data.name).toBe("테스트그룹");
      expect(result.data.nameI18n).toBeNull();
      expect(result.data.debutDate).toBeNull();
    });

    it("nameI18n과 데뷔일을 받아 그대로 저장한다", async () => {
      const { createTeam } = await import("@/modules/teams/actions");
      const result = await createTeam({
        name: "한글",
        nameI18n: {
          "ja-jpan": "ジャパン",
          "ja-hira": "じゃぱん",
          en: "Japan",
        },
        debutDate: "2020-01-01",
        disbandDate: null,
      });

      if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
      expect(result.data.nameI18n).toEqual({
        "ja-jpan": "ジャパン",
        "ja-hira": "じゃぱん",
        en: "Japan",
      });
      expect(result.data.debutDate).toBe("2020-01-01");
      expect(result.data.disbandDate).toBeNull();
    });

    it("name 빈 문자열은 입력 검증 실패 → ok:false", async () => {
      const { createTeam } = await import("@/modules/teams/actions");
      const result = await createTeam({ name: "" });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(create).not.toHaveBeenCalled();
    });

    it("name 누락은 입력 검증 실패 → ok:false", async () => {
      const { createTeam } = await import("@/modules/teams/actions");
      const result = await createTeam({} as Parameters<typeof createTeam>[0]);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    });

    it("nameI18n에 모르는 키가 있으면 입력 검증 실패 → ok:false", async () => {
      const { createTeam } = await import("@/modules/teams/actions");
      const result = await createTeam({
        name: "x",
        nameI18n: { "zh-hans": "中" } as unknown as Record<string, string>,
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    });
  });

  describe("updateTeam", () => {
    it("전달한 필드만 patch에 포함된다", async () => {
      const { updateTeam } = await import("@/modules/teams/actions");
      await updateTeam({ id: 1, name: "변경됨" });

      const patch = update.mock.calls[0][0].data;
      expect(patch.name).toBe("변경됨");
      expect(patch).not.toHaveProperty("nameI18n");
      expect(patch).not.toHaveProperty("debutDate");
      expect(update.mock.calls[0][0].where).toEqual({ id: 1n });
    });

    it("nameI18n과 날짜를 명시적으로 null로 비울 수 있다", async () => {
      const { updateTeam } = await import("@/modules/teams/actions");
      await updateTeam({
        id: 1,
        nameI18n: null,
        debutDate: null,
        disbandDate: null,
      });

      const patch = update.mock.calls[0][0].data;
      expect(patch.nameI18n).toBe(Prisma.DbNull);
      expect(patch.debutDate).toBeNull();
      expect(patch.disbandDate).toBeNull();
    });

    it("존재하지 않는 id(P2025)면 not-found를 ok:false로 반환한다", async () => {
      update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Record to update not found", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
      const { updateTeam } = await import("@/modules/teams/actions");
      const result = await updateTeam({ id: 9999, name: "x" });
      expect(result).toMatchObject({
        ok: false,
        message: "그룹을 찾을 수 없습니다",
      });
    });

    it("id 누락은 입력 검증 실패 → ok:false", async () => {
      const { updateTeam } = await import("@/modules/teams/actions");
      const result = await updateTeam({
        name: "x",
      } as Parameters<typeof updateTeam>[0]);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("deleteTeam", () => {
    it("참조가 없는 그룹은 삭제된다", async () => {
      const { deleteTeam } = await import("@/modules/teams/actions");
      await deleteTeam(1);

      expect(deleteFn).toHaveBeenCalledWith({ where: { id: 1n } });
    });

    it("도메인 오류 — 멤버 활동 이력이 참조하면 throw가 아니라 ok:false 결과로 반환한다", async () => {
      teamMemberCount.mockResolvedValue(2);
      const { deleteTeam } = await import("@/modules/teams/actions");

      const result = await deleteTeam(1);
      expect(result).toEqual({
        ok: false,
        message: "이 그룹을 참조하는 멤버 2건이 있어 삭제할 수 없습니다",
        code: undefined,
      });
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it("도메인 오류 — 상품이 참조하면 throw가 아니라 ok:false 결과로 반환한다", async () => {
      productCount.mockResolvedValue(1);
      const { deleteTeam } = await import("@/modules/teams/actions");

      const result = await deleteTeam(1);
      expect(result).toEqual({
        ok: false,
        message: "이 그룹을 참조하는 상품 1건이 있어 삭제할 수 없습니다",
        code: undefined,
      });
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it("도메인 오류 — 존재하지 않는 id면 throw가 아니라 ok:false 결과로 반환한다", async () => {
      findUnique.mockResolvedValue(null);
      const { deleteTeam } = await import("@/modules/teams/actions");
      const result = await deleteTeam(9999);
      expect(result).toEqual({
        ok: false,
        message: "그룹을 찾을 수 없습니다",
        code: undefined,
      });
    });

    it("도메인 오류 — 0 또는 음수 id는 throw가 아니라 ok:false 결과로 반환한다", async () => {
      const { deleteTeam } = await import("@/modules/teams/actions");
      const zero = await deleteTeam(0);
      const negative = await deleteTeam(-1);
      expect(zero).toEqual({
        ok: false,
        message: "유효하지 않은 그룹 ID 입니다",
        code: undefined,
      });
      expect(negative).toEqual({
        ok: false,
        message: "유효하지 않은 그룹 ID 입니다",
        code: undefined,
      });
    });

    it("도메인 오류 — 사전 조회 후 delete가 P2025(TOCTOU)면 ok:false로 반환한다", async () => {
      deleteFn.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Record to delete does not exist", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
      const { deleteTeam } = await import("@/modules/teams/actions");
      const result = await deleteTeam(1);
      expect(result).toMatchObject({ ok: false, message: "그룹을 찾을 수 없습니다" });
    });
  });
});
