import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// KST 변환 단일 진실(lib/datetime.ts) 우회 차단.
// 사용자에게 보이는 모든 날짜·시간 표시는 헬퍼를 거쳐야 한다.
// `components/ui/*`는 shadcn vendored — test-policy에서도 면제 처리.
const DATETIME_IMPL_FILES = [
  "lib/datetime.ts",
  "tests/lib/datetime.test.ts",
  "components/ui/**",
];

const datetimeGuardRule = {
  "no-restricted-syntax": [
    "error",
    {
      selector:
        "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
      message:
        "Intl.DateTimeFormat은 lib/datetime.ts 내부에서만 사용하세요 — 표시용은 lib/datetime의 formatKstDate / formatKstDateTime / formatKstRelative.",
    },
    {
      selector: "CallExpression[callee.property.name='toLocaleDateString']",
      message:
        "Date#toLocaleDateString 금지 — lib/datetime의 formatKstDate를 사용하세요 (KST 단일 진실).",
    },
    {
      selector: "CallExpression[callee.property.name='toLocaleTimeString']",
      message:
        "Date#toLocaleTimeString 금지 — lib/datetime의 formatKstDateTime을 사용하세요.",
    },
    {
      selector:
        "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
      message:
        "toISOString().slice(...)는 UTC를 노출합니다 — lib/datetime의 formatKstDate / todayKstYmd를 사용하세요.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Storybook build output.
    "storybook-static/**",
    // Prisma generated clients (catalog DB) — npm run db:generate output.
    "lib/generated/**",
  ]),
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: DATETIME_IMPL_FILES,
    rules: datetimeGuardRule,
  },
]);

export default eslintConfig;
