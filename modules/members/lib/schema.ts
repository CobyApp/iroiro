import { z } from "zod";
import { nameI18nSchema } from "@/lib/i18n";
import { teamMembershipInputSchema } from "@/modules/team-members/lib/schema";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식");

export const memberCreateSchema = z.object({
  name: z.string().min(1, "한글 멤버명은 필수입니다"),
  nameI18n: nameI18nSchema,
  debutDate: dateSchema.nullable().optional(),
  retireDate: dateSchema.nullable().optional(),
  memberships: z.array(teamMembershipInputSchema).min(1, "최소 1건의 활동 이력 필요"),
});

export const memberUpdateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).optional(),
  nameI18n: nameI18nSchema,
  debutDate: dateSchema.nullable().optional(),
  retireDate: dateSchema.nullable().optional(),
  // 제공되면 활동 이력 전체를 이 리스트로 replace
  memberships: z.array(teamMembershipInputSchema).optional(),
});

// 빠른 추가 — 표기 + 소속 그룹만 받는다. 활동 시작일은 오늘, 순번은 그룹의 마지막 다음.
export const memberQuickCreateSchema = z.object({
  name: z.string().trim().min(1, "한글 멤버명은 필수입니다").max(100),
  nameI18n: nameI18nSchema,
  teamId: z.number().int().positive("소속 그룹을 선택해주세요"),
});

export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberQuickCreateInput = z.infer<typeof memberQuickCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
