import "server-only";
import { DomainError } from "@/lib/action-result";

type Window = { seconds: number; max: number };
type Counter = (since: Date) => Promise<number>;

// 이중 윈도 COUNT — 어느 윈도든 (현재 + requested) > max면 도메인 에러.
// counter는 호출부가 스코프 주입(글/댓글 = account_id, 신고 = 두 테이블 합산 — mutations 참조).
// requested 기본 1 = 기존 "count >= max 거부"와 동치. presign은 생성되는 대기 사진 수를 넘긴다(P1-3).
export async function assertWithinRateLimit(
  windows: readonly Window[],
  counter: Counter,
  requested = 1,
): Promise<void> {
  for (const w of windows) {
    const since = new Date(Date.now() - w.seconds * 1000);
    if ((await counter(since)) + requested > w.max) {
      throw new DomainError("요청이 너무 잦습니다. 잠시 후 다시 시도해주세요");
    }
  }
}
