// FOR UPDATE 직렬화 실증 — 2세션 결정적 인터리빙.
//
// modules/posts/lib/mutations.ts의 잠금 규약을 실 DB에서 재현한다. 각 시나리오는
// 두 세션(create측 / hide측)과 관찰자(잠금 대기 감지)로 최악 인터리빙을 강제해
// FOR UPDATE가 두 트랜잭션을 직렬화함을 증명한다. 양방향(create 선점 / hide 선점) +
// 불변식이 핵심인 신고 시나리오(S3·S4)는 잠금 제거 음성대조로 "락이 load-bearing"임을 보인다.
//
// 앱 기본 격리수준 = READ COMMITTED(Prisma 기본). 하네스도 동일(raw BEGIN).
// SQL은 mutations.ts에서 그대로 옮겼다(주석에 원본 라인 표기).
//
// 실행: ./node_modules/.bin/dotenv -e .env.local -- node docs/.../concurrency.mjs
import pg from "pg";
const { Client } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 필요 — 실행: ./node_modules/.bin/dotenv -e .env.local -- node <this>");
  process.exit(2);
}
const OWNER = "00000000-0000-0000-0000-00000000c0e0"; // 글/댓글 작성자
const REPORTER = "00000000-0000-0000-0000-00000000f00d"; // 신고자(작성자와 달라야 함)
const COMMENTER = "00000000-0000-0000-0000-00000000dead"; // 답글 작성자
const SENT = "zzconc_probe";
const SNAP = JSON.stringify({ version: 1, title: "t", body: "b", authorName: "owner", authorCode: SENT });

let seq = 0;
const codeOf = () => `${SENT}_${seq++}`;

