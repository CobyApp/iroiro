import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // OAuth 자격증명은 필수(required)라, env.ts를 로드하는 모든 테스트가
    // 통과하도록 더미값을 전역 주입한다. 개별 테스트는 stubEnv로 덮어쓸 수 있다.
    env: {
      KAKAO_REST_API_KEY: "test-kakao-key",
      NAVER_CLIENT_ID: "test-naver-id",
      NAVER_CLIENT_SECRET: "test-naver-secret",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
});
