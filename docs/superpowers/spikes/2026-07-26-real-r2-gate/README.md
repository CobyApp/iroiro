# Plan 3 Real R2 Gate

**Date:** 2026-07-26
**Branch:** `feat/community-photos`
**Scope:** Plan 3 photo pipeline implementation gate

## Purpose

This gate verifies the storage contracts required by community photo uploads before implementation starts.
Local MinIO validates the scripts only. It does not satisfy the release gate.

If real R2 does not enforce the signed content length or conditional copy contract, stop and reconsider
shipping photos before starting Task 1.

## Prerequisites

1. Create a private Cloudflare R2 UGC bucket without a public domain.
2. Add the UGC bucket to the bucket scope of an Object Read & Write token. That token signs G1-G12
   and is a **gate credential only**. Revoke it once the gate passes, and issue a separate token for
   the application runtime — a credential that has appeared in a work log, a shell argument, or a
   transcript must never become the runtime credential.
3. Issue a separate Admin Read only token for G13. Reading the bucket lifecycle configuration is a
   bucket-level operation that Object-level permissions cannot perform. Admin tokens cannot be
   bucket-scoped, so revoke this one as soon as the gate passes.
4. Replace `<production-origin>` in `cors.json` and apply the CORS policy.
5. Add a lifecycle rule named `Staged Upload Expiration Rule` that expires `posts/tmp/` objects
   after one day. The gate matches on the prefix and the expiry, not the rule name, but the name is
   what tells a later reader why the rule must not be deleted. Leave R2's built-in
   `Default Multipart Abort Rule` in place.
6. Keep `http://localhost:8789` in CORS until the browser gate passes.

Do not commit credentials or paste them into this document.

## Local Smoke

```bash
docker compose up -d
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:9000/oshikore-ugc-dev/no-such-key
docker compose run --rm --entrypoint /bin/sh createbuckets -c \
  "mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null && mc ilm rule ls local/oshikore-ugc-dev"
GATE_MODE=local ./node_modules/.bin/dotenv -e .env.local -- \
  node docs/superpowers/spikes/2026-07-26-real-r2-gate/gate.mjs
```

Expected: the anonymous GET returns 403, the lifecycle output contains `posts/tmp/` with one-day expiry,
and G12 is the only skipped scenario.

## Real R2 Gate

`GATE_ACCESS_KEY_ID`/`GATE_SECRET_ACCESS_KEY` come from the Object Read & Write token and cover
G1-G12. `GATE_ADMIN_ACCESS_KEY_ID`/`GATE_ADMIN_SECRET_ACCESS_KEY` come from the Admin Read only
token and are used only by G13. Omitting the admin pair falls back to the object credentials, which
makes G13 fail with 403.

Keep credentials out of the shell history: write them to a file outside the repository and pass it
through `dotenv`, then delete the file.

```bash
./node_modules/.bin/dotenv -e /path/outside/repo/gate.env -- \
  node docs/superpowers/spikes/2026-07-26-real-r2-gate/gate.mjs
```

```dotenv
GATE_MODE=r2
GATE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
GATE_BUCKET=<private-ugc-bucket>
GATE_ACCESS_KEY_ID=<object-read-write-token>
GATE_SECRET_ACCESS_KEY=<object-read-write-token>
GATE_ADMIN_ACCESS_KEY_ID=<admin-read-only-token>
GATE_ADMIN_SECRET_ACCESS_KEY=<admin-read-only-token>
GATE_ORIGIN=http://localhost:3000
```

Expected: G1-G13 all pass with no skips.

## Browser Gate

Node can control `Content-Length` directly. The browser gate is separately required to prove that the
browser-managed header matches the signed value.

```bash
GATE_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
GATE_BUCKET=<private-ugc-bucket> \
GATE_ACCESS_KEY_ID=... \
GATE_SECRET_ACCESS_KEY=... \
node docs/superpowers/spikes/2026-07-26-real-r2-gate/browser-gate.mjs
```

Open `http://localhost:8789`. The server binds to `127.0.0.1` only, because the page carries
presigned PUT URLs — but open it by hostname, not by address: the `Origin` header the browser puts on
the uploads follows the address bar, and the bucket CORS policy lists `http://localhost:8789`. Opening
`http://127.0.0.1:8789` makes the preflight fail with 403.

The browser uploads three times: once at the signed size, once at four times the signed size, and
once more to the key it already wrote.

The oversized attempt cannot be judged by its status code. The `403 SignatureDoesNotMatch` observed
on real R2 carried no CORS headers, so the browser could not read it and surfaced
`TypeError: Failed to fetch`. Browser-reported status is therefore corroboration only, and the
verdict comes from signed `HEAD` requests issued by the gate server:

- the honest key must return exactly `200` with `Content-Length` equal to the signed byte count and
  the signed content type
- the oversized key must return exactly `404`; a `403`, `429`, `5xx`, or transport error is a failed
  check rather than evidence of absence

Absence of the oversized object is not standalone proof that R2 enforced the contract — a request
that never arrived would look identical. It carries weight combined with the Node-layer rejection
(scenario G3) and the honest browser upload landing at the exact signed size.

The third upload is a pass criterion: the browser must read exactly `412` from `If-None-Match: *`.
That readability is the premise of the "a 412 on retry means the first PUT already succeeded"
contract, so the gate blocks when it does not hold — a fetch error, `200`, `403`, `429`, or `5xx`
all fail. Keeping it as a mere observation would let the gate pass while the contract it supports
had quietly stopped being true.

