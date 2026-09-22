import { APP_NAMES, appDisplayName } from "@/lib/app-name";

// 게시판 관리 전용 PWA 매니페스트 — 운영 관리자(/admin)·카탈로그(/catalog)와 별개의 설치형 앱 "이로이로 게시판".
// id·scope·start_url을 /board로 두어 브라우저가 독립 앱으로 인식한다. dev 배포는 이름에 " dev".
export function GET(): Response {
  const name = appDisplayName(APP_NAMES.board);
  const manifest = {
    id: "/board",
    name,
    short_name: appDisplayName("커뮤니티"),
    description: "이로이로 커뮤니티·신고 관리 콘솔",
    start_url: "/board",
    scope: "/board",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffdf9",
    theme_color: "#2fb7a5",
    icons: [
      { src: "/brand/board-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/board-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/board-icon-maskable-512.png",
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
