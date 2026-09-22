#!/usr/bin/env node
// 일회성 데이터 이관 — 구 공유 카탈로그 DB(iroiro_catalog) → 커머스 DB 로 토레카 마스터를 복사한다(id 보존).
// 토레카 마스터가 커머스 DB 로 병합되면서(2026-09-23), 기존에 쌓인 카탈로그 데이터를 옮긴다.
//
//   SOURCE: 구 카탈로그 DB (소유자 롤)  — 환경변수 CATALOG_SRC_URL
//   TARGET: 커머스 DB (소유자 롤)       — 환경변수 DATABASE_URL_OWNER
//
//   예) 배스천 SSM 터널을 두 DB 로 각각 열고:
//   CATALOG_SRC_URL='postgresql://iroiro_admin:…@127.0.0.1:5433/iroiro_catalog' \
//   DATABASE_URL_OWNER='postgresql://iroiro_admin:…@127.0.0.1:5432/iroiro' \
//   node scripts/migrate-catalog-data.mjs [--dry-run]
//
// id 를 그대로 INSERT(ON CONFLICT (id) DO NOTHING) 하므로 재실행 안전하고, 커머스의 상품·게시글이
// 들고 있던 team_id/member_id/series_id/card_id 참조가 그대로 유효하다. 복사 후 각 테이블의
// IDENTITY 시퀀스를 max(id)+1 로 맞춰 이후 신규 INSERT 의 id 충돌을 막는다.
import pg from "pg";

const TABLES = ["team", "member", "team_member", "series_kind", "series", "card"];
const dryRun = process.argv.includes("--dry-run");

const srcUrl = process.env.CATALOG_SRC_URL;
const dstUrl = process.env.DATABASE_URL_OWNER;
if (!srcUrl) throw new Error("CATALOG_SRC_URL 가 비어 있어요 (구 카탈로그 DB 소유자 URL)");
if (!dstUrl) throw new Error("DATABASE_URL_OWNER 가 비어 있어요 (커머스 DB 소유자 URL)");

function sslFor(url) {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  return !mode || mode === "disable" ? false : { rejectUnauthorized: false };
}
function strip(url) {
  const u = new URL(url);
  for (const k of ["sslmode", "sslrootcert", "uselibpqcompat"]) u.searchParams.delete(k);
  return u.toString();
}
const client = (url) => new pg.Client({ connectionString: strip(url), ssl: sslFor(url) });

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function copyTable(src, dst, table) {
  const { rows } = await src.query(`SELECT * FROM ${ident(table)} ORDER BY id`);
  if (rows.length === 0) {
    console.log(`  · ${table}: 원본 0행 — 건너뜀`);
    return 0;
  }
  const cols = Object.keys(rows[0]);
  const colList = cols.map(ident).join(", ");
  if (dryRun) {
    console.log(`  · ${table}: ${rows.length}행 복사 예정 (dry-run)`);
    return 0;
  }
  let inserted = 0;
  for (const row of rows) {
    const values = cols.map((c) => row[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const res = await dst.query(
      `INSERT INTO ${ident(table)} (${colList}) VALUES (${placeholders})
       ON CONFLICT (id) DO NOTHING`,
      values,
    );
    inserted += res.rowCount ?? 0;
  }
  // IDENTITY 시퀀스를 max(id) 에 맞춰 이후 신규 INSERT 가 기존 id 와 충돌하지 않게 한다.
  await dst.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${ident(table)}), 1), true)`,
  );
  console.log(`  ✓ ${table}: 원본 ${rows.length}행 → 신규 ${inserted}행 삽입(중복 제외), 시퀀스 정렬`);
  return inserted;
}

async function main() {
  const src = client(srcUrl);
  const dst = client(dstUrl);
  await src.connect();
  await dst.connect();
  try {
    const srcDb = new URL(srcUrl).pathname.replace(/^\//, "");
    const dstDb = new URL(dstUrl).pathname.replace(/^\//, "");
    console.log(`▸ 카탈로그 이관: ${srcDb} → ${dstDb}${dryRun ? " (dry-run)" : ""}`);
    for (const t of TABLES) await copyTable(src, dst, t);
    console.log("done");
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
