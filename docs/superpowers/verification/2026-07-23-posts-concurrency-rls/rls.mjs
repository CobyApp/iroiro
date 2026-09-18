// RLS 백스톱 검증 — 신고 2테이블(post_report / post_comment_report).
//
// 배경: 앱은 현재 owner 롤(postgres, BYPASSRLS)로 접속 → RLS는 "정의만 되고 우회됨"
// (init_catalog 마이그레이션 주석). 이 스크립트는 앱을 비특권 `app` 롤로 전환했을 때
// 정책이 의도대로 강제되는지를 `SET ROLE app` + GUC 주입으로 실증한다.
//   · 본인 = current_account_id() ← app.current_account_id GUC
//   · admin = is_admin()          ← app.is_admin GUC
//   · GUC 미설정 = fail-closed(NULL/false)
//
// 실행: ./node_modules/.bin/dotenv -e .env.local -- node docs/.../rls.mjs
import pg from "pg";
const { Client } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 필요 — 실행: ./node_modules/.bin/dotenv -e .env.local -- node <this>");
  process.exit(2);
}

// 안전장치: 이 스크립트는 GRANT·INSERT를 수행하므로 로컬/개발 DB에만 실행한다(운영 오조작 방지).
const dbHost = new URL(url.replace(/^postgres(ql)?:\/\//, "http://")).hostname;
if (!["127.0.0.1", "localhost", "::1", ""].includes(dbHost)) {
  console.error(`거부: DATABASE_URL host=${dbHost} — 로컬(127.0.0.1/localhost)만 허용`);
  process.exit(2);
}

// 고정 sentinel UUID(유효 hex) — 멱등 정리(재실행 안전).
const A = "00000000-0000-0000-0000-00000000a1a1"; // alice
const B = "00000000-0000-0000-0000-00000000b0b0"; // bob
const ADM = "00000000-0000-0000-0000-00000000ad30"; // admin
const OWN = "00000000-0000-0000-0000-00000000c0e0"; // post 작성자
const SENT = "zzrls_probe";

let pass = 0;
let fail = 0;
const results = [];
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  results.push({ case: name, result: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const c = new Client({ connectionString: url });
await c.connect();

async function cleanup() {
  await c.query(`DELETE FROM post_comment_report WHERE reporter_account_id = ANY($1::uuid[])`, [[A, B, ADM]]);
  await c.query(`DELETE FROM post_report WHERE reporter_account_id = ANY($1::uuid[])`, [[A, B, ADM]]);
  await c.query(`DELETE FROM post_comment WHERE author_code = $1`, [SENT]);
  await c.query(`DELETE FROM post WHERE author_code = $1`, [SENT]);
}

// tx 안에서 app 롤 + GUC로 fn 실행 후 무조건 ROLLBACK (격리).
async function asApp({ account, admin }, fn) {
  await c.query("BEGIN");
  try {
    await c.query(`SELECT set_config('app.current_account_id', $1, true)`, [account ?? ""]);
    await c.query(`SELECT set_config('app.is_admin', $1, true)`, [admin ? "true" : "false"]);
    await c.query("SET LOCAL ROLE app");
    return await fn();
  } finally {
    await c.query("ROLLBACK");
  }
}

// 오류를 코드로 잡는 헬퍼.
async function expectError(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return { code: e.code, message: e.message };
  }
}

// app→postgres membership 전체 행(grantor별 admin/inherit/set)을 스냅샷한다.
// membership은 (roleid, member, grantor)로 여러 행이 될 수 있어(supabase_admin·postgres 등)
// 단일 rows[0]·set_option만 보면 부정확 — 전체 집합을 비교해야 완전 원복을 증명할 수 있다.
async function membershipRows() {
  const r = await c.query(
    `SELECT grantor::regrole::text AS grantor, admin_option, inherit_option, set_option
       FROM pg_auth_members
      WHERE roleid = 'app'::regrole AND member = 'postgres'::regrole
      ORDER BY grantor::regrole::text`,
  );
  return r.rows;
}
const snapKey = (rows) =>
  JSON.stringify(rows.map((r) => [r.grantor, r.admin_option, r.inherit_option, r.set_option]));

const beforeRows = await membershipRows();
const beforeKey = snapKey(beforeRows);
const myRowBefore = beforeRows.find((r) => r.grantor === "postgres") ?? null;
// SET 가능 여부 = 어느 grantor 행이든 set_option=true (bool_or 집계).
const canSetRole = beforeRows.some((r) => r.set_option === true);
let restore = null; // "revoke_membership"(신규 행 제거) | "revoke_set"(옵션만 원복) | null

try {
  if (!canSetRole) {
    // 하네스 전용: postgres가 `SET ROLE app`으로 app을 재현하도록 SET 옵션 부여(grantor=postgres).
    // 기존 postgres-grantor 행이 없었으면 신규 행 생성, 있었으면 set만 켠다. 앱 런타임과 무관.
    await c.query("GRANT app TO postgres WITH SET TRUE");
    restore = myRowBefore ? "revoke_set" : "revoke_membership";
  }

  await cleanup();

  // ── 시드 (postgres = BYPASSRLS로 삽입) ──────────────────────────────────
  const post = await c.query(
    `INSERT INTO post (account_id, public_code, topic, title, body, author_name, author_code)
     VALUES ($1, $2, 'talk', 'RLS probe', 'body', 'owner', $3) RETURNING id`,
    [OWN, `${SENT}_p1`, SENT],
  );
  const postId = post.rows[0].id;
  const cmt = await c.query(
    `INSERT INTO post_comment (post_id, account_id, body, author_name, author_code)
     VALUES ($1, $2, 'cmt', 'owner', $3) RETURNING id`,
    [postId, OWN, SENT],
  );
  const commentId = cmt.rows[0].id;
  // 두 번째 대상 — "본인 INSERT 허용"(R1/CR1)용, 사전 신고 없음(unique 충돌 방지).
  const post2 = await c.query(
    `INSERT INTO post (account_id, public_code, topic, title, body, author_name, author_code)
     VALUES ($1, $2, 'talk', 'RLS probe 2', 'body', 'owner', $3) RETURNING id`,
    [OWN, `${SENT}_p2`, SENT],
  );
  const postId2 = post2.rows[0].id;
  const cmt2 = await c.query(
    `INSERT INTO post_comment (post_id, account_id, body, author_name, author_code)
     VALUES ($1, $2, 'cmt2', 'owner', $3) RETURNING id`,
    [postId2, OWN, SENT],
  );
  const commentId2 = cmt2.rows[0].id;
  // 기존 신고: alice·bob 각각 1건 (SELECT 가시성/UPDATE 대상).
  await c.query(
    `INSERT INTO post_report (post_id, reporter_account_id, reason, snapshot)
     VALUES ($1,$2,'spam','{}'::jsonb), ($1,$3,'abuse','{}'::jsonb)`,
    [postId, A, B],
  );
  await c.query(
    `INSERT INTO post_comment_report (comment_id, reporter_account_id, reason, snapshot)
     VALUES ($1,$2,'spam','{}'::jsonb)`,
    [commentId, A],
  );

  const roleCheck = await c.query("SELECT rolbypassrls FROM pg_roles WHERE rolname='app'");
  console.log(`\n[precondition] app.rolbypassrls = ${roleCheck.rows[0].rolbypassrls} (기대: false)\n`);

  // ── post_report ─────────────────────────────────────────────────────────
  console.log("── post_report ──");

  // R1: 본인 신고 INSERT ... RETURNING 허용 — Prisma create()의 실제 반환 경로까지 검증.
  await asApp({ account: A }, async () => {
    let rows = null;
    const err = await expectError(async () => {
      const r = await c.query(
        `INSERT INTO post_report (post_id, reporter_account_id, reason, snapshot)
         VALUES ($1,$2,'other','{}'::jsonb) RETURNING id`,
        [postId2, A],
      );
      rows = r.rows;
    });
    check(
      "R1 app+GUC(alice): 본인 신고 INSERT ... RETURNING 1행",
      err === null && rows?.length === 1,
      err ? `${err.code} ${err.message}` : `rows=${rows?.length}`,
    );
  });

  // R2: 타인 명의 INSERT 차단 (WITH CHECK)
  await asApp({ account: A }, async () => {
    const err = await expectError(() =>
      c.query(
        `INSERT INTO post_report (post_id, reporter_account_id, reason, snapshot)
         VALUES ($1,$2,'other','{}'::jsonb)`,
        [postId, B],
      ),
    );
    check(
      "R2 app+GUC(alice): 타인(bob) 명의 INSERT 차단",
      err?.code === "42501",
      err ? `${err.code} ${err.message}` : "차단 안 됨(삽입 성공)",
    );
  });

  // R3: GUC 미설정 = fail-closed → 본인 INSERT도 차단
  await asApp({ account: "" }, async () => {
    const err = await expectError(() =>
      c.query(
        `INSERT INTO post_report (post_id, reporter_account_id, reason, snapshot)
         VALUES ($1,$2,'other','{}'::jsonb)`,
        [postId, A],
      ),
    );
    check("R3 app+GUC 미설정: INSERT fail-closed 차단", err?.code === "42501", err ? `${err.code}` : "차단 안 됨");
  });

  // R4: 비admin SELECT = 본인 것만
  await asApp({ account: A }, async () => {
    const r = await c.query(`SELECT reporter_account_id FROM post_report WHERE post_id=$1`, [postId]);
    const ids = r.rows.map((x) => x.reporter_account_id);
    check(
      "R4 app+GUC(alice) 비admin SELECT: 본인 신고만 노출",
      ids.length === 1 && ids[0] === A,
      `보임=${JSON.stringify(ids)}`,
    );
  });

  // R5: admin SELECT = 전부
  await asApp({ account: ADM, admin: true }, async () => {
    const r = await c.query(`SELECT reporter_account_id FROM post_report WHERE post_id=$1`, [postId]);
    check("R5 app+GUC(admin) SELECT: 전체 신고 노출", r.rows.length === 2, `보임 ${r.rows.length}건(기대 2)`);
  });

  // R6: GUC 미설정 SELECT = 0행
  await asApp({ account: "" }, async () => {
    const r = await c.query(`SELECT 1 FROM post_report WHERE post_id=$1`, [postId]);
    check("R6 app+GUC 미설정 SELECT: 0행(fail-closed)", r.rows.length === 0, `보임 ${r.rows.length}건`);
  });

  // R7: 비admin UPDATE = 0행 (본인 신고여도 admin만 UPDATE 정책)
  await asApp({ account: A }, async () => {
    const r = await c.query(
      `UPDATE post_report SET resolution='dismissed', resolved_by=$1, resolved_at=now(), updated_at=now()
       WHERE post_id=$2 AND reporter_account_id=$1`,
      [A, postId],
    );
    check("R7 app+GUC(alice) 비admin UPDATE: 0행(정책 차단)", r.rowCount === 0, `영향 ${r.rowCount}행`);
  });

  // R8: admin UPDATE = 반영
  await asApp({ account: ADM, admin: true }, async () => {
    const r = await c.query(
      `UPDATE post_report SET resolution='actioned', resolved_by=$1, resolved_at=now(), updated_at=now()
       WHERE post_id=$2`,
      [ADM, postId],
    );
    check("R8 app+GUC(admin) UPDATE: 반영", r.rowCount === 2, `영향 ${r.rowCount}행(기대 2)`);
  });

  // R9: admin이라도 GRANT 밖 컬럼 UPDATE는 권한 거부
  await asApp({ account: ADM, admin: true }, async () => {
    const err = await expectError(() =>
      c.query(`UPDATE post_report SET reporter_account_id=$1 WHERE post_id=$2`, [B, postId]),
    );
    check(
      "R9 app+GUC(admin) 미허용 컬럼 UPDATE: 권한 거부",
      err?.code === "42501",
      err ? `${err.code}` : "거부 안 됨",
    );
  });

  // R10: DELETE = 테이블 권한 없음
  await asApp({ account: ADM, admin: true }, async () => {
    const err = await expectError(() => c.query(`DELETE FROM post_report WHERE post_id=$1`, [postId]));
    check("R10 app+GUC(admin) DELETE: 권한 거부(GRANT 없음)", err?.code === "42501", err ? `${err.code}` : "거부 안 됨");
  });

  // ── post_comment_report (핵심 케이스 미러) ───────────────────────────────
  console.log("── post_comment_report ──");

  await asApp({ account: A }, async () => {
    let rows = null;
    const err = await expectError(async () => {
      const r = await c.query(
        `INSERT INTO post_comment_report (comment_id, reporter_account_id, reason, snapshot)
         VALUES ($1,$2,'other','{}'::jsonb) RETURNING id`,
        [commentId2, A],
      );
      rows = r.rows;
    });
    check(
      "CR1 app+GUC(alice): 본인 댓글신고 INSERT ... RETURNING 1행",
      err === null && rows?.length === 1,
      err ? `${err.code} ${err.message}` : `rows=${rows?.length}`,
    );
  });

  await asApp({ account: A }, async () => {
    const err = await expectError(() =>
      c.query(
        `INSERT INTO post_comment_report (comment_id, reporter_account_id, reason, snapshot)
         VALUES ($1,$2,'other','{}'::jsonb)`,
        [commentId, B],
      ),
    );
    check("CR2 app+GUC(alice): 타인(bob) 명의 INSERT 차단", err?.code === "42501", err ? `${err.code}` : "차단 안 됨");
  });

  await asApp({ account: A }, async () => {
    const r = await c.query(`SELECT reporter_account_id FROM post_comment_report WHERE comment_id=$1`, [commentId]);
    check("CR3 app+GUC(alice) 비admin SELECT: 본인 것만", r.rows.length === 1 && r.rows[0].reporter_account_id === A, `보임 ${r.rows.length}건`);
  });

  await asApp({ account: A }, async () => {
    const r = await c.query(
      `UPDATE post_comment_report SET resolution='dismissed', resolved_by=$1, resolved_at=now(), updated_at=now()
       WHERE comment_id=$2`,
      [A, commentId],
    );
    check("CR4 app+GUC(alice) 비admin UPDATE: 0행", r.rowCount === 0, `영향 ${r.rowCount}행`);
  });

  await asApp({ account: ADM, admin: true }, async () => {
    const err = await expectError(() => c.query(`DELETE FROM post_comment_report WHERE comment_id=$1`, [commentId]));
    check("CR5 app+GUC(admin) DELETE: 권한 거부", err?.code === "42501", err ? `${err.code}` : "거부 안 됨");
  });

} finally {
  // 데이터 정리와 역할 원복을 각각 독립 finally로 — 한쪽 실패가 다른 쪽·연결 종료를 막지 않는다.
  try {
    await cleanup();
  } finally {
    try {
      if (restore === "revoke_membership") {
        // 하네스가 만든 postgres-grantor 행만 제거(supabase_admin 등 다른 행은 유지).
        await c.query("REVOKE app FROM postgres GRANTED BY postgres");
      } else if (restore === "revoke_set") {
        // 하네스가 켠 SET 옵션만 원복(행·admin·inherit은 유지).
        await c.query("REVOKE SET OPTION FOR app FROM postgres");
      }
      const afterKey = snapKey(await membershipRows());
      check(
        "역할 상태 완전 원복: membership 전체(grantor·admin·inherit·set) 시작=종료",
        afterKey === beforeKey,
        afterKey === beforeKey ? "" : `before=${beforeKey} after=${afterKey}`,
      );
    } finally {
      await c.end();
    }
  }
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
console.log(JSON.stringify(results, null, 2));
process.exit(fail === 0 ? 0 : 1);
