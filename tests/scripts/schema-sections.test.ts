import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  baselineNames,
  pendingSections,
  splitSections,
} from "../../scripts/lib/schema-sections.mjs";

const SAMPLE = `-- header comment
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- [20260101000000_init]
-- ====
CREATE TABLE a (id int);

-- [20260102000000_add_b]
CREATE TABLE b (id int);
`;

describe("splitSections", () => {
  it("마커로 나누고 서두는 첫 섹션 앞에 붙인다", () => {
    const out = splitSections(SAMPLE);
    expect(out.map((s) => s.name)).toEqual(["20260101000000_init", "20260102000000_add_b"]);
    expect(out[0].sql).toContain("CREATE EXTENSION");
    expect(out[0].sql).toContain("CREATE TABLE a");
    expect(out[0].sql).not.toContain("CREATE TABLE b");
    expect(out[1].sql.trim()).toBe("CREATE TABLE b (id int);");
  });

  it("같은 이름의 섹션이 두 번 나오면 거부한다", () => {
    expect(() => splitSections("-- [x]\nselect 1;\n-- [x]\nselect 2;")).toThrow(/중복/);
  });

  it("실제 db/schema.sql 을 오류 없이 나눈다(이름 유일, 순서 유지)", () => {
    for (const file of ["db/schema.sql"]) {
      const sections = splitSections(readFileSync(file, "utf8"));
      expect(sections.length).toBeGreaterThan(0);
      const names = sections.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
      // 타임스탬프 접두 섹션은 파일 순서 = 시간 순서
      const stamps = names.map((n) => n.slice(0, 14)).filter((s) => /^\d{14}$/.test(s));
      expect([...stamps].sort()).toEqual(stamps);
    }
  });
});

describe("pendingSections / baselineNames", () => {
  const sections = splitSections(SAMPLE);

  it("적용된 이름을 빼고 파일 순서를 유지한다", () => {
    expect(pendingSections(sections, ["20260101000000_init"]).map((s) => s.name)).toEqual([
      "20260102000000_add_b",
    ]);
  });

  it("베이스라인은 except 를 제외한 전부", () => {
    expect(baselineNames(sections, ["20260102000000_add_b"])).toEqual(["20260101000000_init"]);
    expect(baselineNames(sections)).toEqual(["20260101000000_init", "20260102000000_add_b"]);
  });

  it("except 에 모르는 이름이 있으면 거부한다(오타로 섹션이 새로 적용되는 사고 방지)", () => {
    expect(() => baselineNames(sections, ["typo"])).toThrow(/알 수 없는 섹션/);
  });
});
