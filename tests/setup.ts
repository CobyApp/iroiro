import { vi } from "vitest";

// Next.js cache helpers require the static generation store, which doesn't
// exist in vitest. Server actions invoke these to invalidate RSC caches; in
// unit tests we only need the side effects on mock stores, so mock to no-op.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
