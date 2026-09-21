import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// 카탈로그 DB(iroiro_catalog) 전용 Prisma 설정 — 커머스 DB(prisma.config.ts)와 데이터베이스가 다르다.
// 사용: prisma generate --config prisma.catalog.config.ts / prisma db pull --config prisma.catalog.config.ts
export default defineConfig({
  schema: "prisma/catalog.prisma",
  migrations: {
    path: "prisma/catalog-migrations",
  },
  datasource: {
    url: env("CATALOG_DATABASE_URL"),
  },
});
