import "server-only";

import { db } from "@/lib/db";

// 토레카 마스터(team·member·team_member·series·series_kind·card)는 커머스 DB(db)로 병합됐다
// (2026-09-23, 구 공유 카탈로그 DB iroiro_catalog 폐기). dev·prd 는 각자 자기 커머스 DB 안에서
// 토레카를 갖는다. 아래는 과거 `catalogDb`/`Catalog*Row`/`CatalogPrisma` 임포트 호환을 위한 얇은 별칭 —
// 이제 전부 커머스 클라이언트(`db` / `@prisma/client`)를 가리킨다. 이름은 `R2_*` 처럼 레거시로 유지.
// 두 클라이언트가 하나가 됐으므로 team·member·card 를 상품·주문과 같은 트랜잭션에서 다룰 수 있다.
export const catalogDb = db;

// 카탈로그 모델 타입 — 이제 커머스 스키마의 모델 타입이다.
export type {
  Card as CatalogCardRow,
  Team as CatalogTeamRow,
  Member as CatalogMemberRow,
  TeamMember as CatalogTeamMemberRow,
  Series as CatalogSeriesRow,
  SeriesKind as CatalogSeriesKindRow,
} from "@prisma/client";
export { Prisma as CatalogPrisma } from "@prisma/client";
