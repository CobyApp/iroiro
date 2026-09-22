import { describe, expect, it } from "vitest";
import { compareSeriesLabel } from "@/modules/series/lib/kind-options";

describe("compareSeriesLabel", () => {
  it("ver 번호를 숫자 순으로 정렬한다(사전순 아님)", () => {
    const labels = ["ver.10", "ver.2", "ver.1", "ver.15", "ver.3"];
    expect([...labels].sort(compareSeriesLabel)).toEqual([
      "ver.1", "ver.2", "ver.3", "ver.10", "ver.15",
    ]);
  });
  it("한국어 병기 라벨도 앞 숫자 기준으로 정렬한다", () => {
    const labels = ["ver.10 (버전10)", "ver.2 (버전2)"];
    expect([...labels].sort(compareSeriesLabel)).toEqual([
      "ver.2 (버전2)", "ver.10 (버전10)",
    ]);
  });
});
