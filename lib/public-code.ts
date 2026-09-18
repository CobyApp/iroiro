import "server-only";

import { randomBytes } from "node:crypto";

// 공개 식별자 생성 유틸 — 암호학적 RNG + rejection sampling(modulo bias 제거).
// 중복 방지는 길이가 아니라 각 테이블의 UNIQUE 인덱스 + 생성 경로의 insert 재시도로 보장한다.
// → 아래 "충돌 확률"은 insert 재시도가 한 번 일어날 확률이지, 중복이 DB에 남을 확률이 아니다.
// (collection에서 승격 — 스펙 docs/superpowers/specs/2026-07-19-community-design.md §결정 2)

// URL 코드용 base62 (collection·notice·post의 public_code).
// 주소창에 쓰이는 값이라 사람이 한 글자씩 전사하지 않음 → 혼동 문자(0/O·1/I/l)를 뺄 이유가 없어,
// 전체 영숫자 62자를 그대로 써서 밀도(글자당 엔트로피)를 챙긴다 (account 코드가 Base58인 것과 대비).
// 12자 → 키 공간 62^12 ≈ 3.2×10^21 (엔트로피 ≈ 71.5비트).
// 충돌 확률: 삽입 1건당 ≈ 3×10^-16(기존 100만 건 기준) · 누적 50%까지 약 670억 코드 — 사실상 무시.
export const PUBLIC_CODE_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const PUBLIC_CODE_LENGTH = 12;

// 사람이 읽고 비교하는 계정 코드용 Base58 — 0/O·1/I/l 혼동 문자 제외 (스펙 §결정 3).
// 8자 → 키 공간 58^8 ≈ 1.28×10^14 (약 128조, 엔트로피 ≈ 46.9비트).
// 충돌 확률: 삽입 1건당 ≈ 8×10^-9(기존 100만 건 기준) · 계정 100만 개 전체에서 한 번이라도
// 겹칠 확률 ≈ 0.4% · 누적 50%까지 약 1,300만 계정 — 재시도가 사실상 발생하지 않는다.
export const ACCOUNT_CODE_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const ACCOUNT_CODE_LENGTH = 8;

// 항상 정확히 length자를 반환한다 — rejection sampling은 편향 바이트를 건너뛸 뿐,
// out.length === length가 될 때까지 채우므로 출력 길이가 짧아지지 않는다.
function generateCode(alphabet: string, length: number): string {
  const size = alphabet.length;
  // 256을 알파벳 크기의 배수로 자른 최대 경계. 이 이상 바이트는 버려 균일 분포 유지.
  const maxUnbiased = Math.floor(256 / size) * size;
  let out = "";
  while (out.length < length) {
    const buf = randomBytes(length);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i];
      if (b < maxUnbiased) out += alphabet[b % size];
    }
  }
  return out;
}

export function generatePublicCode(): string {
  return generateCode(PUBLIC_CODE_ALPHABET, PUBLIC_CODE_LENGTH);
}

export function generateAccountCode(): string {
  return generateCode(ACCOUNT_CODE_ALPHABET, ACCOUNT_CODE_LENGTH);
}
