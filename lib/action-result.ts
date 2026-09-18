// 서버 액션의 예상 오류 계약.
//
// 배경(실측): 프로덕션 빌드에서 Server Action이 throw한 Error는 React 보안장치로
// message·name·stack이 제거되고 digest만 클라이언트에 전달된다(dev에서는 그대로).
// 따라서 사용자에게 보여줄 도메인 메시지는 throw가 아니라 **반환값**으로 넘겨야 한다.
//
// 규약:
// - 예상 도메인 오류(중복·재고 부족·상태 충돌·rate limit 등)는 `DomainError`로 throw하고,
//   액션 경계의 `runAction`이 `ActionResult`(ok:false)로 변환한다. 트랜잭션 내부에서
//   throw하면 롤백 트리거를 겸한다(값 반환으로 바꾸면 롤백을 수동 처리해야 하므로 내부는 throw 유지).
// - 진짜 불변식 위반(무결성 오류)·시스템 오류·`redirect()`/`notFound()`(NEXT_* 신호)는
//   DomainError가 아니므로 `runAction`이 그대로 re-throw → error boundary/프레임워크가 처리.
//
// 출처: inbox-zero의 서버 액션 결과 반환 컨벤션(참조 표 등재) + Next.js 공식 error-handling
// 가이드("expected errors는 반환값으로 모델링").

import { z } from "zod";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string };

/** 사용자에게 보여줄 예상 도메인 오류. 액션 경계에서 ActionResult(ok:false)로 변환된다. */
export class DomainError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

/**
 * 액션 본문을 실행해 결과 계약으로 감싼다.
 * - 정상 종료: `{ ok: true, data }`
 * - `DomainError`: `{ ok: false, message, code }` (사용자 표시용)
 * - 그 외(redirect/notFound의 NEXT_* · 무결성 · 시스템 오류): 그대로 re-throw
 */
export async function runAction<T>(
  body: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.message, code: error.code };
    }
    throw error;
  }
}

/**
 * 액션 입력을 zod로 파싱하되, 검증 실패를 사용자에게 보여줄 `DomainError`로 변환한다.
 * `schema.parse()`가 던지는 `ZodError`는 DomainError가 아니라 `runAction`이 그대로 re-throw →
 * 프로덕션에서 메시지가 digest로 지워져 토스트가 뜨지 않는다. 파싱 경계에서 이 함수를 쓰면
 * 입력 오류도 `ActionResult({ ok:false })`로 흘러 정상적으로 사용자에게 표시된다.
 *
 * 메시지는 첫 issue의 message(스키마의 한국어 커스텀 메시지)를 노출한다.
 */
export function parseActionInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값을 확인해주세요";
    throw new DomainError(message, "invalid_input");
  }
  return parsed.data;
}
