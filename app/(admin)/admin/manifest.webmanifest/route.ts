// 관리자 전용 PWA 매니페스트 — 소비자앱(app/manifest.ts)과 별개의 설치형 웹앱.
// 이름·아이콘·테마를 달리해 홈 화면에 "이로이로 관리자"로 따로 설치된다.
// id·scope·start_url을 /admin으로 두어 브라우저가 독립 앱으로 인식한다.
import { APP_NAMES, appDisplayName } from "@/lib/app-name";

export function GET(): Response {
  const manifest = {
    id: "/admin",
    name: appDisplayName(APP_NAMES.admin),
    short_name: appDisplayName("이로 관리자"),
    description: "이로이로 운영 관리자 콘솔",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    orientation: "portrait",
    // 밝은 UI(크림 배경) 기준 — app/(admin)/layout.tsx viewport.themeColor와 동일하게 유지.
    background_color: "#fffdf9",
    theme_color: "#fffdf9",
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
