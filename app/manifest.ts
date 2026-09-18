import type { MetadataRoute } from "next";

// PWA 매니페스트 — 홈 화면 설치·standalone 웹앱.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "이로이로",
    short_name: "이로이로",
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
