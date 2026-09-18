// §11 수정 잠금 동시성 — updatePost(FOR UPDATE) ↔ createComment(FOR UPDATE) 양방향 검증.
// 대기 판정은 pg_blocking_pids()로 한다(sleep 후 플래그 확인은 "아직 도착도 안 한 상태"를 통과시킨다).
// 실행: dotenv -e .env.local -- node docs/superpowers/verification/2026-07-26-posts-edit-lock/edit-lock.mjs
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

const a = new pg.Client({ connectionString: url }); // 작성자(updatePost)
const b = new pg.Client({ connectionString: url }); // 댓글 작성(createComment)
// 앱 런타임은 비특권 app 롤이고 그 GRANT에는 post·post_comment의 DELETE가 없다
// (soft delete 강제 — docs/architecture/db-authorization-review.md). 검증 자체는 app 롤로
// 돌려야 의미가 있으므로, **픽스처 정리에만** 소유자 연결을 따로 쓴다.
// DATABASE_URL에서 자격증명만 바꿔 파생한다 — 호스트·포트 중복 정의를 피하고
// 소스에 접속 문자열 리터럴을 두지 않기 위함(secretlint).
const PRIVILEGED_URL = (() => {
  if (process.env.DATABASE_URL_PRIVILEGED) return process.env.DATABASE_URL_PRIVILEGED;
  const u = new URL(url);
  u.username = "postgres";
  u.password = "postgres"; // 로컬 Supabase 고정 자격 (공개 개발 디폴트)
  return u.toString();
})();

const o = new pg.Client({ connectionString: url }); // 관찰자(잠금 대기 판정)
const c = new pg.Client({ connectionString: PRIVILEGED_URL }); // 정리 전용(특권)

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ACCOUNT = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const PREFIX = `vrf-editlock-${Date.now()}`;

const pidOf = async (client) => (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

// 지정 백엔드가 실제로 잠금 대기 중인지 관측한다. 대기 중이면 blocker pid 배열, 아니면 null.
async function blockersOf(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await o.query("SELECT pg_blocking_pids($1) AS blockers", [pid]);
    if (rows[0].blockers.length > 0) return rows[0].blockers;
    await sleep(25);
  }
  return null;
}

