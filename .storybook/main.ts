import type { StorybookConfig } from "@storybook/react-vite";
import { resolve } from "node:path";

const config: StorybookConfig = {
  stories: [
    "../components/**/*.stories.@(ts|tsx)",
    "../modules/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (viteConfig) => {
    viteConfig.resolve = viteConfig.resolve ?? {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      // 앱과 동일한 "@/..." 경로 별칭 (tsconfig paths와 일치)
      "@": resolve(process.cwd()),
    };
    return viteConfig;
  },
};

export default config;
