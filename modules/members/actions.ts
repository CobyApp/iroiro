"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { db } from "@/lib/db";
import { catalogDb } from "@/lib/catalog-db";
import { isNotFoundError } from "@/lib/prisma-errors";
import type { TeamMember } from "@/modules/team-members/types";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { formatKstDate, todayKstYmd } from "@/lib/datetime";
import {
  memberCreateSchema,
  memberQuickCreateSchema,
  memberUpdateSchema,
  type MemberCreateInput,
  type MemberQuickCreateInput,
  type MemberUpdateInput,
} from "./lib/schema";
import { toMember } from "./lib/transform";
import type { Member, MemberWithTeams } from "./types";
import { CatalogPrisma as Prisma } from "@/lib/catalog-db";

/**
 * 같은 멤버 입력에 (teamId 동일 + active_end_date NULL)인 항목이 둘 이상이면 reject.
 * DB partial unique index `team_member_active_member_team_unique` 와 동일 의미를
 * 코드 레벨에서 사전 검증해 친화적 메시지를 보장한다.
 */
function ensureActiveUniqueWithinMembership(
  memberships: { teamId: number; activeEndDate?: string | null }[],
): void {
  const activeTeamIds = memberships
    .filter((m) => !m.activeEndDate)
    .map((m) => m.teamId);
  if (new Set(activeTeamIds).size !== activeTeamIds.length) {
    throw new DomainError(
      "같은 그룹에 현재 활동 중(종료일 없음) 활동은 멤버당 1건만 가능합니다",
    );
  }
}

function aggregate(
  member: Member,
  memberships: TeamMember[],
): MemberWithTeams {
  const teamIds = Array.from(new Set(memberships.map((tm) => tm.teamId)));
  const displayOrderByTeam: Record<number, number | null> = {};
  const roleByTeam: Record<number, string | null> = {};
  for (const tm of memberships) {
    displayOrderByTeam[tm.teamId] = tm.displayOrder;
    roleByTeam[tm.teamId] = tm.role;
  }
  return { ...member, teamIds, displayOrderByTeam, roleByTeam, memberships };
}

// update 대상이 없을 때(P2025) not-found를 예상 도메인 오류로 결과화.
async function mapMemberWriteError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isNotFoundError(error)) throw new DomainError("멤버를 찾을 수 없습니다");
    throw error;
  }
}

// 멤버 + 활동 이력 삽입 — 전체 폼(createMember)과 빠른 추가(quickCreateMember)가 공유.
// 검증(zod·active 중복)은 호출자가 끝낸 상태여야 한다.
async function insertMember(data: MemberCreateInput): Promise<MemberWithTeams> {
  const result = await catalogDb.$transaction(async (tx) => {
    const memberRow = await tx.member.create({
      data: {
        name: data.name,
        nameI18n: data.nameI18n ?? undefined,
        debutDate: data.debutDate ? new Date(data.debutDate) : null,
        retireDate: data.retireDate ? new Date(data.retireDate) : null,
      },
    });

    await tx.teamMember.createMany({
      data: data.memberships.map((m) => ({
        memberId: memberRow.id,
        teamId: BigInt(m.teamId),
        activeStartDate: new Date(m.activeStartDate),
        activeEndDate: m.activeEndDate ? new Date(m.activeEndDate) : null,
        role: m.role ?? null,
        displayOrder: m.displayOrder ?? null,
      })),
    });

    const tmRows = await tx.teamMember.findMany({
      where: { memberId: memberRow.id },
    });

    return { memberRow, tmRows };
  });

  revalidatePath("/catalog/members");
  // 카드 등록 폼·매트릭스의 멤버 선택지도 같은 데이터를 쓴다.
  revalidatePath("/catalog/cards");
  revalidatePath("/catalog/cards/new");

  const member = toMember(result.memberRow);
  const memberships: TeamMember[] = result.tmRows.map((tm) => ({
    id: Number(tm.id),
    teamId: Number(tm.teamId),
    memberId: Number(tm.memberId),
    activeStartDate: formatKstDate(tm.activeStartDate),
    activeEndDate: tm.activeEndDate ? formatKstDate(tm.activeEndDate) : null,
    role: tm.role,
    displayOrder: tm.displayOrder,
    createdAt: tm.createdAt.toISOString(),
    updatedAt: tm.updatedAt.toISOString(),
  }));
  return aggregate(member, memberships);
}

