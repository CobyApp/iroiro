import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식");

export const teamMembershipInputSchema = z.object({
  teamId: z.number().int().positive(),
  activeStartDate: dateSchema,
  activeEndDate: dateSchema.nullable().optional(),
  role: z.string().nullable().optional(),
  // 관리자가 직접 입력하는 정렬 순서라 1부터 받는다 — "첫 번째 = 0"은 직관에 어긋난다.
  // (기계가 배열 index로 채우는 사진 테이블들은 반대로 0부터 — data-modeling.md §타입 선택)
  displayOrder: z
    .number()
    .int()
    .positive("정렬 순서는 1 이상이어야 합니다")
    .nullable()
    .optional(),
});
