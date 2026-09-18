import { z } from "zod";
import { nameI18nSchema } from "@/lib/i18n";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식");

export const teamCreateSchema = z.object({
  name: z.string().min(1, "한글 그룹명은 필수입니다"),
  nameI18n: nameI18nSchema,
  debutDate: dateSchema.nullable().optional(),
  disbandDate: dateSchema.nullable().optional(),
});

export const teamUpdateSchema = teamCreateSchema.partial().extend({
  id: z.number().int().positive(),
});

export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;
