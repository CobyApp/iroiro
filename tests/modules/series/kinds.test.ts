import { describe, expect, it } from "vitest";
import {
  SERIES_KIND_OPTIONS,
  seriesKindLabel,
  sortSeriesKinds,
} from "@/modules/series/kinds";

describe("seriesKindLabel", () => {
  it.each([
    ["random", "정규"],
    ["CD benefits", "CD 특전"], // 분석기 커스텀 종류(키에 공백)
    ["kuji", "쿠지"],
    ["sukisuki web", "웹 토레카"],
    ["others", "기타"],
    ["unknown", "기타"],
    ["brand-new", "brand-new"], // 미정의 키는 그대로
  ])("%s → %s", (kind, label) => {
    expect(seriesKindLabel(kind)).toBe(label);
  });
});

describe("sortSeriesKinds", () => {
  it("분석기 시드 순서를 따르고 기타는 항상 맨 뒤, 미정의 키는 기타 바로 앞에 알파벳순", () => {
    expect(
      sortSeriesKinds(["others", "kuji", "zzz", "random", "unknown", "CD benefits", "aaa", "event"]),
    ).toEqual(["random", "event", "CD benefits", "kuji", "aaa", "zzz", "others", "unknown"]);
  });
});

describe("SERIES_KIND_OPTIONS", () => {
  it("모든 선택지 값에 라벨이 정의돼 있고 기타가 마지막이다", () => {
    for (const o of SERIES_KIND_OPTIONS) {
      expect(seriesKindLabel(o.value)).toBe(o.label);
    }
    expect(SERIES_KIND_OPTIONS.at(-1)?.value).toBe("others");
  });
});
