import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 컨테이너 배포용 — .next/standalone에 최소 런타임을 산출한다(Dockerfile이 복사).
  output: "standalone",
  // 로컬 개발 시 좌하단에 뜨는 N 버튼(dev indicator) 숨김
  devIndicators: false,
  experimental: {
    // 사진 업로드가 서버 액션 경유(R2 CORS 회피)라 원본 크기만큼 허용.
    serverActions: { bodySizeLimit: "10mb" },
  },
  // sharp(네이티브 모듈)는 번들하지 말고 런타임에 node_modules에서 로드.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
