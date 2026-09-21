import type { MetadataRoute } from "next";
import { APP_NAMES, appDisplayName } from "@/lib/app-name";

// PWA 매니페스트 — 홈 화면 설치·standalone 웹앱. dev 배포는 이름에 " dev" 를 붙여 운영 앱과 구분.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appDisplayName(APP_NAMES.consumer),
    short_name: appDisplayName(APP_NAMES.consumer),
    description: "일본 아이돌 토레카·굿즈 카탈로그",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFF8FC",
    theme_color: "#FFF8FC",
    icons: [
      {
        src: "/brand/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
