import { APP_NAMES, appDisplayName } from "@/lib/app-name";

// 카탈로그 전용 PWA 매니페스트 — 운영 관리자(/admin)·소비자앱과 별개의 설치형 웹앱 "이로이로 토레카".
// id·scope·start_url을 /catalog로 두어 브라우저가 독립 앱으로 인식한다. dev 배포는 이름에 " dev".
export function GET(): Response {
  const name = appDisplayName(APP_NAMES.catalog);
  const manifest = {
    id: "/admin/catalog",
    name,
    short_name: appDisplayName("토레카"),
    description: "이로이로 토레카 마스터 데이터 관리 콘솔",
    start_url: "/admin/catalog",
    scope: "/admin/catalog",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffdf9",
    theme_color: "#9a8cf4",
    icons: [
      { src: "/brand/catalog-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/catalog-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/catalog-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
