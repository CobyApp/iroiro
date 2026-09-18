// 회원 표시 닉네임 검증 — 가입(/signup)·설정에서 공유. 순수 함수(isomorphic, server-only 아님).
// 정책: 앞뒤 공백 제거 후 필수(1자 이상), 코드포인트 기준 최대 길이. 표시용이라 유니크는 두지 않음.
export const NICKNAME_MAX_LENGTH = 20;

export function parseNickname(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("닉네임을 입력해 주세요.");
  }
  if ([...trimmed].length > NICKNAME_MAX_LENGTH) {
    throw new Error(`닉네임은 ${NICKNAME_MAX_LENGTH}자 이하여야 합니다.`);
  }
  return trimmed;
}
