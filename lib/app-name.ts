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

export function appDisplayName(base: string): string {
  return isDevDeploy() ? `${base} dev` : base;
}

export const APP_NAMES = {
  consumer: "이로이로",
  admin: "이로이로 관리자",
  catalog: "이로이로 토레카",
} as const;
