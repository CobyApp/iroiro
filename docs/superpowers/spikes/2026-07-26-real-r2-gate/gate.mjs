// Real R2 release gate for the Plan 3 photo pipeline (G1-G13).
// Local smoke:
//   GATE_MODE=local ./node_modules/.bin/dotenv -e .env.local -- node .../gate.mjs
// Real R2:
//   GATE_MODE=r2 GATE_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
//   GATE_BUCKET=<ugc-bucket> GATE_ACCESS_KEY_ID=... GATE_SECRET_ACCESS_KEY=... \
//   GATE_ORIGIN=https://<app-origin> node .../gate.mjs
import { AwsClient } from "aws4fetch";
import http from "node:http";
import https from "node:https";

const mode = process.env.GATE_MODE ?? "local";
const local = mode === "local";
const endpoint = process.env.GATE_ENDPOINT ?? (local ? process.env.R2_ENDPOINT : undefined);
const bucket =
  process.env.GATE_BUCKET ??
  (local ? (process.env.R2_UGC_BUCKET ?? "oshikore-ugc-dev") : undefined);
const accessKeyId =
  process.env.GATE_ACCESS_KEY_ID ?? (local ? process.env.R2_ACCESS_KEY_ID : undefined);
const secretAccessKey =
  process.env.GATE_SECRET_ACCESS_KEY ?? (local ? process.env.R2_SECRET_ACCESS_KEY : undefined);
const origin = process.env.GATE_ORIGIN ?? "http://localhost:3000";

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.error("endpoint, bucket, and credentials are required (GATE_* or local R2_*)");
  process.exit(2);
}

if (!local) {
  const host = new URL(endpoint).host;
  if (!host.endsWith(".r2.cloudflarestorage.com")) {
    console.error(`GATE_MODE=r2 requires a Cloudflare R2 endpoint (host=${host})`);
    process.exit(2);
  }
  if (!process.env.GATE_ORIGIN) {
    console.error("GATE_MODE=r2 requires GATE_ORIGIN");
    process.exit(2);
  }
}

console.log(`[gate] mode=${mode} endpoint=${endpoint} bucket=${bucket} origin=${origin}\n`);

const client = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: "s3",
  region: "auto",
});

// G13만 버킷 설정 읽기 권한을 요구한다. R2는 버킷 스코프를 지정할 수 있는 Object 등급에
// 그 권한을 주지 않으므로(스코핑은 Object 전용, 설정 조회는 Admin 전용), Admin Read only
// 자격증명을 별도로 받는다. 미지정이면 기존 클라이언트로 폴백한다 — 로컬 MinIO 스모크는
// 단일 자격증명으로 충분하다.
const adminAccessKeyId = process.env.GATE_ADMIN_ACCESS_KEY_ID;
const adminSecretAccessKey = process.env.GATE_ADMIN_SECRET_ACCESS_KEY;
const hasAdminCredentials = Boolean(adminAccessKeyId && adminSecretAccessKey);
const lifecycleClient = hasAdminCredentials
  ? new AwsClient({
      accessKeyId: adminAccessKeyId,
      secretAccessKey: adminSecretAccessKey,
      service: "s3",
      region: "auto",
    })
  : client;

if (!local && !hasAdminCredentials) {
  console.warn(
    "[gate] GATE_ADMIN_ACCESS_KEY_ID/SECRET 미지정 — G13은 Admin Read only 자격증명이 필요하다 (Object 등급은 403)\n",
  );
}

let pass = 0;
let fail = 0;
let skip = 0;

const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
};

const skipped = (name, why) => {
  skip++;
  console.log(`SKIP  ${name} - ${why}`);
};

const objectUrl = (key) => `${endpoint}/${bucket}/${key}`;
const runId = `gate-${Date.now()}`;
const tmpKey = `posts/tmp/${runId}.jpg`;
const finalKey = `posts/${runId}.jpg`;
const created = [tmpKey, finalKey];

async function presignPut(key, contentType, sizeBytes, expires = 600) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expires));
  const signed = await client.sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(sizeBytes),
        "If-None-Match": "*",
      },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

async function presignGet(key, expires = 900) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expires));
  const signed = await client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

function rawPut(urlString, { contentType, bytes }) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(bytes),
          "If-None-Match": "*",
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            body,
            headers: response.headers,
          }),
        );
      },
    );
    request.on("error", reject);
    request.write(Buffer.alloc(bytes));
    request.end();
  });
}

const signedFetch = async (key, init) =>
  fetch(await client.sign(new Request(objectUrl(key), init)));
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const N = 1024;
const M = 4096;

