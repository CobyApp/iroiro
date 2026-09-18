import { z } from "zod";

export const MAX_REVIEW_BODY = 1000;

export const reviewUpsertSchema = z.object({
  orderId: z.number().int().positive(),
  productId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(MAX_REVIEW_BODY),
});

export const reviewDeleteSchema = z.object({
  reviewId: z.number().int().positive(),
});

export type ReviewUpsertInput = z.infer<typeof reviewUpsertSchema>;
export type ReviewDeleteInput = z.infer<typeof reviewDeleteSchema>;
