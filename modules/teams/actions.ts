"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { db } from "@/lib/db";
import { isNotFoundError } from "@/lib/prisma-errors";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import {
  teamCreateSchema,
  teamUpdateSchema,
  type TeamCreateInput,
  type TeamUpdateInput,
} from "./lib/schema";
import { toTeam } from "./lib/transform";
import type { Team } from "./types";
import { Prisma } from "@prisma/client";

// update 대상이 없을 때(P2025) not-found를 예상 도메인 오류로 결과화.
async function mapTeamWriteError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isNotFoundError(error)) throw new DomainError("그룹을 찾을 수 없습니다");
    throw error;
  }
}

export async function createTeam(
  input: TeamCreateInput,
): Promise<ActionResult<Team>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(teamCreateSchema, input);

    const row = await db.team.create({
      data: {
        name: data.name,
        nameI18n: data.nameI18n ?? undefined,
        debutDate: data.debutDate ? new Date(data.debutDate) : null,
        disbandDate: data.disbandDate ? new Date(data.disbandDate) : null,
      },
    });
    revalidatePath("/catalog/teams");
    return toTeam(row);
  });
}

export async function updateTeam(
  input: TeamUpdateInput,
): Promise<ActionResult<Team>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(teamUpdateSchema, input);

    const patch: Prisma.TeamUpdateInput = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.nameI18n !== undefined)
      patch.nameI18n = data.nameI18n ?? Prisma.DbNull;
    if (data.debutDate !== undefined)
      patch.debutDate = data.debutDate ? new Date(data.debutDate) : null;
    if (data.disbandDate !== undefined)
      patch.disbandDate = data.disbandDate ? new Date(data.disbandDate) : null;

    const row = await mapTeamWriteError(() =>
      db.team.update({
        where: { id: BigInt(data.id) },
        data: patch,
      }),
    );
    revalidatePath("/catalog/teams");
    revalidatePath(`/catalog/teams/${data.id}/edit`);
    return toTeam(row);
  });
}

function buildTeamRefBlockMessage(
  memberRefs: number,
  productRefs: number,
): string {
  const parts: string[] = [];
  if (memberRefs > 0) parts.push(`멤버 ${memberRefs}건`);
  if (productRefs > 0) parts.push(`상품 ${productRefs}건`);
  return `이 그룹을 참조하는 ${parts.join(", ")}이 있어 삭제할 수 없습니다`;
}

export async function deleteTeam(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    if (!Number.isInteger(id) || id <= 0) {
      throw new DomainError("유효하지 않은 그룹 ID 입니다");
    }

    const teamIdBig = BigInt(id);
    const existing = await db.team.findUnique({ where: { id: teamIdBig } });
    if (!existing) throw new DomainError("그룹을 찾을 수 없습니다");

    const [memberRefs, productRefs] = await Promise.all([
      db.teamMember.count({ where: { teamId: teamIdBig } }),
      db.product.count({ where: { teamId: teamIdBig } }),
    ]);
    if (memberRefs > 0 || productRefs > 0) {
      throw new DomainError(buildTeamRefBlockMessage(memberRefs, productRefs));
    }

    // 사전 조회~delete 사이 TOCTOU 삭제 시 P2025 → not-found로 결과화.
    await mapTeamWriteError(() => db.team.delete({ where: { id: teamIdBig } }));
    revalidatePath("/catalog/teams");
  });
}
