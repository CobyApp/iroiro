import { APP_NAMES, appDisplayName } from "@/lib/app-name";

// 배송 관리 전용 PWA 매니페스트 — 독립 설치형 앱 "이로이로 배송". dev 배포는 이름에 " dev".
export function GET(): Response {
  const name = appDisplayName(APP_NAMES.delivery);
  const manifest = {
    id: "/delivery",
    name,
    short_name: appDisplayName("스토어"),
    description: "이로이로 스토어 상품·주문·정산·배송 관리 콘솔",
    start_url: "/delivery",
    scope: "/delivery",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffdf9",
    theme_color: "#93dcf8",
    icons: [
      { src: "/brand/delivery-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/delivery-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/delivery-icon-maskable-512.png",
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
