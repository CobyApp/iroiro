import "server-only";

import { Prisma } from "@prisma/client";

// Prisma 7 + driver adapter(adapter-pg)의 P2002는 위반 컬럼을 meta.target이 아니라
// meta.driverAdapterError.cause.constraint.fields에 담는다(2026-07-20 로컬 실측 —
// meta.target은 undefined). classic engine의 meta.target(string | string[])도 함께
// 지원해 런타임 구성이 바뀌어도 판별이 유지되게 한다.
type UniqueViolationMeta = {
  target?: string | string[];
  driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
};

// P2002(unique 제약 위반)에서 위반 컬럼 목록을 추출한다. P2002가 아니면 빈 배열.
export function uniqueViolationFields(error: unknown): string[] {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return [];
  }
  const meta = error.meta as UniqueViolationMeta | undefined;
  const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(adapterFields)) return adapterFields;
  const target = meta?.target;
  if (Array.isArray(target)) return target;
  if (typeof target === "string") return [target];
  return [];
}

// 해당 컬럼의 unique 위반인지 판별 — 두 shape 모두 컬럼명 배열이므로 정확 일치로 검사.
export function isUniqueViolationOn(error: unknown, column: string): boolean {
  return uniqueViolationFields(error).includes(column);
}

// P2025 = "조회 대상 레코드 없음"(update/delete의 where가 0행). 존재하지 않는 ID에 대한
// update/delete를 예상 도메인 오류(not-found)로 결과화할 때 액션 경계에서 판별에 쓴다.
export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