export async function createMember(
  input: MemberCreateInput,
): Promise<ActionResult<MemberWithTeams>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(memberCreateSchema, input);
    ensureActiveUniqueWithinMembership(data.memberships);
    return insertMember(data);
  });
}

// 빠른 추가 — 카드 등록 폼·멤버 목록에서 표기와 소속 그룹만으로 멤버를 만든다.
// 활동 시작일은 오늘(KST), 순번은 그 그룹의 마지막 순번 + 1(순번이 하나도 없으면 미지정).
export async function quickCreateMember(
  input: MemberQuickCreateInput,
): Promise<ActionResult<MemberWithTeams>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(memberQuickCreateSchema, input);
    const agg = await catalogDb.teamMember.aggregate({
      where: { teamId: BigInt(data.teamId) },
      _max: { displayOrder: true },
    });
    const lastOrder = agg._max.displayOrder;
    return insertMember({
      name: data.name,
      nameI18n: data.nameI18n ?? null,
      debutDate: null,
      retireDate: null,
      memberships: [
        {
          teamId: data.teamId,
          activeStartDate: todayKstYmd(),
          activeEndDate: null,
          role: null,
          displayOrder: lastOrder === null ? null : lastOrder + 1,
        },
      ],
    });
  });
}

export async function updateMember(
  input: MemberUpdateInput,
): Promise<ActionResult<Member>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(memberUpdateSchema, input);
    if (data.memberships !== undefined) {
      ensureActiveUniqueWithinMembership(data.memberships);
    }

    const patch: Prisma.MemberUpdateInput = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.nameI18n !== undefined)
      patch.nameI18n = data.nameI18n ?? Prisma.DbNull;
    if (data.debutDate !== undefined)
      patch.debutDate = data.debutDate ? new Date(data.debutDate) : null;
    if (data.retireDate !== undefined)
      patch.retireDate = data.retireDate ? new Date(data.retireDate) : null;

    const row = await mapMemberWriteError(() => catalogDb.$transaction(async (tx) => {
      const memberRow = await tx.member.update({
        where: { id: BigInt(data.id) },
        data: patch,
      });

      if (data.memberships !== undefined) {
        await tx.teamMember.deleteMany({
          where: { memberId: BigInt(data.id) },
        });
        if (data.memberships.length > 0) {
          await tx.teamMember.createMany({
            data: data.memberships.map((m) => ({
              memberId: BigInt(data.id),
              teamId: BigInt(m.teamId),
              activeStartDate: new Date(m.activeStartDate),
              activeEndDate: m.activeEndDate ? new Date(m.activeEndDate) : null,
              role: m.role ?? null,
              displayOrder: m.displayOrder ?? null,
            })),
          });
        }
      }

      return memberRow;
    }));

    revalidatePath("/catalog/members");
    revalidatePath(`/catalog/members/${data.id}/edit`);
    return toMember(row);
  });
}

export async function deleteMember(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();

    if (!Number.isInteger(id) || id <= 0) {
      throw new DomainError("유효하지 않은 멤버 ID 입니다");
    }

    const memberIdBig = BigInt(id);
    const existing = await catalogDb.member.findUnique({ where: { id: memberIdBig } });
    if (!existing) throw new DomainError("멤버를 찾을 수 없습니다");

    const productRefs = await db.product.count({
      where: { memberId: memberIdBig },
    });
    if (productRefs > 0) {
      throw new DomainError(
        `이 멤버를 참조하는 상품 ${productRefs}건이 있어 삭제할 수 없습니다`,
      );
    }

    // 사전 조회~delete 사이 TOCTOU 삭제 시 P2025 → not-found로 결과화.
    await mapMemberWriteError(() =>
      catalogDb.$transaction(async (tx) => {
        await tx.teamMember.deleteMany({ where: { memberId: memberIdBig } });
        await tx.member.delete({ where: { id: memberIdBig } });
      }),
    );

    revalidatePath("/catalog/members");
  });
}