`/result` requires a per-run nonce embedded in the page, so another page cannot post a forged
verdict. The process exits with 0 only when the honest upload succeeds and is readable, the oversized attempt
is not readable as success, the honest key is stored at exactly the signed size and content type
(compared after stripping any parameters, not by prefix), the oversized key is exactly absent, and
the repeat upload reads exactly `412`. Exiting before a verdict returns 1.

## Scenarios

| ID | Contract | Expected |
|---|---|---|
| G1 | Signed headers | `content-length`, `content-type`, `if-none-match` |
| G2 | Exact PUT | 200/204 with ETag |
| G3 | Wrong size | 403 |
| G4 | Wrong MIME | 403 |
| G5 | Repeated PUT | 412 |
| G6 | Unsigned GET | 400 (with `InvalidArgument`), 401, or 403 — never 404 |
| G7 | Signed GET | 200 and `Cache-Control: private, no-store` |
| G8 | Conditional copy with current ETag | 200 |
| G9 | Conditional copy with wrong ETag | 412 |
| G10 | Expired signed GET | 403 |
| G11 | Allowed-origin preflight | Exact ACAO, PUT, required headers |
| G12 | Disallowed-origin preflight | No ACAO |
| G13 | Temporary-object lifecycle | Same rule contains `posts/tmp/` and one-day expiry (needs `GATE_ADMIN_*`) |

## Result

### Local MinIO Smoke

Executed on 2026-07-26:

- Anonymous UGC object access: 403
- `posts/tmp/` lifecycle: enabled, one-day expiry
- Gate result: 16 PASS / 0 FAIL / 1 SKIP
- Skip: G12 only, as expected for local MinIO
- Remaining `gate-*` objects after cleanup: 0
- Docker containers and network removed after verification

### Real Cloudflare R2

Executed on 2026-08-01 against a private bucket with no public domain.

- Script gate: **17 PASS / 0 FAIL / 0 SKIP**
- Browser gate: **PASS** — first run 2026-08-01, re-run the same day under the strengthened criteria
  described below
- Bucket configuration: CORS limited to `http://localhost:3000` and `http://localhost:8789`;
  lifecycle rule `Staged Upload Expiration Rule` expiring `posts/tmp/` after one day, alongside R2's
  built-in `Default Multipart Abort Rule`
- Credentials used by this run: an Object Read & Write token scoped to the bucket for G1-G12, and a
  separate Admin Read only token for G13. Both were gate-only.
- Both gate tokens were revoked once the gate passed (2026-08-01), and the application runtime was
  issued its own Object Read & Write token — one the gate never used, scoped to the UGC bucket with
  least privilege. The runtime never reuses a credential that has appeared in a work log, a shell
  argument, or a transcript. No token value or access key id is recorded anywhere in this repository.
  The temporary credential file used to drive the gate was deleted.

The size contract holds at both layers. A presigned PUT whose body does not match the signed
`Content-Length` is rejected with `403 SignatureDoesNotMatch` and stores nothing, and the rejection
survives the browser path where the header is set by the browser rather than by application code.
Conditional copy (`x-amz-copy-source-if-match`) returns 412 on a stale ETag, so the promotion step
can pin the object it verified.

Two R2 behaviours differ from MinIO and forced gate corrections:

1. An unsigned GET returns `400 InvalidArgument` rather than `401`/`403`. Access is still denied and
   no object content is served. The gate accepts 400, 401, and 403 as rejection — and on 400 it also
   requires the `InvalidArgument` error code, so a merely malformed request cannot pass as a denial.
   404 stays excluded so a missing object is never mistaken for one.
2. The SigV4 signature-mismatch response (`403 SignatureDoesNotMatch`) carried no CORS response
   headers and the browser could not read its status; the conditional-write failure that occurred
   after signature verification (`412 PreconditionFailed`) was readable as a status code. **These are
   the observations from the two scenarios that were tested, not a general rule for every R2 error
   response** — Cloudflare has not been confirmed to apply one internal handling rule across them.

Point 2 has an application consequence worth carrying into implementation: browser code cannot tell
a size-contract rejection from a transient network error, so retry logic cannot branch on the status
code for that case. A normal upload never reaches this path, because the client declares the size of
the blob it is about to send; a mismatch indicates request tampering, or a client defect or state
mismatch. Because `412` stays visible, the "a 412 on retry means the first PUT already succeeded"
contract holds.

### Strengthened browser gate re-run

The first browser run judged object absence with `response.ok`, which would also have accepted a
`403`, `429`, or `5xx` HEAD as "absent". The script now requires exactly `404` for the oversized key,
requires the honest key to be stored at exactly the signed size and content type, treats any other
HEAD outcome as a failed check, binds to `127.0.0.1`, gates `/result` on a per-run nonce, and adds the
`412` visibility observation.

A second round of hardening followed the 6th review: the repeat upload became a pass criterion rather
than an observation, and the content-type check became an exact comparison after stripping
parameters rather than a prefix match.

Final run (2026-08-01), **PASS**, exit code 0:

- browser: honest upload `200`, oversized `TypeError: Failed to fetch`, repeat upload `412`
- server HEAD, honest key: `200`, `Content-Length` 1024, `image/jpeg`
- server HEAD, oversized key: `404`
- every criterion reported individually: honest key stored PASS, oversized key absent PASS, repeat
  upload 412 PASS

Re-running needs an Object Read & Write token scoped to the bucket. The Admin Read only token is not
needed — the browser gate reads no bucket configuration. Note that the gate must be opened as
`http://localhost:8789`, matching the bucket's CORS policy; the loopback bind does not change the
page's origin.
