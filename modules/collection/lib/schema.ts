import { z } from "zod";

// 컬렉션 표시명 — 닉네임 규칙 준용(트림 후 1~20자).
export const collectionTitleSchema = z.string().trim().min(1).max(20);

export const createCollectionSchema = z.object({
  title: collectionTitleSchema,
});

export const deleteCollectionSchema = z.object({
  collectionId: z.number().int().positive(),
});

export const registerItemSchema = z.object({
  collectionId: z.number().int().positive(),
  productId: z.number().int().positive(),
});

export const unregisterItemSchema = registerItemSchema;

export const reorderItemsSchema = z.object({
  collectionId: z.number().int().positive(),
  orderedProductIds: z.array(z.number().int().positive()).min(1).max(200),
});

export const setCollectionPublicSchema = z.object({
  collectionId: z.number().int().positive(),
  isPublic: z.boolean(),
});

export const setCollectionTitleSchema = z.object({
  collectionId: z.number().int().positive(),
  title: collectionTitleSchema,
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type DeleteCollectionInput = z.infer<typeof deleteCollectionSchema>;
export type RegisterItemInput = z.infer<typeof registerItemSchema>;
export type UnregisterItemInput = z.infer<typeof unregisterItemSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type SetCollectionPublicInput = z.infer<typeof setCollectionPublicSchema>;
export type SetCollectionTitleInput = z.infer<typeof setCollectionTitleSchema>;
