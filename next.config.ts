import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 로컬 개발 시 좌하단에 뜨는 N 버튼(dev indicator) 숨김
  devIndicators: false,
  experimental: {
    // 사진 업로드가 서버 액션 경유(R2 CORS 회피)라 원본 크기만큼 허용.
    serverActions: { bodySizeLimit: "10mb" },
  },
  // sharp(네이티브 모듈)는 번들하지 말고 런타임에 node_modules에서 로드.
  serverExternalPackages: ["sharp"],
  // Vercel 서버리스 함수 트레이싱이 sharp가 dlopen하는 libvips .so를 자동 포함하지
  // 못해 linux 런타임에서 로드 실패(libvips-cpp.so ... cannot open)했다.
  // /media 라우트 함수에 linux 네이티브 바이너리를 강제 포함한다.
  // (로컬 macOS엔 해당 경로가 없어 no-op, Vercel linux 빌드에서만 실제 포함)
  outputFileTracingIncludes: {
    "/media/product-photos/[photoId]/[variant]/[signature]": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/media/product-thumbnails/[productId]/[variant]/[signature]": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/media/post-photos/[photoId]/[signature]": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
  },
};

export default nextConfig;
