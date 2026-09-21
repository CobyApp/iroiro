import { z } from "zod";
import { nameI18nSchema } from "@/lib/i18n";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식");
// 그룹 고유색 — #rrggbb 만. 카탈로그 칩·헤더 색.
const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "#rrggbb 형식의 색상 코드");

export const teamCreateSchema = z.object({
  name: z.string().min(1, "한글 그룹명은 필수입니다"),
  nameI18n: nameI18nSchema,
  debutDate: dateSchema.nullable().optional(),
  disbandDate: dateSchema.nullable().optional(),
  themeColor: hexColorSchema.nullable().optional(),
});

export const teamUpdateSchema = teamCreateSchema.partial().extend({
  id: z.number().int().positive(),
});

export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;
