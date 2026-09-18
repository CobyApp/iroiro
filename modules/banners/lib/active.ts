// 배너 게시기간 활성 판정 — 순수 함수(node 테스트 가능).
// startsAt null = 시작 무제한, endsAt null = 종료 무제한.
export function isBannerActiveAt(
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date,
): boolean {
  if (startsAt && startsAt.getTime() > now.getTime()) return false;
  if (endsAt && endsAt.getTime() < now.getTime()) return false;
  return true;
}
