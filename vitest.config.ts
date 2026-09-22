import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // .claude/worktrees(에이전트 격리 사본)의 중첩 테스트를 스캔하지 않는다 — 중복·오탐 방지.
    exclude: [...configDefaults.exclude, ".claude/**"],
    setupFiles: ["./tests/setup.ts"],
    // OAuth 자격증명은 필수(required)라, env.ts를 로드하는 모든 테스트가
    // 통과하도록 더미값을 전역 주입한다. 개별 테스트는 stubEnv로 덮어쓸 수 있다.
    env: {
      KAKAO_REST_API_KEY: "test-kakao-key",
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
