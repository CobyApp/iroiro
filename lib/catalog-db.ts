import "server-only";

import { PrismaClient } from "@/lib/generated/catalog-client";
import { PrismaPg } from "@prisma/adapter-pg";

// 카탈로그 DB(iroiro_catalog) 클라이언트 — 토레카 마스터(team·member·team_member·series·series_kind·card).
// dev·prd 가 같은 DB 를 공유하므로 커머스 DB(lib/db.ts 의 `db`)와 연결·클라이언트를 분리한다.
// 커머스 테이블(product·favorite·post…)은 카탈로그 id 를 값으로만 들고 있어 두 클라이언트 사이에
// 조인은 없다 — 이름이 필요하면 id 목록으로 catalogDb 에서 따로 조회해 앱에서 합친다.
// BigInt JSON polyfill 은 lib/db.ts 가 이미 설치한다(같은 프로세스).

const adapter = new PrismaPg({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

const catalogClientSingleton = () => new PrismaClient({ adapter });

declare const globalThis: {
  __prismaCatalogGlobal?: ReturnType<typeof catalogClientSingleton>;
} & typeof global;

export const catalogDb =
  globalThis.__prismaCatalogGlobal ?? catalogClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaCatalogGlobal = catalogDb;
}

// 카탈로그 모델 타입 — 도메인 transform 이 `@prisma/client` 대신 여기서 가져온다.
export type {
  Card as CatalogCardRow,
  Team as CatalogTeamRow,
  Member as CatalogMemberRow,
  TeamMember as CatalogTeamMemberRow,
  Series as CatalogSeriesRow,
  SeriesKind as CatalogSeriesKindRow,
} from "@/lib/generated/catalog-client";
export { Prisma as CatalogPrisma } from "@/lib/generated/catalog-client";
