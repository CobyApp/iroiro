// 스파이크 — 스토리지 층: presigned PUT에 서명된 Content-Length를 MinIO(로컬 R2 대체)가
// 실제로 강제하는가?
//
// 질문: presigned PUT URL의 SignedHeaders에 content-length를 포함시키면, 클라이언트가
//       선언과 다른 크기를 보낼 때 스토리지가 거부하는가?(= 업로드 시점 크기 강제 성립)
//
// aws4fetch는 content-length를 UNSIGNABLE_HEADERS로 두지만 `allHeaders: true`면 서명에 포함한다.
// raw http로 Content-Length 헤더를 직접 제어해(fetch는 body 크기에 맞춰 자동설정하므로) 검증.
//
// 실행: ./node_modules/.bin/dotenv -e .env.local -- node docs/.../storage-layer.mjs
import { AwsClient } from "aws4fetch";
import http from "node:http";

const endpoint = process.env.R2_ENDPOINT;
const bucket = process.env.R2_BUCKET;
if (!endpoint || !bucket) {
  console.error("R2_ENDPOINT/R2_BUCKET 필요 — dotenv -e .env.local 로 실행");
  process.exit(2);
}

const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

// presigned PUT URL 생성. contentLength 지정 시 allHeaders:true로 content-length를 서명에 포함.
async function presign(key, { contentLength } = {}) {
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", "600");
  const headers = {};
  if (contentLength != null) headers["Content-Length"] = String(contentLength);
  const signed = await client.sign(new Request(url.toString(), { method: "PUT", headers }), {
    aws: { signQuery: true, allHeaders: contentLength != null },
  });
  return signed.url;
}

// raw http PUT — Content-Length 헤더를 명시 제어(선언 크기)하고 body는 actualBytes 전송.
function rawPut(urlStr, declaredLength, actualBytes) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: "PUT",
        headers: { "Content-Length": String(declaredLength) },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body: body.slice(0, 300) }));
      },
    );
    req.on("error", reject);
    req.write(Buffer.alloc(actualBytes, 0x61));
    req.end();
  });
}

// 스파이크 객체 정리 — 성공·실패 무관 finally에서 호출(P2-6).
async function deleteObject(key) {
  const signed = await client.sign(new Request(`${endpoint}/${bucket}/${key}`, { method: "DELETE" }));
  await fetch(signed.url, { method: "DELETE" }).catch(() => {});
}

let pass = 0;
let fail = 0;
const results = [];
function check(name, ok, detail = "") {
  ok ? pass++ : fail++;
  results.push({ case: name, result: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const N = 1000; // 선언 크기
const M = 5000; // 초과 크기(공격)
const id = crypto.randomUUID();
const createdKeys = [`spike/${id}/t1`, `spike/${id}/t3`];

try {
// 서명에 content-length가 실제로 들어갔는지 먼저 확인.
const url1 = await presign(`spike/${id}/t1`, { contentLength: N });
const signedHeaders = new URL(url1).searchParams.get("X-Amz-SignedHeaders");
console.log(`\n[precondition] X-Amz-SignedHeaders = ${signedHeaders}`);
check(
  "P0 서명에 content-length 포함(allHeaders:true)",
  (signedHeaders ?? "").split(";").includes("content-length"),
  signedHeaders ?? "(none)",
);

// 1. content-length 서명 + 정확히 N 전송 → 성공(200/204)
const r1 = await rawPut(url1, N, N);
check("S1 서명 N + 정확히 N 전송: 업로드 성공", r1.status === 200 || r1.status === 204, `status=${r1.status}`);

// 2. content-length 서명 N + 초과 M 전송(공격) → 거부(403)
const r2 = await rawPut(url1, M, M);
check(
  "S2 서명 N + 초과 M 전송: 거부(크기 강제)",
  r2.status === 403,
  `status=${r2.status} ${r2.status !== 403 ? "→ 강제 실패!" : "(SignatureDoesNotMatch)"}`,
);

// 3. 대조군: content-length 미서명 → 아무 크기나 통과(강제 없음 확인)
const url3 = await presign(`spike/${id}/t3`, {}); // content-length 서명 안 함
const shControl = new URL(url3).searchParams.get("X-Amz-SignedHeaders");
const r3 = await rawPut(url3, M, M);
check(
  "S3 대조군(content-length 미서명): 초과 크기도 통과",
  r3.status === 200 || r3.status === 204,
  `SignedHeaders=${shControl} status=${r3.status}`,
);
} finally {
  for (const key of createdKeys) await deleteObject(key);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
console.log(JSON.stringify(results, null, 2));
process.exit(fail === 0 ? 0 : 1);
