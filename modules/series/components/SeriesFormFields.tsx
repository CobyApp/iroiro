"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeriesInput } from "../actions";

// 시리즈 폼 필드 — 추가(SeriesQuickAddDialog)와 수정(SeriesManage › SeriesRowActions)이 공유.
// 종류 선택지는 DB(series_kind)에서 내려온 목록을 쓴다.

export type KindOption = { key: string; label: string };


export type SeriesFormState = Omit<SeriesInput, "teamId">;

export function SeriesFormFields({
  value,
  onChange,
  kinds,
  skuOptional = false,
}: {
  value: SeriesFormState;
  onChange: (next: SeriesFormState) => void;
  kinds: KindOption[];
  /** 추가 폼 — 비우면 서버가 내부용 SKU 를 자동 발급한다. */
  skuOptional?: boolean;
}) {
  // 현재 값이 목록에 없는 키(데이터에만 있는 종류)면 그대로 선택지로 노출해 값을 잃지 않게 한다.
  const options =
    value.kind && !kinds.some((k) => k.key === value.kind)
      ? [...kinds, { key: value.kind, label: value.kind }]
      : kinds;
  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">시리즈 이름 (원문)</label>
        <Input
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          placeholder="예: クリスマス 2024"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">한국어 병기</label>
        <Input
          value={value.labelKo ?? ""}
          onChange={(e) =>
            onChange({ ...value, labelKo: e.target.value || null })
          }
          placeholder="예: 크리스마스 2024 — 원문이 일본어일 때 고객 화면에 함께 표기"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">종류</label>
          <Select
            value={value.kind}
            onValueChange={(v) => onChange({ ...value, kind: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="종류" />
            </SelectTrigger>
            <SelectContent>
              {options.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            SKU{skuOptional && <span className="ml-1 text-muted-foreground/70">(비우면 자동)</span>}
          </label>
          <Input
            value={value.sku}
            onChange={(e) => onChange({ ...value, sku: e.target.value })}
            placeholder={skuOptional ? "예: EV-xmas-2024 · 비우면 자동" : "예: EV-xmas-2024"}
            className="font-mono"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">상품 URL</label>
        <Input
          type="url"
          inputMode="url"
          value={value.productUrl ?? ""}
          onChange={(e) => onChange({ ...value, productUrl: e.target.value || null })}
          placeholder="https://… 공식 상품 페이지 (선택)"
        />
      </div>
    </>
  );
}

export function emptySeriesForm(kinds: KindOption[]): SeriesFormState {
  return { label: "", labelKo: null, kind: kinds[0]?.key ?? "random", sku: "", productUrl: null };
}

