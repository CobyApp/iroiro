import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/lib/generated/catalog-client";

// requireAdmin이 자체 세션(DAL) 기반 실검증이므로 admin 세션을 스텁한다.
const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

const memberCreate = vi.fn();
const memberUpdate = vi.fn();
const memberDelete = vi.fn();
const memberFindUnique = vi.fn();
const tmCreateMany = vi.fn();
const tmFindMany = vi.fn();
const tmDeleteMany = vi.fn();
const productCount = vi.fn();
const tmAggregate = vi.fn();

// 멤버·멤버십은 카탈로그 DB(catalogDb), 상품 참조 검사는 커머스 DB(db).
// CatalogPrisma(DbNull 등)는 실제 생성 클라이언트의 것을 그대로 노출 — 액션이 DbNull 동일성으로 비운다.
vi.mock("@/lib/catalog-db", async () => {
  const { Prisma } = await import("@/lib/generated/catalog-client");
  return {
    CatalogPrisma: Prisma,
    catalogDb: {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          member: {
            create: memberCreate,
            update: memberUpdate,
            delete: memberDelete,
          },
          teamMember: {
            createMany: tmCreateMany,
            findMany: tmFindMany,
            deleteMany: tmDeleteMany,
          },
        }),
      member: { findUnique: memberFindUnique },
      teamMember: { aggregate: tmAggregate },
    },
  };
});
vi.mock("@/lib/db", () => ({
  db: {
    product: { count: productCount },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function memberRow(data: Record<string, unknown> = {}) {
  return {
    id: 1n,
    name: "멤버",
    nameI18n: null,
    debutDate: null,
    retireDate: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...data,
  };
}

function tmRow(data: Record<string, unknown> = {}) {
  return {
    id: 10n,
    teamId: 1n,
    memberId: 1n,
    activeStartDate: new Date("2020-01-01T00:00:00Z"),
    activeEndDate: null,
    role: null,
    displayOrder: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...data,
  };
}

beforeEach(() => {
  vi.resetModules();
  mockGetCurrentAccount
    .mockReset()
    .mockResolvedValue({ id: "admin-1", isAdmin: true });
  memberCreate
    .mockReset()
    .mockImplementation(async ({ data }) => memberRow(data));
  memberUpdate
    .mockReset()
    .mockImplementation(async ({ data }) => memberRow(data));
  memberDelete.mockReset().mockResolvedValue(memberRow());
  memberFindUnique.mockReset().mockResolvedValue(memberRow());
  tmCreateMany.mockReset().mockResolvedValue({ count: 1 });
  tmFindMany.mockReset().mockResolvedValue([tmRow()]);
  tmDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  productCount.mockReset().mockResolvedValue(0);
  tmAggregate.mockReset().mockResolvedValue({ _max: { displayOrder: null } });
});

describe("members actions", () => {
  describe("createMember", () => {
    it("활동 1건으로 생성 — teamIds·집계 필드가 구성된다", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "테스트멤버",
        memberships: [{ teamId: 1, activeStartDate: "2026-05-15" }],
      });

      const createData = memberCreate.mock.calls[0][0].data;
      expect(createData.name).toBe("테스트멤버");
      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({ name: "테스트멤버", teamIds: [1] }),
      });
    });

    it("활동 여러 건 — role·displayOrder가 그룹별로 집계된다", async () => {
      tmFindMany.mockResolvedValue([
        tmRow({ id: 10n, teamId: 1n, role: "리더" }),
        tmRow({ id: 11n, teamId: 2n, displayOrder: 3 }),
      ]);
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "다그룹멤버",
        memberships: [
          { teamId: 1, activeStartDate: "2020-01-01", role: "리더" },
          { teamId: 2, activeStartDate: "2022-01-01", displayOrder: 3 },
        ],
      });

      if (!result.ok) throw new Error(result.message);
      expect(result.data.teamIds.sort()).toEqual([1, 2]);
      expect(result.data.roleByTeam[1]).toBe("리더");
      expect(result.data.displayOrderByTeam[2]).toBe(3);
    });

    it("활동 N건이 BigInt 변환되어 createMany로 저장된다", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "스토어추가확인",
        memberships: [
          { teamId: 1, activeStartDate: "2020-01-01" },
          { teamId: 2, activeStartDate: "2022-01-01" },
        ],
      });

      expect(result.ok).toBe(true);
      const rows = tmCreateMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(2);
      expect(rows.map((r: { teamId: bigint }) => r.teamId)).toEqual([1n, 2n]);
    });

    it("memberships 빈 배열은 입력 검증 실패 → ok:false", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({ name: "x", memberships: [] });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(memberCreate).not.toHaveBeenCalled();
    });

    it("name 빈 문자열은 입력 검증 실패 → ok:false", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "",
        memberships: [{ teamId: 1, activeStartDate: "2026-05-15" }],
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    });

    it("displayOrder는 정수만 허용 (소수점 거부) → ok:false", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "x",
        memberships: [
          { teamId: 1, activeStartDate: "2026-05-15", displayOrder: 1.5 },
        ],
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    });

    // 관리자가 직접 입력하는 정렬 순서라 1부터다(data-modeling.md §타입 선택).
    // 기계가 배열 index로 채우는 사진 테이블들은 반대로 0부터이므로,
    // "일관성" 명목으로 이 컬럼을 0 허용으로 되돌리지 말 것.
    it("displayOrder 0은 거부한다 — 사람 입력은 1부터 → ok:false", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "x",
        memberships: [
          { teamId: 1, activeStartDate: "2026-05-15", displayOrder: 0 },
        ],
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    });

    it("activeStartDate 잘못된 형식은 입력 검증 실패 → ok:false", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "x",
        memberships: [{ teamId: 1, activeStartDate: "2026/05/15" }],
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    });

    it("같은 teamId 가 active(종료일 없음) 로 두 번이면 거부 — ok:false 반환(프로덕션 메시지 보존)", async () => {
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "x",
        memberships: [
          { teamId: 1, activeStartDate: "2020-01-01" },
          { teamId: 1, activeStartDate: "2022-01-01" },
        ],
      });
      expect(result).toEqual({
        ok: false,
        message:
          "같은 그룹에 현재 활동 중(종료일 없음) 활동은 멤버당 1건만 가능합니다",
        code: undefined,
      });
      expect(memberCreate).not.toHaveBeenCalled();
    });

    it("같은 teamId 라도 한쪽이 종료된 활동이면 허용", async () => {
      tmFindMany.mockResolvedValue([
        tmRow({
          id: 10n,
          teamId: 1n,
          activeEndDate: new Date("2021-12-31T00:00:00Z"),
        }),
        tmRow({
          id: 11n,
          teamId: 1n,
          activeStartDate: new Date("2023-01-01T00:00:00Z"),
        }),
      ]);
      const { createMember } = await import("@/modules/members/actions");
      const result = await createMember({
        name: "복귀멤버",
        memberships: [
          {
            teamId: 1,
            activeStartDate: "2020-01-01",
            activeEndDate: "2021-12-31",
          },
          { teamId: 1, activeStartDate: "2023-01-01" },
        ],
      });
      if (!result.ok) throw new Error(result.message);
      expect(result.data.memberships).toHaveLength(2);
    });
  });

  describe("quickCreateMember", () => {
    it("표기 + 그룹만으로 생성 — 활동 시작일은 오늘, 순번은 그룹 마지막 + 1", async () => {
      tmAggregate.mockResolvedValue({ _max: { displayOrder: 4 } });
      const { quickCreateMember } = await import("@/modules/members/actions");
      const result = await quickCreateMember({
        name: " 미유 ",
        nameI18n: { "ja-jpan": "みゆ" },
        teamId: 2,
      });

      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({ name: "미유", teamIds: [1] }),
      });
      expect(tmAggregate).toHaveBeenCalledWith({
        where: { teamId: 2n },
        _max: { displayOrder: true },
      });
      const createData = memberCreate.mock.calls[0][0].data;
      expect(createData).toMatchObject({ name: "미유", nameI18n: { "ja-jpan": "みゆ" }, debutDate: null });
      const rows = tmCreateMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ teamId: 2n, displayOrder: 5, activeEndDate: null, role: null });
      expect(rows[0].activeStartDate).toBeInstanceOf(Date);
    });

    it("그룹에 순번이 하나도 없으면 순번은 미지정(null)", async () => {
      const { quickCreateMember } = await import("@/modules/members/actions");
      const result = await quickCreateMember({ name: "하나", teamId: 2 });
      expect(result.ok).toBe(true);
      expect(tmCreateMany.mock.calls[0][0].data[0].displayOrder).toBeNull();
    });

    it("이름이 비거나 그룹이 없으면 입력 검증 실패 → ok:false", async () => {
      const { quickCreateMember } = await import("@/modules/members/actions");
      expect(await quickCreateMember({ name: "  ", teamId: 2 })).toMatchObject({
        ok: false,
        code: "invalid_input",
      });
      expect(
        await quickCreateMember({ name: "x", teamId: 0 }),
      ).toMatchObject({ ok: false, code: "invalid_input" });
      expect(memberCreate).not.toHaveBeenCalled();
    });

    it("비관리자는 mutation 전에 거부한다", async () => {
      mockGetCurrentAccount.mockResolvedValue({ id: "user-1", isAdmin: false });
      const { quickCreateMember } = await import("@/modules/members/actions");
      await expect(quickCreateMember({ name: "x", teamId: 1 })).rejects.toThrow(/권한/);
      expect(memberCreate).not.toHaveBeenCalled();
    });
  });

  describe("updateMember", () => {
    it("전달한 필드만 patch에 포함된다", async () => {
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({ id: 1, name: "변경됨" });

      expect(result.ok).toBe(true);
      const patch = memberUpdate.mock.calls[0][0].data;
      expect(patch.name).toBe("변경됨");
      expect(patch).not.toHaveProperty("nameI18n");
      expect(patch).not.toHaveProperty("debutDate");
    });

    it("nameI18n과 날짜를 명시적으로 null로 비울 수 있다", async () => {
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({
        id: 1,
        nameI18n: null,
        debutDate: null,
        retireDate: null,
      });

      expect(result.ok).toBe(true);
      const patch = memberUpdate.mock.calls[0][0].data;
      expect(patch.nameI18n).toBe(Prisma.DbNull);
      expect(patch.debutDate).toBeNull();
      expect(patch.retireDate).toBeNull();
    });

    it("memberships 미제공 시 활동 이력은 건드리지 않는다", async () => {
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({ id: 1, name: "y" });

      expect(result.ok).toBe(true);
      expect(tmDeleteMany).not.toHaveBeenCalled();
      expect(tmCreateMany).not.toHaveBeenCalled();
    });

    it("memberships 제공 시 활동 이력 전체가 replace된다", async () => {
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({
        id: 1,
        memberships: [
          { teamId: 2, activeStartDate: "2022-01-01" },
          { teamId: 3, activeStartDate: "2023-01-01", role: "메인보컬" },
        ],
      });

      expect(result.ok).toBe(true);
      expect(tmDeleteMany).toHaveBeenCalledWith({ where: { memberId: 1n } });
      const rows = tmCreateMany.mock.calls[0][0].data;
      expect(rows.map((r: { teamId: bigint }) => r.teamId)).toEqual([2n, 3n]);
    });

    it("memberships 빈 배열은 활동 이력 전체 삭제", async () => {
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({ id: 1, memberships: [] });

      expect(result.ok).toBe(true);
      expect(tmDeleteMany).toHaveBeenCalledWith({ where: { memberId: 1n } });
      expect(tmCreateMany).not.toHaveBeenCalled();
    });

    it("존재하지 않는 id(P2025)면 not-found를 ok:false로 반환한다", async () => {
      memberUpdate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Record to update not found", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({ id: 9999, name: "x" });
      expect(result).toMatchObject({
        ok: false,
        message: "멤버를 찾을 수 없습니다",
      });
    });

    it("id 누락은 입력 검증 실패 → ok:false", async () => {
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({
        name: "x",
      } as Parameters<typeof updateMember>[0]);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    });

    it("memberships 안에 같은 teamId active 중복이면 거부 — ok:false 반환(프로덕션 메시지 보존)", async () => {
      const { updateMember } = await import("@/modules/members/actions");
      const result = await updateMember({
        id: 1,
        memberships: [
          { teamId: 2, activeStartDate: "2020-01-01" },
          { teamId: 2, activeStartDate: "2022-01-01" },
        ],
      });
      expect(result).toEqual({
        ok: false,
        message:
          "같은 그룹에 현재 활동 중(종료일 없음) 활동은 멤버당 1건만 가능합니다",
        code: undefined,
      });
      expect(memberUpdate).not.toHaveBeenCalled();
    });
  });

  describe("deleteMember", () => {
    it("상품 참조가 없으면 멤버 + 활동 이력이 함께 제거된다", async () => {
      const { deleteMember } = await import("@/modules/members/actions");
      const result = await deleteMember(1);

      expect(result.ok).toBe(true);
      expect(tmDeleteMany).toHaveBeenCalledWith({ where: { memberId: 1n } });
      expect(memberDelete).toHaveBeenCalledWith({ where: { id: 1n } });
    });

    it("상품이 참조하면 삭제 거부 — ok:false 반환(프로덕션 메시지 보존)", async () => {
      productCount.mockResolvedValue(1);
      const { deleteMember } = await import("@/modules/members/actions");

      const result = await deleteMember(1);
      expect(result).toEqual({
        ok: false,
        message: "이 멤버를 참조하는 상품 1건이 있어 삭제할 수 없습니다",
        code: undefined,
      });
      expect(memberDelete).not.toHaveBeenCalled();
    });

    it("존재하지 않는 id면 ok:false 반환", async () => {
      memberFindUnique.mockResolvedValue(null);
      const { deleteMember } = await import("@/modules/members/actions");
      const result = await deleteMember(9999);
      expect(result).toEqual({
        ok: false,
        message: "멤버를 찾을 수 없습니다",
        code: undefined,
      });
    });

    it("비로그인 사용자는 권한 에러 — requireAdmin 가드 동작", async () => {
      mockGetCurrentAccount.mockResolvedValue(null);
      const { deleteMember } = await import("@/modules/members/actions");
      await expect(deleteMember(1)).rejects.toThrow(/권한/);
      expect(memberDelete).not.toHaveBeenCalled();
    });

    it("createMember·updateMember도 비관리자를 mutation 전에 거부한다", async () => {
      mockGetCurrentAccount.mockResolvedValue({ id: "user-1", isAdmin: false });
      const { createMember, updateMember } = await import(
        "@/modules/members/actions"
      );

      await expect(
        createMember({
          name: "x",
          memberships: [{ teamId: 1, activeStartDate: "2020-01-01" }],
        }),
      ).rejects.toThrow(/권한/);
      await expect(updateMember({ id: 1, name: "y" })).rejects.toThrow(
        /권한/,
      );
      expect(memberCreate).not.toHaveBeenCalled();
      expect(memberUpdate).not.toHaveBeenCalled();
    });

    it("일반 회원(isAdmin=false)은 권한 에러 — requireAdmin 가드 동작", async () => {
      mockGetCurrentAccount.mockResolvedValue({ id: "user-1", isAdmin: false });
      const { deleteMember } = await import("@/modules/members/actions");
      await expect(deleteMember(1)).rejects.toThrow(/권한/);
    });

    it("0 또는 음수 id는 ok:false 반환", async () => {
      const { deleteMember } = await import("@/modules/members/actions");
      const zeroResult = await deleteMember(0);
      const negativeResult = await deleteMember(-1);
      expect(zeroResult).toEqual({
        ok: false,
        message: "유효하지 않은 멤버 ID 입니다",
        code: undefined,
      });
      expect(negativeResult).toEqual({
        ok: false,
        message: "유효하지 않은 멤버 ID 입니다",
        code: undefined,
      });
    });

    it("도메인 오류 — 사전 조회 후 delete가 P2025(TOCTOU)면 ok:false로 반환한다", async () => {
      memberDelete.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Record to delete does not exist", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
      const { deleteMember } = await import("@/modules/members/actions");
      const result = await deleteMember(1);
      expect(result).toMatchObject({ ok: false, message: "멤버를 찾을 수 없습니다" });
    });
  });
});
