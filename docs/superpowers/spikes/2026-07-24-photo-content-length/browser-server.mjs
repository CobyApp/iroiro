// 스파이크 — 브라우저 층: 실제 브라우저 fetch가 서명된 Content-Length 강제와 호환되는가?
//
// 브라우저 fetch는 Content-Length를 body 크기로 자동설정(개발자 제어 불가). 이론상:
//   · body=N → Content-Length:N → 서명(N)과 일치 → 성공
//   · body=M → Content-Length:M → 서명(N)과 불일치 → 403 (크기 강제)
// 단 CORS preflight·forbidden header 처리가 변수라 실제 브라우저로 확인해야 한다.
//
// 이 스크립트는 presigned URL을 서버에서 생성해 주입한 테스트 HTML을 서빙한다.
// 브라우저(claude-in-chrome)로 http://localhost:8787 을 열면 fetch 결과가 DOM에 출력된다.
//
// 실행: ./node_modules/.bin/dotenv -e .env.local -- node docs/.../browser-server.mjs
import { AwsClient } from "aws4fetch";
import http from "node:http";

const endpoint = process.env.R2_ENDPOINT;
const bucket = process.env.R2_BUCKET;
const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

async function presign(key, contentLength) {
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await client.sign(
    new Request(url.toString(), {
      method: "PUT",
      headers: { "Content-Length": String(contentLength) },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

// 스파이크 객체 정리 — 서버 종료 시 호출(P2-6).
async function deleteObject(key) {
  const signed = await client.sign(new Request(`${endpoint}/${bucket}/${key}`, { method: "DELETE" }));
  await fetch(signed.url, { method: "DELETE" }).catch(() => {});
}

const N = 1000;
const M = 5000;
const id = crypto.randomUUID();
const urlN = await presign(`spike/browser/${id}`, N); // content-length=N 서명

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>CL spike</title></head>
<body style="font-family:monospace;padding:2rem">
<h1>Content-Length 브라우저 강제 스파이크</h1>
<pre id="out">실행 중…</pre>
<script>
const URL_N = ${JSON.stringify(urlN)};
const N = ${N}, M = ${M};
async function put(url, bytes) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: "PUT", body: new Blob([new Uint8Array(bytes)]) });
    return { status: res.status, ms: Math.round(performance.now() - t0) };
  } catch (e) { return { status: "FETCH_ERROR", error: String(e), ms: Math.round(performance.now() - t0) }; }
}
(async () => {
  const s1 = await put(URL_N, N); // 정확한 크기
  const s2 = await put(URL_N, M); // 초과 크기(공격)
  const ok = (s1.status === 200 || s1.status === 204) && s2.status === 403;
  const verdict = ok
    ? "PASS — 브라우저에서도 서명된 Content-Length가 크기를 강제함"
    : (s1.status === "FETCH_ERROR" || s2.status === "FETCH_ERROR"
        ? "CORS/네트워크 오류 — 아래 error 확인"
        : "확인 필요 — 기대(S1 성공, S2 403)와 다름");
  document.getElementById("out").textContent =
    "S1 정확(body=" + N + "): " + JSON.stringify(s1) + "\\n" +
    "S2 초과(body=" + M + "): " + JSON.stringify(s2) + "\\n\\n" +
    "판정: " + verdict;
  document.title = ok ? "SPIKE_PASS" : "SPIKE_CHECK";
})();
</script></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
});
server.listen(8787, () => {
  console.log("스파이크 서버: http://localhost:8787");
  console.log(`presigned(N=${N}) 발급 완료, TTL 900s`);
  console.log("확인 후 Ctrl+C로 종료하면 생성 객체를 정리하고 서버를 닫습니다.");
});

// 종료(Ctrl+C/kill) 시: 브라우저가 업로드한 객체 삭제 + 서버 close (P2-6).
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`\n${sig} 수신 — spike/browser/${id} 삭제 후 서버 종료`);
    await deleteObject(`spike/browser/${id}`);
    server.close(() => process.exit(0));
  });
}
