// 타입 선언 — scripts/lib/schema-sections.mjs (러너는 순수 JS, 테스트는 TS)
export type SchemaSection = { name: string; sql: string };
export function splitSections(sql: string): SchemaSection[];
export function pendingSections(sections: SchemaSection[], appliedNames: string[]): SchemaSection[];
export function baselineNames(sections: SchemaSection[], except?: string[]): string[];
