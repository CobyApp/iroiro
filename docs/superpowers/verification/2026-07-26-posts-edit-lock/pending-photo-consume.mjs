// 대기 사진 원자 소비 SQL의 실 DB 검증(P1-5) — 단위 테스트는 $queryRaw를 mock하므로
// 소유권·미소비·미만료 조건이 SQL에서 빠져도 통과한다. 여기서 실제 조건과 직렬화를 확인한다.
// 실행: dotenv -e .env.local -- node docs/superpowers/verification/2026-07-26-posts-edit-lock/pending-photo-consume.mjs
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 필요 — dotenv -e .env.local 로 실행");
  process.exit(2);
}
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("로컬 DB에서만 실행");
  process.exit(2);
}

const x = new pg.Client({ connectionString: url });
const y = new pg.Client({ connectionString: url });
const o = new pg.Client({ connectionString: url });

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const PREFIX = `posts/tmp/vrf-pending-${Date.now()}`;

// pending-photo.consumePendingPhotos와 동일한 술어 집합(Prisma의 IN 대신 = ANY — 의미 동일).
const CONSUME_SQL = `
  UPDATE pending_post_photo
  SET consumed_at = now(), updated_at = now()
  WHERE id = ANY($1::bigint[])
    AND account_id = $2::uuid
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING id, r2_key, content_type, size_bytes`;

const pidOf = async (client) => (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
async function blockersOf(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await o.query("SELECT pg_blocking_pids($1) AS blockers", [pid]);
    if (rows[0].blockers.length > 0) return rows[0].blockers;
    await sleep(25);
  }
  return null;
}
async function makePending({ account = OWNER, minutes = 10, consumed = false, suffix }) {
  const { rows } = await o.query(
    `INSERT INTO pending_post_photo (account_id, r2_key, content_type, size_bytes, expires_at, consumed_at)
     VALUES ($1, $2, 'image/jpeg', 1024, now() + ($3 || ' minutes')::interval, $4)
     RETURNING id`,
    [account, `${PREFIX}-${suffix}.jpg`, String(minutes), consumed ? new Date() : null],
  );
  return rows[0].id;
}
const isConsumed = async (id) =>
  (await o.query(`SELECT consumed_at FROM pending_post_photo WHERE id = $1`, [id])).rows[0]
    .consumed_at !== null;

await x.connect();
await y.connect();
await o.connect();
const xPid = await pidOf(x),
  yPid = await pidOf(y);
const before = (
  await o.query(`SELECT count(*)::int AS c FROM pending_post_photo WHERE r2_key LIKE $1`, [
    `${PREFIX}%`,
  ])
).rows[0].c;
try {
  // C1 정상 — 본인·미소비·미만료
  const ok1 = await makePending({ suffix: "c1" });
  const r1 = await x.query(CONSUME_SQL, [[ok1], OWNER]);
  check("C1 본인·미소비·미만료 대기 사진은 소비된다", r1.rowCount === 1 && (await isConsumed(ok1)));

  // C2 타 계정 소유권 거부
  const other = await makePending({ account: OTHER, suffix: "c2" });
  const r2 = await x.query(CONSUME_SQL, [[other], OWNER]);
  check("C2 타 계정 대기 사진은 거부된다", r2.rowCount === 0 && !(await isConsumed(other)));

  // C3 만료 거부
  const expired = await makePending({ minutes: -1, suffix: "c3" });
  const r3 = await x.query(CONSUME_SQL, [[expired], OWNER]);
  check("C3 만료 대기 사진은 거부된다", r3.rowCount === 0 && !(await isConsumed(expired)));

  // C4 재소비 거부
  const used = await makePending({ consumed: true, suffix: "c4" });
  const r4 = await x.query(CONSUME_SQL, [[used], OWNER]);
  check("C4 이미 소비된 대기 사진은 재소비되지 않는다", r4.rowCount === 0);

  // C5 다건 중 하나라도 조건 불충족 → 전건 롤백(앱은 rowCount !== 요청수면 throw)
  const good = await makePending({ suffix: "c5-good" });
  const bad = await makePending({ minutes: -1, suffix: "c5-expired" });
  await x.query("BEGIN");
  const r5 = await x.query(CONSUME_SQL, [[good, bad], OWNER]);
  const partial = r5.rowCount !== 2;
  await x.query("ROLLBACK"); // 앱의 throw → tx 롤백과 동일
  check(
    "C5 다건 부분 실패는 전건 롤백된다(정상 대기 사진도 미소비 유지)",
    partial && !(await isConsumed(good)),
    `rowCount=${r5.rowCount}`,
  );

  // C6 동시 소비 — 정확히 한 세션만 성공
  const raced = await makePending({ suffix: "c6" });
  await x.query("BEGIN");
  const first = await x.query(CONSUME_SQL, [[raced], OWNER]);
  let second = null;
  const yWork = (async () => {
    await y.query("BEGIN");
    second = await y.query(CONSUME_SQL, [[raced], OWNER]); // x 커밋까지 행 잠금 대기
    await y.query("COMMIT");
  })();
  const blockers = await blockersOf(yPid);
  check(
    "C6-1 두 번째 세션은 첫 세션의 행 잠금을 대기한다",
    blockers !== null && blockers.includes(xPid),
    blockers ? `blockers=${blockers}` : "대기 관측 실패(5초)",
  );
  await x.query("COMMIT");
  await yWork;
  check(
    "C6-2 동시 소비에서 정확히 한 세션만 성공",
    first.rowCount === 1 && second.rowCount === 0,
    `first=${first.rowCount} second=${second.rowCount}`,
  );
} finally {
  for (const client of [x, y]) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* 진행 중 tx 없음 */
    }
  }
  try {
    await o.query(`DELETE FROM pending_post_photo WHERE r2_key LIKE $1`, [`${PREFIX}%`]);
    const after = (
      await o.query(`SELECT count(*)::int AS c FROM pending_post_photo WHERE r2_key LIKE $1`, [
        `${PREFIX}%`,
      ])
    ).rows[0].c;
    check("C7 픽스처 정리 — 시작·종료 상태 동일", after === before, `before=${before} after=${after}`);
  } finally {
    await Promise.allSettled([x.end(), y.end(), o.end()]);
  }
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