try {
  const putUrl = await presignPut(tmpKey, "image/jpeg", N);
  const signedHeaders = (
    new URL(putUrl).searchParams.get("X-Amz-SignedHeaders") ?? ""
  ).split(";");
  check(
    "G1 signed headers include content-length, content-type, and if-none-match",
    ["content-length", "content-type", "if-none-match"].every((header) =>
      signedHeaders.includes(header),
    ),
    signedHeaders.join(";"),
  );

  const wrongSize = await rawPut(putUrl, { contentType: "image/jpeg", bytes: M });
  check("G3 mismatched size is rejected", wrongSize.status === 403, `status=${wrongSize.status}`);

  const wrongMime = await rawPut(putUrl, { contentType: "image/png", bytes: N });
  check("G4 mismatched MIME is rejected", wrongMime.status === 403, `status=${wrongMime.status}`);

  const okPut = await rawPut(putUrl, { contentType: "image/jpeg", bytes: N });
  check(
    "G2 exact size and MIME upload succeeds",
    okPut.status === 200 || okPut.status === 204,
    `status=${okPut.status}`,
  );
  const etag = okPut.headers.etag;
  check("G2b upload returns ETag", typeof etag === "string" && etag.length > 0, String(etag));

  const repeatedPut = await rawPut(putUrl, { contentType: "image/jpeg", bytes: N });
  check("G5 repeated upload is rejected", repeatedPut.status === 412, `status=${repeatedPut.status}`);

  const copyResponse = await signedFetch(finalKey, {
    method: "PUT",
    headers: {
      "x-amz-copy-source": `/${bucket}/${tmpKey}`,
      "x-amz-copy-source-if-match": etag,
      "x-amz-metadata-directive": "REPLACE",
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
  const copyBody = await copyResponse.text();
  check(
    "G8 conditional CopyObject succeeds",
    copyResponse.ok && !copyBody.includes("<Error>"),
    `status=${copyResponse.status}`,
  );

  const badCopyKey = `${finalKey}.bad`;
  const badCopy = await signedFetch(badCopyKey, {
    method: "PUT",
    headers: {
      "x-amz-copy-source": `/${bucket}/${tmpKey}`,
      "x-amz-copy-source-if-match": '"00000000000000000000000000000000"',
      "x-amz-metadata-directive": "REPLACE",
      "Content-Type": "image/jpeg",
    },
  });
  check("G9 mismatched ETag copy is rejected", badCopy.status === 412, `status=${badCopy.status}`);
  created.push(badCopyKey);

  // 거부 상태코드는 저장소마다 다르다. MinIO는 403, 실 R2는 400(InvalidArgument / Authorization)을
  // 반환한다. 허용 목록은 400·401·403뿐이다 — 429·5xx는 거부가 아니라 판정 불능이고, 404는 객체
  // 부재를 접근 차단으로 오인하게 되므로 모두 제외한다. 400은 오류 XML 코드까지 확인해 단순
  // "잘못된 요청"과 "인증 없이 거부됨"을 구분한다.
  const unsignedGet = await fetch(objectUrl(finalKey));
  const unsignedBody = await unsignedGet.text();
  const unsignedRejected =
    unsignedGet.status === 401 ||
    unsignedGet.status === 403 ||
    (unsignedGet.status === 400 && unsignedBody.includes("<Code>InvalidArgument</Code>"));
  check(
    "G6 unsigned GET is rejected",
    unsignedRejected,
    `status=${unsignedGet.status}`,
  );

  const signedGet = await fetch(await presignGet(finalKey));
  check("G7 signed GET succeeds", signedGet.ok, `status=${signedGet.status}`);
  const cacheControl = signedGet.headers.get("cache-control") ?? "";
  check(
    "G7b Cache-Control contains private and no-store",
    cacheControl.includes("private") && cacheControl.includes("no-store"),
    cacheControl || "(missing)",
  );

  const shortUrl = await presignGet(finalKey, 2);
  await sleep(3500);
  const expiredGet = await fetch(shortUrl);
  check("G10 expired signed GET is rejected", expiredGet.status === 403, `status=${expiredGet.status}`);

  const preflight = (requestOrigin) =>
    fetch(objectUrl(tmpKey), {
      method: "OPTIONS",
      headers: {
        Origin: requestOrigin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type,if-none-match",
      },
    });

  const allowed = await preflight(origin);
  const allowedOrigin = allowed.headers.get("access-control-allow-origin");
  check(
    "G11 preflight returns the exact allowed origin",
    allowedOrigin === origin,
    `status=${allowed.status} ACAO=${allowedOrigin}`,
  );
  const allowedMethods = (allowed.headers.get("access-control-allow-methods") ?? "").toUpperCase();
  check("G11b preflight allows PUT", allowedMethods.includes("PUT"), allowedMethods || "(missing)");
  const allowedHeaders = (allowed.headers.get("access-control-allow-headers") ?? "").toLowerCase();
  check(
    "G11c preflight allows content-type and if-none-match",
    allowedHeaders.includes("content-type") && allowedHeaders.includes("if-none-match"),
    allowedHeaders || "(missing)",
  );

  if (local) {
    skipped("G12 disallowed origin is rejected", "MinIO local mode allows every origin");
  } else {
    const denied = await preflight("https://evil.example.com");
    const deniedOrigin = denied.headers.get("access-control-allow-origin");
    check("G12 disallowed origin is rejected", deniedOrigin === null, `ACAO=${deniedOrigin}`);
  }

  const lifecycleResponse = await fetch(
    await lifecycleClient.sign(`${endpoint}/${bucket}?lifecycle`),
  );
  const lifecycleXml = lifecycleResponse.ok ? await lifecycleResponse.text() : "";
  const rules = lifecycleXml.match(/<Rule>[\s\S]*?<\/Rule>/g) ?? [];
  const tmpRule = rules.find(
    (rule) =>
      rule.includes("posts/tmp/") &&
      /<Expiration>[\s\S]*?<Days>1<\/Days>[\s\S]*?<\/Expiration>/.test(rule),
  );
  check(
    "G13 posts/tmp lifecycle expires after one day",
    lifecycleResponse.ok && tmpRule !== undefined,
    `status=${lifecycleResponse.status} rules=${rules.length} adminCreds=${hasAdminCredentials}`,
  );
} finally {
  for (const key of created) {
    try {
      const response = await signedFetch(key, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        console.error(`[gate] cleanup failed (status=${response.status}), delete manually: ${key}`);
      }
    } catch (error) {
      console.error(`[gate] cleanup failed (${error}), delete manually: ${key}`);
    }
  }
}

console.log(`\nResult: ${pass} PASS / ${fail} FAIL / ${skip} SKIP (mode=${mode}, bucket=${bucket})`);
if (mode !== "r2") {
  console.log("Local mode is a script smoke test only; rerun with GATE_MODE=r2.");
}
process.exit(fail === 0 ? 0 : 1);
