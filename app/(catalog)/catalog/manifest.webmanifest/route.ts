// 카탈로그 전용 PWA 매니페스트 — 운영 관리자(/admin)·소비자앱과 별개의 설치형 웹앱.
// id·scope·start_url을 /catalog로 두어 브라우저가 독립 앱("이로이로 카탈로그")으로 인식한다.
export function GET(): Response {
  const manifest = {
    id: "/catalog",
    name: "이로이로 카탈로그",
    short_name: "이로 카탈로그",
    description: "이로이로 토레카 카탈로그 관리 콘솔",
    start_url: "/catalog",
    scope: "/catalog",
    display: "standalone",
    orientation: "portrait",
    background_color: "#211B34",
    theme_color: "#211B34",
    icons: [
      {
        src: "/brand/admin-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/admin-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/admin-icon-maskable-512.png",
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