async function makePost(code) {
  const { rows } = await o.query(
    `INSERT INTO post (account_id, public_code, topic, title, body)
     VALUES ($1, $2, 'talk', '원제목', '원본문') RETURNING id`,
    [ACCOUNT, code],
  );
  return rows[0].id;
}
// updatePost의 ② 잠금 쿼리
const lockAsAuthor = (client, id) =>
  client.query(
    `SELECT public_code, topic, title, body, hidden_at FROM post
   WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [id, ACCOUNT],
  );
// createComment의 ① 잠금 쿼리
const lockAsCommenter = (client, id) =>
  client.query(
    `SELECT public_code FROM post
   WHERE id = $1 AND hidden_at IS NULL AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
const liveComments = async (client, id) =>
  (
    await client.query(
      `SELECT count(*)::int AS c FROM post_comment WHERE post_id = $1 AND deleted_at IS NULL`,
      [id],
    )
  ).rows[0].c;

await a.connect();
await b.connect();
await o.connect();
await c.connect();
const aPid = await pidOf(a),
  bPid = await pidOf(b);
try {
  // ── S1: update 선행 → comment 대기 → update 커밋 → comment 성공 ──────────────
  const id1 = await makePost(`${PREFIX}-s1`);
  await a.query("BEGIN");
  check("S1-1 A: 작성자 FOR UPDATE 잠금 획득", (await lockAsAuthor(a, id1)).rows.length === 1);

  let bDone = false;
  const bWork = (async () => {
    await b.query("BEGIN");
    await lockAsCommenter(b, id1); // A 커밋까지 여기서 대기
    await b.query(
      `INSERT INTO post_comment (post_id, account_id, body)
       VALUES ($1, $2, '댓글')`,
      [id1, OTHER],
    );
    await b.query("COMMIT");
    bDone = true;
  })();

  const s1Blockers = await blockersOf(bPid);
  check(
    "S1-2 B: 실제로 A의 잠금을 대기한다(pg_blocking_pids)",
    s1Blockers !== null && s1Blockers.includes(aPid),
    s1Blockers ? `blockers=${s1Blockers}` : "대기 관측 실패(5초)",
  );
  check("S1-3 B: 아직 커밋되지 않음", bDone === false);
  check("S1-4 A: 잠금 하 미삭제 댓글 0 관측 → 수정 허용", (await liveComments(a, id1)) === 0);

  await a.query(
    `UPDATE post SET title = '수정제목', edited_at = now(), updated_at = now() WHERE id = $1`,
    [id1],
  );
  await a.query("COMMIT");
  await bWork;
  check("S1-5 B: A 커밋 후 댓글 삽입 완료", bDone === true);
  const s1 = (
    await o.query(
      `SELECT p.title, p.edited_at,
            (SELECT count(*)::int FROM post_comment c WHERE c.post_id = p.id) AS comments
     FROM post p WHERE p.id = $1`,
      [id1],
    )
  ).rows[0];
  check(
    "S1-6 최종: 수정 반영 + edited_at 세팅 + 댓글 1",
    s1.title === "수정제목" && s1.edited_at !== null && s1.comments === 1,
  );

  // ── S2: comment 선행(잠금 유지) → update 대기 → comment 커밋 → update 거부 ────
  const id2 = await makePost(`${PREFIX}-s2`);
  await b.query("BEGIN");
  await lockAsCommenter(b, id2);
  await b.query(
    `INSERT INTO post_comment (post_id, account_id, body)
     VALUES ($1, $2, '선행 댓글')`,
    [id2, OTHER],
  ); // 아직 커밋하지 않는다

  let aLocked = false;
  const aWork = (async () => {
    await a.query("BEGIN");
    await lockAsAuthor(a, id2); // B 커밋까지 대기
    aLocked = true;
  })();
  const s2Blockers = await blockersOf(aPid);
  check(
    "S2-1 A: 반대 방향에서도 B의 잠금을 대기한다",
    s2Blockers !== null && s2Blockers.includes(bPid),
    s2Blockers ? `blockers=${s2Blockers}` : "대기 관측 실패(5초)",
  );
  check("S2-2 A: 아직 잠금 미획득", aLocked === false);

  await b.query("COMMIT");
  await aWork;
  check("S2-3 A: B 커밋 후 잠금 획득", aLocked === true);
  check(
    "S2-4 A: 잠금 하 미삭제 댓글 1 관측 → 수정 거부(has_comments)",
    (await liveComments(a, id2)) === 1,
  );
  await a.query("ROLLBACK"); // 앱은 DomainError("댓글이 작성된 글은 수정할 수 없습니다")
  const s2 = (await o.query(`SELECT title, edited_at FROM post WHERE id = $1`, [id2])).rows[0];
  check(
    "S2-5 최종: 본문 미수정 + edited_at null 유지",
    s2.title === "원제목" && s2.edited_at === null,
  );

  // ── S3 음성대조: FOR UPDATE를 빼면 대기가 사라진다(위 대기가 잠금 때문임을 확인) ──
  const id3 = await makePost(`${PREFIX}-s3`);
  await b.query("BEGIN");
  await lockAsCommenter(b, id3);
  const plain = await a.query(`SELECT title FROM post WHERE id = $1`, [id3]); // 즉시 반환
  check("S3-1 음성대조: 잠금 없는 읽기는 대기하지 않는다", plain.rows.length === 1);
  const idle = (await o.query("SELECT pg_blocking_pids($1) AS b", [aPid])).rows[0].b;
  check("S3-2 음성대조: A는 대기 상태가 아니다", idle.length === 0, `blockers=${idle}`);
  await b.query("ROLLBACK");
} finally {
  // 세션 tx 종료와 데이터 정리를 서로 독립적으로 처리한다(하나가 실패해도 나머지는 수행).
  for (const client of [a, b]) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* 진행 중 tx 없음 */
    }
  }
  try {
    await c.query(
      `DELETE FROM post_comment WHERE post_id IN (SELECT id FROM post WHERE public_code LIKE $1)`,
      [`${PREFIX}%`],
    );
    await c.query(`DELETE FROM post WHERE public_code LIKE $1`, [`${PREFIX}%`]);
  } finally {
    await Promise.allSettled([a.end(), b.end(), o.end(), c.end()]);
  }
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
