import { describe, expect, it } from "vitest";
import {
  buildKindLabelMap,
  kindLabelOf,
  kindSelectOptions,
  sortKindKeys,
  type KindOption,
} from "@/modules/series/lib/kind-options";

// DB(series_kind)에서 내려온 종류 — 관리자가 라벨·순서를 바꿨다고 가정.
const kinds: KindOption[] = [
  { key: "event", label: "이벤트(수정)", displayOrder: 1 },
  { key: "random", label: "정규", displayOrder: 2 },
  { key: "live venue", label: "공연장 한정", displayOrder: 3 },
  { key: "others", label: "기타", displayOrder: 99 },
];

describe("buildKindLabelMap", () => {
  it("DB 라벨이 코드 상수를 덮어쓰고, DB 에 없는 키는 상수 라벨을 유지한다", () => {
    const map = buildKindLabelMap(kinds);
    expect(map.event).toBe("이벤트(수정)");
    expect(map["live venue"]).toBe("공연장 한정"); // 코드 상수에 없는 관리자 추가 종류
    expect(map.costume).toBe("의상"); // 상수 폴백
  });
});

describe("kindLabelOf", () => {
  it.each([
    ["event", "이벤트(수정)"], // DB 우선
    ["costume", "의상"], // 상수 폴백
    ["brand-new", "brand-new"], // 둘 다 없으면 키 그대로
  ])("%s → %s", (key, label) => {
    expect(kindLabelOf(kinds, key)).toBe(label);
  });
});

describe("sortKindKeys", () => {
  it("DB 순서를 따르고, 없는 키는 뒤에 알파벳순, others/unknown 은 맨 뒤", () => {
    expect(
      sortKindKeys(["others", "zzz", "random", "unknown", "aaa", "event", "live venue"], kinds),
    ).toEqual(["event", "random", "live venue", "aaa", "zzz", "others", "unknown"]);
  });
});

describe("kindSelectOptions", () => {
  it("DB 목록을 순서대로 선택지로 돌려준다", () => {
    expect(kindSelectOptions(kinds)).toEqual([
      { key: "event", label: "이벤트(수정)" },
      { key: "random", label: "정규" },
      { key: "live venue", label: "공연장 한정" },
      { key: "others", label: "기타" },
    ]);
  });

  it("DB 가 비어 있으면(시드 전) 코드 상수 선택지로 폴백하고 기타가 마지막이다", () => {
    const out = kindSelectOptions([]);
    expect(out[0]).toEqual({ key: "random", label: "정규" });
    expect(out.at(-1)).toEqual({ key: "others", label: "기타" });
  });
});
