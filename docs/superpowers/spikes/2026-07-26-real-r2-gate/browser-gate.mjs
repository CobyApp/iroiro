// Real R2 browser gate. It verifies that browser-managed Content-Length participates in the
// presigned PUT signature, and observes whether a conditional-failure 412 is readable in a browser.
//
// The browser cannot see a rejected upload's status: R2 omits CORS headers on the SigV4 failure
// response, so the fetch rejects. Browser-reported status is therefore treated as corroboration
// only. The verdict comes from signed HEAD requests issued by this server:
//   - the honest key must exist with exactly the signed byte count and content type
//   - the oversized key must be absent, and absent means exactly 404 (a 403/429/5xx HEAD is a
//     failed check, not evidence of absence)
import { AwsClient } from "aws4fetch";
import http from "node:http";
import { randomUUID } from "node:crypto";

const endpoint = process.env.GATE_ENDPOINT;
const bucket = process.env.GATE_BUCKET;
const accessKeyId = process.env.GATE_ACCESS_KEY_ID;
const secretAccessKey = process.env.GATE_SECRET_ACCESS_KEY;

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.error("GATE_ENDPOINT, GATE_BUCKET, and credentials are required");
  process.exit(2);
}

const endpointHost = new URL(endpoint).host;
if (!endpointHost.endsWith(".r2.cloudflarestorage.com")) {
  console.error(`A Cloudflare R2 endpoint is required (host=${endpointHost})`);
  process.exit(2);
}

const client = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: "s3",
  region: "auto",
});

const exactBytes = 1024;
const oversizedBytes = 4096;
const contentType = "image/jpeg";
const port = Number(process.env.GATE_BROWSER_PORT ?? 8789);
const runId = Date.now();
const keys = {
  exact: `posts/tmp/browser-gate-${runId}-exact.jpg`,
  oversized: `posts/tmp/browser-gate-${runId}-oversized.jpg`,
};
// 외부 페이지가 /result에 위조 판정을 POST해 게이트를 오통과시키는 것을 막는다.
const nonce = randomUUID();

async function presign(key) {
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await client.sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(exactBytes),
        "If-None-Match": "*",
      },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

const urls = {
  exact: await presign(keys.exact),
  oversized: await presign(keys.oversized),
};

const html = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>R2 browser gate</title></head>
<body style="font-family:monospace;padding:2rem">
<h1>Real R2 browser gate</h1>
<pre id="out">Running...</pre>
<script>
const URLS = ${JSON.stringify(urls)};
const EXACT_BYTES = ${exactBytes};
const OVERSIZED_BYTES = ${oversizedBytes};
const NONCE = ${JSON.stringify(nonce)};

async function put(url, bytes) {
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "If-None-Match": "*" },
      body: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    });
    return { status: response.status };
  } catch (error) {
    return { status: "FETCH_ERROR", error: String(error) };
  }
}

