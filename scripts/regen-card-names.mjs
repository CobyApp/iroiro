#!/usr/bin/env node
// 일회성 백필 — 모든 카드 이름을 「멤버 한글명 · 시리즈 한글명」으로 재생성한다.
// 카드명은 저장값이라, 시리즈 한글명(label_i18n.ko)을 나중에 채워도 과거 이름(대개 일본어)이 남는다.
// 상품 표시명은 카드에서 실시간 오버레이하므로, 카드명만 고치면 스토어까지 함께 반영된다.
//
// 규칙(모듈 buildCardName 과 동일):
//   name = member.name || ' · ' || COALESCE(NULLIF(TRIM(series.label_i18n->>'ko'), ''), series.label)
//   member 나 series 가 없는 카드는 건드리지 않는다.
//
//   배스천 SSM 터널을 커머스 DB 로 열고:
//   DATABASE_URL='postgresql://iroiro_admin:…@127.0.0.1:5432/iroiro' \
//   node scripts/regen-card-names.mjs [--dry-run]
//
// 재실행 안전(멱등) — 이미 규칙에 맞는 이름은 그대로다.
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 가 비어 있어요 (커머스 DB URL)");

function sslFor(u) {
  const url = new URL(u);
  const mode = url.searchParams.get("sslmode");
  return !mode || mode === "disable" ? false : { rejectUnauthorized: false };
}
function strip(u) {
  const url = new URL(u);
  for (const k of ["sslmode", "sslrootcert", "uselibpqcompat"])
    url.searchParams.delete(k);
  return url.toString();
}

const NAME_EXPR = `m.name || ' · ' || COALESCE(NULLIF(TRIM(s.label_i18n->>'ko'), ''), s.label)`;

async function main() {
  const client = new pg.Client({ connectionString: strip(url), ssl: sslFor(url) });
  await client.connect();
  try {
    // 바뀔 카드 수 미리 집계.
    const { rows: pre } = await client.query(
      `SELECT count(*)::int AS n
         FROM card c
         JOIN member m ON m.id = c.member_id
         JOIN series s ON s.id = c.series_id
        WHERE c.name IS DISTINCT FROM (${NAME_EXPR})`,
    );
    const changing = pre[0]?.n ?? 0;
    console.log(`재생성 대상 카드: ${changing}장${dryRun ? " (dry-run — 변경 안 함)" : ""}`);

    if (dryRun) {
      const { rows } = await client.query(
        `SELECT c.id, c.name AS old, (${NAME_EXPR}) AS next
           FROM card c
           JOIN member m ON m.id = c.member_id
           JOIN series s ON s.id = c.series_id
          WHERE c.name IS DISTINCT FROM (${NAME_EXPR})
          ORDER BY c.id
          LIMIT 30`,
      );
      for (const r of rows) console.log(`  #${r.id}  ${r.old}  →  ${r.next}`);
      if (changing > rows.length) console.log(`  … 외 ${changing - rows.length}장`);
      return;
    }

    const res = await client.query(
      `UPDATE card c
          SET name = (${NAME_EXPR}), updated_at = now()
         FROM member m, series s
        WHERE m.id = c.member_id
          AND s.id = c.series_id
          AND c.name IS DISTINCT FROM (${NAME_EXPR})`,
    );
    console.log(`완료 — ${res.rowCount}장 재생성했어요.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
