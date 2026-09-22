import { describe, expect, it } from "vitest";
import { safeReturnPath } from "@/modules/auth/lib/oauth/state";

describe("safeReturnPath", () => {
  it("같은 사이트 절대경로는 통과한다", () => {
    expect(safeReturnPath("/admin")).toBe("/admin");
    expect(safeReturnPath("/admin/catalog/cards?view=pending")).toBe(
      "/admin/catalog/cards?view=pending",
    );
  });
  it("오픈 리다이렉트·비내부 경로는 거부한다", () => {
    for (const v of ["//evil.com", "https://evil.com", "/\\evil", "evil", "/api/x", "/login", "/login?x=1", "", null, undefined]) {
      expect(safeReturnPath(v as string | null)).toBeNull();
    }
  });
  it("길이를 512자로 제한한다", () => {
    expect(safeReturnPath("/" + "a".repeat(600))!.length).toBe(512);
  });
});