(async () => {
  const exact = await put(URLS.exact, EXACT_BYTES);
  const oversized = await put(URLS.oversized, OVERSIZED_BYTES);
  // 같은 키·같은 서명 URL에 재업로드. If-None-Match:* 때문에 R2는 412로 거부한다.
  // 여기서 브라우저가 412를 읽을 수 있는지가 "재시도 412 = 최초 성공 간주" 계약의 전제다.
  const repeated = await put(URLS.exact, EXACT_BYTES);
  const corsOk = exact.status !== "FETCH_ERROR";
  document.getElementById("out").textContent =
    "정직한 업로드 (" + EXACT_BYTES + "B): " + JSON.stringify(exact) + "\\n" +
    "크기 속인 업로드 (" + OVERSIZED_BYTES + "B): " + JSON.stringify(oversized) + "\\n" +
    "동일 키 재업로드: " + JSON.stringify(repeated) + "\\n" +
    "CORS(정상 응답 판독): " + (corsOk ? "PASS" : "FAIL") + "\\n\\n" +
    "브라우저가 보고할 수 있는 것은 여기까지다.\\n" +
    "최종 판정은 게이트 서버가 서명 HEAD로 객체 상태를 확인한 뒤 터미널에 출력한다.";
  document.title = "GATE_REPORTED";
  await fetch("/result", {
    method: "POST",
    body: JSON.stringify({ nonce: NONCE, exact, oversized, repeated, corsOk }),
  });
})();
</script>
</body>
</html>`;

// 상태코드와 메타데이터를 그대로 돌려준다. 호출부가 "정확히 404"·"정확히 200"을 판정한다.
async function headObject(key) {
  try {
    const signed = await client.sign(
      new Request(`${endpoint}/${bucket}/${key}`, { method: "HEAD" }),
    );
    const response = await fetch(signed);
    return {
      status: response.status,
      contentLength: Number(response.headers.get("content-length")),
      contentType: response.headers.get("content-type"),
    };
  } catch (error) {
    return { status: "HEAD_ERROR", error: String(error) };
  }
}

async function cleanup() {
  for (const key of Object.values(keys)) {
    try {
      const signed = await client.sign(
        new Request(`${endpoint}/${bucket}/${key}`, { method: "DELETE" }),
      );
      const response = await fetch(signed);
      if (!response.ok && response.status !== 404) {
        console.error(`Cleanup failed (status=${response.status}), delete manually: ${key}`);
      }
    } catch (error) {
      console.error(`Cleanup failed (${error}), delete manually: ${key}`);
    }
  }
}

let verdictReceived = false;

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/result") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", async () => {
      response.end("ok");
      if (verdictReceived) return;
      let verdict;
      try {
        verdict = JSON.parse(body);
      } catch (error) {
        console.error("Invalid browser verdict:", error);
        await cleanup();
        server.close(() => process.exit(1));
        return;
      }
      if (verdict.nonce !== nonce) {
        console.error("nonce 불일치 — 이 실행이 발급한 페이지의 결과가 아니다. 무시한다.");
        return;
      }
      verdictReceived = true;

      const exactHead = await headObject(keys.exact);
      const oversizedHead = await headObject(keys.oversized);

      // 브라우저가 보고한 값은 보조 증거다. 정직한 업로드의 성공과 응답 판독만 필수로 본다.
      const exactReportedOk = verdict.exact?.status === 200 || verdict.exact?.status === 204;
      const corsOk = verdict.corsOk === true;
      // 거부는 브라우저에서 상태코드로 확정할 수 없다(403 또는 FETCH_ERROR). 판정은 HEAD가 한다.
      const oversizedNotReadableAsSuccess =
        verdict.oversized?.status === 403 || verdict.oversized?.status === "FETCH_ERROR";

      // 저장 사실은 정확한 상태코드로만 인정한다. 403·429·5xx·HEAD_ERROR는 판정 불능 = FAIL.
      // content type은 파라미터(charset 등)만 떼고 정확히 비교한다 — startsWith는
      // image/jpeg-malformed 같은 의도치 않은 값도 통과시킨다.
      const actualContentType = String(exactHead.contentType ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      const exactStored =
        exactHead.status === 200 &&
        exactHead.contentLength === exactBytes &&
        actualContentType === contentType.toLowerCase();
      const oversizedAbsent = oversizedHead.status === 404;
      // 동일 키 재업로드 412는 "재시도 412 = 최초 성공 간주" 계약의 전제다. 관측으로 두지 않고
      // 통과 조건으로 강제한다 — 전제가 깨지면(FETCH_ERROR·200·403·429·5xx) 계약도 성립하지
      // 않으므로 게이트가 막아야 한다.
      const repeatedPreconditionConfirmed = verdict.repeated?.status === 412;

      const ok =
        exactReportedOk &&
        corsOk &&
        oversizedNotReadableAsSuccess &&
        exactStored &&
        oversizedAbsent &&
        repeatedPreconditionConfirmed;

      console.log("\n브라우저 보고:", {
        exact: verdict.exact,
        oversized: verdict.oversized,
        repeated: verdict.repeated,
        corsOk: verdict.corsOk,
      });
      console.log("서버 HEAD 검증:", { exact: exactHead, oversized: oversizedHead });
      console.log(`\n정직한 업로드 브라우저 보고 성공: ${exactReportedOk}`);
      console.log(`정상 응답 판독(CORS): ${corsOk}`);
      console.log(`크기 속인 업로드가 성공으로 읽히지 않음: ${oversizedNotReadableAsSuccess}`);
      console.log(
        `정직한 키 저장 확인(200 · ${exactBytes}B · ${contentType}): ${exactStored ? "PASS" : "FAIL"}`,
      );
      console.log(
        `초과 크기 키 부재 확인(정확히 404): ${oversizedAbsent ? "PASS" : `FAIL (status=${oversizedHead.status})`}`,
      );
      console.log(
        `동일 키 재업로드 412 확인: ${
          repeatedPreconditionConfirmed
            ? "PASS — '재시도 412 = 최초 성공 간주' 계약의 전제 성립"
            : `FAIL (status=${verdict.repeated?.status}) — 412를 읽지 못하면 해당 계약을 유지할 수 없다`
        }`,
      );
      console.log(`\n최종 판정: ${ok ? "PASS" : "FAIL"}`);

      await cleanup();
      server.close(() => process.exit(ok ? 0 : 1));
    });
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
});

// 루프백에만 bind — 페이지가 서명된 PUT URL을 담고 있으므로 LAN에 노출하지 않는다.
// 접속은 반드시 localhost로 한다: bind 주소와 페이지 origin은 별개이고, 브라우저가 PUT에 싣는
// Origin 헤더는 주소창의 호스트명을 그대로 따른다. 버킷 CORS에 등록된 값이 localhost이므로
// 127.0.0.1로 열면 preflight가 403으로 차단된다.
server.listen(port, "127.0.0.1", () => {
  console.log(`Browser gate: http://localhost:${port} (127.0.0.1 바인드 — localhost로 접속할 것)`);
  console.log(`Keys: ${Object.values(keys).join(", ")}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await cleanup();
    server.close(() => process.exit(1));
  });
}
