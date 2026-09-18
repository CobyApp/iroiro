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

export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