let pass = 0;
let fail = 0;
const results = [];
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  results.push({ case: name, result: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = new Client({ connectionString: url }); // create측
const H = new Client({ connectionString: url }); // hide측
const obs = new Client({ connectionString: url }); // 관찰/시드/검증
await A.connect();
await H.connect();
await obs.connect();
const pidA = (await A.query("SELECT pg_backend_pid() AS p")).rows[0].p;
const pidH = (await H.query("SELECT pg_backend_pid() AS p")).rows[0].p;

// 백엔드 pid가 Lock 대기 상태가 될 때까지 폴링 — 블로킹(직렬화) 실증.
async function waitBlocked(pid, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await obs.query(
      `SELECT state, wait_event_type FROM pg_stat_activity WHERE pid=$1`,
      [pid],
    );
    const row = r.rows[0];
    if (row && row.state === "active" && row.wait_event_type === "Lock") return true;
    await sleep(40);
  }
  throw new Error(`waitBlocked 타임아웃: pid ${pid}(${label})가 Lock 대기에 진입하지 않음`);
}

async function cleanup() {
  await obs.query(
    `DELETE FROM post_comment_report WHERE reporter_account_id=$1
       OR comment_id IN (SELECT id FROM post_comment WHERE author_code=$2)`,
    [REPORTER, SENT],
  );
  await obs.query(
    `DELETE FROM post_report WHERE reporter_account_id=$1
       OR post_id IN (SELECT id FROM post WHERE author_code=$2)`,
    [REPORTER, SENT],
  );
  await obs.query(`DELETE FROM post_comment WHERE author_code=$1`, [SENT]);
  await obs.query(`DELETE FROM post WHERE author_code=$1`, [SENT]);
}

async function seedPost({ hidden = false } = {}) {
  const r = await obs.query(
    `INSERT INTO post (account_id, public_code, topic, title, body, author_name, author_code,
                       hidden_at, hidden_reason, hidden_by)
     VALUES ($1,$2,'talk','t','b','owner',$3, ${hidden ? "now(),'seed','admin'" : "NULL,NULL,NULL"})
     RETURNING id`,
    [OWNER, codeOf(), SENT],
  );
  return r.rows[0].id;
}
async function seedComment(postId, { parentId = null, author = OWNER } = {}) {
  const r = await obs.query(
    `INSERT INTO post_comment (post_id, account_id, parent_id, body, author_name, author_code)
     VALUES ($1,$2,$3,'c','owner',$4) RETURNING id`,
    [postId, author, parentId, SENT],
  );
  return r.rows[0].id;
}

async function endTx(client) {
  await client.query("ROLLBACK").catch(() => {});
}
const unresolvedReports = async (postId) =>
  Number((await obs.query(`SELECT count(*) n FROM post_report WHERE post_id=$1 AND resolved_at IS NULL`, [postId])).rows[0].n);
const unresolvedCReports = async (commentId) =>
  Number((await obs.query(`SELECT count(*) n FROM post_comment_report WHERE comment_id=$1 AND resolved_at IS NULL`, [commentId])).rows[0].n);
const postHidden = async (postId) =>
  (await obs.query(`SELECT hidden_at IS NOT NULL h FROM post WHERE id=$1`, [postId])).rows[0].h;
const commentHidden = async (commentId) =>
  (await obs.query(`SELECT hidden_at IS NOT NULL h FROM post_comment WHERE id=$1`, [commentId])).rows[0].h;
const commentCount = async (postId) =>
  Number((await obs.query(`SELECT count(*) n FROM post_comment WHERE post_id=$1`, [postId])).rows[0].n);
const reportCount = async (postId) =>
  Number((await obs.query(`SELECT count(*) n FROM post_report WHERE post_id=$1`, [postId])).rows[0].n);
const cReportCount = async (commentId) =>
  Number((await obs.query(`SELECT count(*) n FROM post_comment_report WHERE comment_id=$1`, [commentId])).rows[0].n);

// ── SQL 조각 (mutations.ts 원문) ────────────────────────────────────────────
const LOCK_POST = // createComment/createPostReport/createCommentReport 공통 (l.97-100, 199-202, 242-245)
  `SELECT public_code FROM post WHERE id=$1 AND hidden_at IS NULL AND deleted_at IS NULL FOR UPDATE`;
const LOCK_POST_PLAIN = `SELECT public_code FROM post WHERE id=$1 AND hidden_at IS NULL AND deleted_at IS NULL`;
const LOCK_PARENT = // createComment reply (l.106-110)
  `SELECT parent_id FROM post_comment WHERE id=$1 AND post_id=$2 AND hidden_at IS NULL AND deleted_at IS NULL FOR UPDATE`;
const LOCK_COMMENT = // createCommentReport (l.248-256)
  `SELECT account_id FROM post_comment WHERE id=$1 AND post_id=$2 AND hidden_at IS NULL AND deleted_at IS NULL FOR UPDATE`;
const LOCK_COMMENT_PLAIN = `SELECT account_id FROM post_comment WHERE id=$1 AND post_id=$2 AND hidden_at IS NULL AND deleted_at IS NULL`;
const HIDE_POST = // hidePost (l.291-294)
  `UPDATE post SET hidden_at=now(), hidden_reason='r', hidden_by='admin', updated_at=now() WHERE id=$1 AND deleted_at IS NULL AND hidden_at IS NULL`;
const ACTION_POST_REPORTS = // hidePost (l.296-299)
  `UPDATE post_report SET resolution='actioned', resolved_by='admin', resolved_at=now(), updated_at=now() WHERE post_id=$1 AND resolved_at IS NULL`;
const HIDE_COMMENT = // hideComment (l.331-334)
  `UPDATE post_comment SET hidden_at=now(), hidden_reason='r', hidden_by='admin', updated_at=now() WHERE id=$1 AND deleted_at IS NULL AND hidden_at IS NULL`;
const ACTION_COMMENT_REPORTS = // hideComment (l.336-339)
  `UPDATE post_comment_report SET resolution='actioned', resolved_by='admin', resolved_at=now(), updated_at=now() WHERE comment_id=$1 AND resolved_at IS NULL`;
const INS_COMMENT = (parent) =>
  `INSERT INTO post_comment (post_id, account_id, parent_id, body, author_name, author_code) VALUES ($1,$2,${parent ?? "NULL"},'x','r',$3)`;
const INS_POST_REPORT =
  `INSERT INTO post_report (post_id, reporter_account_id, reason, snapshot) VALUES ($1,$2,'spam',$3::jsonb)`;
const INS_COMMENT_REPORT =
  `INSERT INTO post_comment_report (comment_id, reporter_account_id, reason, snapshot) VALUES ($1,$2,'spam',$3::jsonb)`;

try {
  await cleanup();

  // ── S1: createComment(top) ∥ hidePost ────────────────────────────────────
  // 불변식: hide 선점 ⇒ 댓글 거부(0행). create 선점 ⇒ 댓글 삽입 후 글 숨김(정상).
  {
    // A: create 선점
    const postId = await seedPost();
    await A.query("BEGIN");
    await A.query(LOCK_POST, [postId]); // 글 잠금
    await H.query("BEGIN");
    const pH = H.query(HIDE_POST, [postId]); // 블록
    await waitBlocked(pidH, "S1A hidePost");
    await A.query(INS_COMMENT(null), [postId, OWNER, SENT]);
    await A.query("COMMIT"); // 잠금 해제
    await pH;
    await H.query(ACTION_POST_REPORTS, [postId]);
    await H.query("COMMIT");
    check("S1A createComment(top) 선점 ∥ hidePost 블록→직렬화", (await commentCount(postId)) === 1 && (await postHidden(postId)) === true, "댓글1 + 글숨김(정상 순서)");
  }
  {
    // B: hide 선점 ⇒ 댓글 거부
    const postId = await seedPost();
    await H.query("BEGIN");
    await H.query(HIDE_POST, [postId]); // 글 숨김 + 잠금
    await A.query("BEGIN");
    const pSel = A.query(LOCK_POST, [postId]); // 블록
    await waitBlocked(pidA, "S1B lockPost");
    await H.query(ACTION_POST_REPORTS, [postId]);
    await H.query("COMMIT"); // 해제
    const sel = await pSel; // 재검증 → 0행
    await endTx(A); // 앱이라면 DomainError → 삽입 안 함
    check("S1B hidePost 선점 ∥ createComment 재검증 0행→거부", sel.rowCount === 0 && (await commentCount(postId)) === 0 && (await postHidden(postId)) === true, `재검증 rows=${sel.rowCount}, 댓글0`);
  }

  // ── S2: createComment(reply) ∥ hideComment(parent) ───────────────────────
  {
    // A: reply 선점
    const postId = await seedPost();
    const parentId = await seedComment(postId);
    await A.query("BEGIN");
    await A.query(LOCK_POST, [postId]);
    await A.query(LOCK_PARENT, [parentId, postId]); // 부모 잠금
    await H.query("BEGIN");
    const pH = H.query(HIDE_COMMENT, [parentId]); // 블록
    await waitBlocked(pidH, "S2A hideComment");
    await A.query(INS_COMMENT(parentId), [postId, COMMENTER, SENT]);
    await A.query("COMMIT");
    await pH;
    await H.query(ACTION_COMMENT_REPORTS, [parentId]);
    await H.query("COMMIT");
    check("S2A createComment(reply) 선점 ∥ hideComment 블록→직렬화", (await commentCount(postId)) === 2 && (await commentHidden(parentId)) === true, "답글 삽입 + 부모 숨김");
  }
  {
    // B: hide 선점 ⇒ 답글 거부
    const postId = await seedPost();
    const parentId = await seedComment(postId);
    await H.query("BEGIN");
    await H.query(HIDE_COMMENT, [parentId]);
    await A.query("BEGIN");
    await A.query(LOCK_POST, [postId]); // 글은 잠기지 않음(통과)
    const pSel = A.query(LOCK_PARENT, [parentId, postId]); // 블록
    await waitBlocked(pidA, "S2B lockParent");
    await H.query(ACTION_COMMENT_REPORTS, [parentId]);
    await H.query("COMMIT");
    const sel = await pSel; // 0행
    await endTx(A);
    check("S2B hideComment(parent) 선점 ∥ reply 재검증 0행→거부", sel.rowCount === 0 && (await commentCount(postId)) === 1 && (await commentHidden(parentId)) === true, `재검증 rows=${sel.rowCount}`);
  }

  // ── S3: createPostReport ∥ hidePost — 불변식: 숨김 글에 미처리 신고 0 ──────
  {
    // A: report 선점 ⇒ 신고 생성 후 hide가 actioned
    const postId = await seedPost();
    await A.query("BEGIN");
    await A.query(LOCK_POST, [postId]);
    await H.query("BEGIN");
    const pH = H.query(HIDE_POST, [postId]);
    await waitBlocked(pidH, "S3A hidePost");
    await A.query(INS_POST_REPORT, [postId, REPORTER, SNAP]);
    await A.query("COMMIT");
    await pH;
    await H.query(ACTION_POST_REPORTS, [postId]); // R의 신고를 actioned
    await H.query("COMMIT");
    check("S3A createPostReport 선점 ∥ hidePost: 신고 생성→actioned, 미처리 0", (await reportCount(postId)) === 1 && (await unresolvedReports(postId)) === 0 && (await postHidden(postId)) === true, "신고1 전부 처리됨");
  }
  {
    // B: hide 선점 ⇒ 신고 거부
    const postId = await seedPost();
    await H.query("BEGIN");
    await H.query(HIDE_POST, [postId]);
    await A.query("BEGIN");
    const pSel = A.query(LOCK_POST, [postId]);
    await waitBlocked(pidA, "S3B lockPost");
    await H.query(ACTION_POST_REPORTS, [postId]);
    await H.query("COMMIT");
    const sel = await pSel;
    await endTx(A);
    check("S3B hidePost 선점 ∥ createPostReport 재검증 0행→거부: 미처리 0", sel.rowCount === 0 && (await reportCount(postId)) === 0 && (await postHidden(postId)) === true, `재검증 rows=${sel.rowCount}, 신고0`);
  }
  {
    // 음성대조: FOR UPDATE 제거 ⇒ 불변식 위반 재현
    const postId = await seedPost();
    await A.query("BEGIN");
    await A.query(LOCK_POST_PLAIN, [postId]); // 잠금 없음
    await H.query("BEGIN");
    await H.query(HIDE_POST, [postId]);
    await H.query(ACTION_POST_REPORTS, [postId]); // 아직 신고 없음 → 0건 처리
    await H.query("COMMIT");
    await A.query(INS_POST_REPORT, [postId, REPORTER, SNAP]); // 숨김 글에 미처리 신고 삽입
    await A.query("COMMIT");
    const violated = (await postHidden(postId)) === true && (await unresolvedReports(postId)) === 1;
    check("S3-neg 음성대조(FOR UPDATE 제거): 숨김 글에 미처리 신고 잔존=위반 재현", violated, "락 제거 시 불변식 깨짐 → 락이 load-bearing 증명");
  }

  // ── S4: createCommentReport ∥ hideComment — 불변식: 숨김 댓글에 미처리 신고 0 ─
  {
    // A: report 선점
    const postId = await seedPost();
    const commentId = await seedComment(postId);
    await A.query("BEGIN");
    await A.query(LOCK_POST, [postId]);
    await A.query(LOCK_COMMENT, [commentId, postId]); // 댓글 잠금
    await H.query("BEGIN");
    const pH = H.query(HIDE_COMMENT, [commentId]);
    await waitBlocked(pidH, "S4A hideComment");
    await A.query(INS_COMMENT_REPORT, [commentId, REPORTER, SNAP]);
    await A.query("COMMIT");
    await pH;
    await H.query(ACTION_COMMENT_REPORTS, [commentId]);
    await H.query("COMMIT");
    check("S4A createCommentReport 선점 ∥ hideComment: 신고 생성→actioned, 미처리 0", (await cReportCount(commentId)) === 1 && (await unresolvedCReports(commentId)) === 0 && (await commentHidden(commentId)) === true, "댓글신고1 전부 처리됨");
  }
  {
    // B: hide 선점 ⇒ 신고 거부
    const postId = await seedPost();
    const commentId = await seedComment(postId);
    await H.query("BEGIN");
    await H.query(HIDE_COMMENT, [commentId]);
    await A.query("BEGIN");
    await A.query(LOCK_POST, [postId]); // 글은 통과
    const pSel = A.query(LOCK_COMMENT, [commentId, postId]); // 블록
    await waitBlocked(pidA, "S4B lockComment");
    await H.query(ACTION_COMMENT_REPORTS, [commentId]);
    await H.query("COMMIT");
    const sel = await pSel;
    await endTx(A);
    check("S4B hideComment 선점 ∥ createCommentReport 재검증 0행→거부: 미처리 0", sel.rowCount === 0 && (await cReportCount(commentId)) === 0 && (await commentHidden(commentId)) === true, `재검증 rows=${sel.rowCount}`);
  }
  {
    // 음성대조: 댓글 FOR UPDATE 제거 ⇒ 위반 재현
    const postId = await seedPost();
    const commentId = await seedComment(postId);
    await A.query("BEGIN");
    await A.query(LOCK_COMMENT_PLAIN, [commentId, postId]); // 잠금 없음
    await H.query("BEGIN");
    await H.query(HIDE_COMMENT, [commentId]);
    await H.query(ACTION_COMMENT_REPORTS, [commentId]);
    await H.query("COMMIT");
    await A.query(INS_COMMENT_REPORT, [commentId, REPORTER, SNAP]);
    await A.query("COMMIT");
    const violated = (await commentHidden(commentId)) === true && (await unresolvedCReports(commentId)) === 1;
    check("S4-neg 음성대조(댓글 FOR UPDATE 제거): 숨김 댓글에 미처리 신고 잔존=위반 재현", violated, "락 제거 시 불변식 깨짐");
  }

  // ── S5: createCommentReport ∥ hidePost — 잠금 순서 post→comment 게이트 ─────
  {
    // A: report 선점(글 먼저 잠금) ⇒ hidePost 블록
    const postId = await seedPost();
    const commentId = await seedComment(postId);
    await A.query("BEGIN");
    await A.query(LOCK_POST, [postId]); // 글 선잠금
    await A.query(LOCK_COMMENT, [commentId, postId]);
    await H.query("BEGIN");
    const pH = H.query(HIDE_POST, [postId]); // 글 잠금 대기 → 블록
    await waitBlocked(pidH, "S5A hidePost");
    await A.query(INS_COMMENT_REPORT, [commentId, REPORTER, SNAP]);
    await A.query("COMMIT");
    await pH;
    await H.query(ACTION_POST_REPORTS, [postId]); // 댓글신고는 건드리지 않음(정상)
    await H.query("COMMIT");
    check("S5A createCommentReport 선점 ∥ hidePost 블록→직렬화", (await cReportCount(commentId)) === 1 && (await postHidden(postId)) === true, "댓글신고1 생성 + 글숨김(댓글신고 별도 처리)");
  }
  {
    // B: hidePost 선점 ⇒ 댓글신고가 글 재검증(post lock)에서 거부
    const postId = await seedPost();
    const commentId = await seedComment(postId);
    await H.query("BEGIN");
    await H.query(HIDE_POST, [postId]); // 글 숨김 + 잠금
    await A.query("BEGIN");
    const pSel = A.query(LOCK_POST, [postId]); // 글 재검증 → 블록
    await waitBlocked(pidA, "S5B lockPost");
    await H.query(ACTION_POST_REPORTS, [postId]);
    await H.query("COMMIT");
    const sel = await pSel; // 0행 → 글 숨김이므로 신고 거부
    await endTx(A);
    check("S5B hidePost 선점 ∥ createCommentReport 글 재검증 0행→거부", sel.rowCount === 0 && (await cReportCount(commentId)) === 0 && (await postHidden(postId)) === true, `글 재검증 rows=${sel.rowCount} → 댓글신고 미생성`);
  }
} finally {
  await endTx(A);
  await endTx(H);
  await cleanup();
  await A.end();
  await H.end();
  await obs.end();
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
console.log(JSON.stringify(results, null, 2));
process.exit(fail === 0 ? 0 : 1);
