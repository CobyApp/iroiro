#!/usr/bin/env node
// 스키마 마이그레이션 러너 — 배포 파이프라인이 ECS 원오프 태스크로 실행한다(deploy.yml → run-task).
//
//   대상   커머스 DB  db/schema.sql  ← DATABASE_URL_OWNER (토레카 마스터도 여기로 병합됨)
//   기록   DB 의 schema_migration(name, applied_at, checksum) — 파일의 `-- [name]` 섹션 단위
//   동작   DB 에 없는 섹션을 파일 순서대로, 섹션마다 한 트랜잭션으로 적용한다.
//
//   node scripts/db-migrate.mjs                      # 대기 섹션 적용 (MIGRATE_TARGETS 기본 commerce)
//   node scripts/db-migrate.mjs --dry-run            # 적용 없이 대기 목록만
//   node scripts/db-migrate.mjs --baseline [--except a,b] --target commerce
//                                                     # 이미 손으로 적용된 DB 에 현재 섹션을 전부 "적용됨"으로 기록
//                                                     # (except 는 미적용으로 남김 → 다음 실행에서 적용)
//
// 소유자 롤로 붙는다(DDL·GRANT). 앱 롤(app)로는 실행하지 않는다.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { baselineNames, pendingSections, splitSections } from "./lib/schema-sections.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = {
  commerce: { file: "db/schema.sql", urlEnv: "DATABASE_URL_OWNER" },
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = flag("--dry-run");
const baseline = flag("--baseline");
const except = (opt("--except") ?? "").split(",").filter(Boolean);
const targetNames = (opt("--target") ?? process.env.MIGRATE_TARGETS ?? "commerce")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function sslFor(url) {
  // RDS 는 sslmode=require/verify-full 로 온다. 컨테이너에는 CA 번들(/app/rds-ca.pem, Dockerfile)이 있어
  // 있으면 검증까지 한다. 로컬(sslmode 없음)은 평문.
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  if (!mode || mode === "disable") return false;
  const caPath = u.searchParams.get("sslrootcert") ?? "/app/rds-ca.pem";
  if (existsSync(caPath)) return { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") };
  // CA 번들이 없으면 암호화만 하고 검증은 못 한다 — 조용히 넘기지 않고 알린다(운영 이미지는 항상 CA 를 포함).
  console.warn(`  ! CA 번들(${caPath}) 없음 — TLS 검증 없이 접속(암호화만). 운영에서는 보이면 안 되는 경고`);
  return { rejectUnauthorized: false };
}

function stripSslParams(url) {
  const u = new URL(url);
  for (const k of ["sslmode", "sslrootcert", "uselibpqcompat"]) u.searchParams.delete(k);
  return u.toString();
}

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: stripSslParams(url), ssl: sslFor(url) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum   TEXT
    );
    COMMENT ON TABLE schema_migration IS '적용된 스키마 섹션(-- [name]) 기록 — scripts/db-migrate.mjs';
  `);
}

const checksum = (sql) => createHash("sha256").update(sql).digest("hex").slice(0, 16);

async function runTarget(name) {
  const target = TARGETS[name];
  // 알 수 없는 대상은 던지지 않고 건너뛴다 — 토레카 카탈로그가 커머스 DB로 병합되며 'catalog'
  // 대상이 사라졌으나, 배포된 ECS 마이그레이트 태스크 정의에 MIGRATE_TARGETS=commerce,catalog 가
  // 남아 있을 수 있다(다음 setup.sh migrate 재등록 전까지). 그 잔재로 배포가 깨지지 않게 방어.
  if (!target) {
    console.warn(`▸ ${name}: 알 수 없는 대상 — 건너뜀(구 태스크 정의 잔재일 수 있음)`);
    return;
  }
  const url = process.env[target.urlEnv];
  if (!url) throw new Error(`${target.urlEnv} 가 비어 있어요`);
  const sections = splitSections(readFileSync(path.join(ROOT, target.file), "utf8"));
  const dbName = new URL(url).pathname.replace(/^\//, "");
  console.log(`▸ ${name}: ${target.file} (${sections.length} sections) → ${dbName}`);

  await withClient(url, async (client) => {
    await ensureTable(client);
    const { rows } = await client.query("SELECT name FROM schema_migration");
    const applied = rows.map((r) => r.name);

    if (baseline) {
      const names = baselineNames(sections, except).filter((n) => !applied.includes(n));
      if (dryRun) {
        console.log(`  baseline (dry-run): ${names.length} sections → ${names.join(", ")}`);
        return;
      }
      for (const n of names) {
        const s = sections.find((x) => x.name === n);
        await client.query(
          "INSERT INTO schema_migration (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
          [n, checksum(s.sql)],
        );
      }
      console.log(`  ✓ baseline 기록 ${names.length}개 (미적용으로 남김: ${except.join(", ") || "없음"})`);
      return;
    }

    const pending = pendingSections(sections, applied);
    if (pending.length === 0) {
      console.log("  ✓ 대기 섹션 없음");
      return;
    }
    console.log(`  대기 ${pending.length}개: ${pending.map((s) => s.name).join(", ")}`);
    if (dryRun) return;

    for (const s of pending) {
      const started = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(s.sql);
        await client.query(
          "INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)",
          [s.name, checksum(s.sql)],
        );
        await client.query("COMMIT");
        console.log(`  ✓ ${s.name} (${Date.now() - started}ms)`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`  ✗ ${s.name} 실패 — 롤백`);
        throw error;
      }
    }
  });
}

try {
  for (const name of targetNames) await runTarget(name);
  console.log("done");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
