import { APP_NAMES, appDisplayName } from "@/lib/app-name";

// 중고거래 관리 전용 PWA 매니페스트 — 독립 설치형 앱 "이로이로 중고거래". dev 배포는 이름에 " dev".
export function GET(): Response {
  const name = appDisplayName(APP_NAMES.market);
  const manifest = {
    id: "/market",
    name,
    short_name: appDisplayName("중고거래"),
    description: "이로이로 중고거래 신고·매물 관리 콘솔",
    start_url: "/market",
    scope: "/market",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffdf9",
    theme_color: "#f4a06a",
    icons: [
      { src: "/brand/market-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/market-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/market-icon-maskable-512.png",
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
