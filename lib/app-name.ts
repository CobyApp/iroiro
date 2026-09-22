import "server-only";

import { env } from "@/lib/env";

// 설치형 웹앱(PWA) 이름 — 소비자 "이로이로", 관리자 "이로이로 관리자", 카탈로그 "이로이로 토레카".
// dev 배포(APP_URL 호스트가 dev. 로 시작)는 이름 뒤에 " dev" 를 붙여 홈 화면에서 운영 앱과 구분한다.
// 로컬(localhost)은 접미 없음 — 운영자가 여러 환경 앱을 나란히 설치하는 건 dev/prd 배포 둘이다.

export function isDevDeploy(): boolean {
  const url = env.APP_URL;
  if (!url) return false;
  try {
    return new URL(url).hostname.startsWith("dev.");
  } catch {
    return false;
  }
}

// 배포 환경 이름 — dev·prd 가 공유하는 데이터(카탈로그 DB)에 "어느 환경에서 생긴 행인지" 적을 때 쓴다.
// 계정 id 는 환경별 커머스 DB 에만 있으므로, 공유 행의 account_id 는 같은 환경에서만 의미가 있다.
export type DeployEnv = "dev" | "prd" | "local";

export function deployEnvName(): DeployEnv {
  const url = env.APP_URL;
  if (!url) return "local";
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return "local";
    return host.startsWith("dev.") ? "dev" : "prd";
  } catch {
    return "local";
  }
}

export function appDisplayName(base: string): string {
  return isDevDeploy() ? `${base} dev` : base;
}

export const APP_NAMES = {
  consumer: "이로이로",
  admin: "이로이로 관리자",
  catalog: "이로이로 토레카",
  board: "이로이로 게시판",
  delivery: "이로이로 스토어",
  market: "이로이로 중고거래",
} as const;
