# 스파이크 — presigned PUT Content-Length 크기 강제

**일자:** 2026-07-24 · **브랜치:** `feat/community-photos` · **대상:** Plan 3 §결정 8 크기 강제 게이트

## 질문

> presigned PUT URL에 파일 크기(`Content-Length`)를 서명으로 박아, 브라우저 `fetch`로 업로드할 때
> 그 크기가 **업로드 시점에 강제**되는가?

§결정 8은 이 스파이크 결과로 사진 기능 방향을 가르도록 못박았다:
**성공 → 크기 강제 + 사진 출시 / 실패 → 사진 de-scope(텍스트 우선).**
"크기 강제 없는 사진 기능은 출시하지 않는다."

크기 강제가 없으면 "10MB라 신고하고 1GB를 올리는" 남용을 업로드 시점에 못 막는다(claim 선언값
HEAD 대조는 *제출한 것만* 검사하므로 "올리고 제출 안 하기"를 막지 못한다 — §결정 8).

## 방법

크기 강제는 두 층이 모두 통과해야 성립하므로 층별로 검증했다.

1. **스토리지 층** (`storage-layer.mjs`, Node + 로컬 MinIO): 스토리지가 서명된 `Content-Length`를
   강제하는가? Node `http`로 `Content-Length` 헤더를 직접 조작(선언≠실제)해 검증.
2. **브라우저 층** (`browser-server.mjs` + 실제 Chrome): 브라우저 `fetch`가 이 메커니즘과
   호환되는가? presigned URL을 주입한 페이지를 실제 브라우저로 열어 `fetch` PUT 결과·CORS를 관측.

환경: 로컬 MinIO(`compose.yml`, `oshikore-products-dev` 버킷), `aws4fetch` 1.0.20.
핵심: `aws4fetch`는 `content-length`를 `UNSIGNABLE_HEADERS`로 두지만 **`allHeaders: true`**를 주면
`SignedHeaders`에 포함한다(`allHeaders || !UNSIGNABLE_HEADERS.has(header)`).

## 결과 — ✅ 크기 강제 성립

### 스토리지 층 (4/4 PASS)

```
[precondition] X-Amz-SignedHeaders = content-length;host
✅ P0 서명에 content-length 포함(allHeaders:true)
✅ S1 서명 N + 정확히 N 전송: 업로드 성공        status=200
✅ S2 서명 N + 초과 M 전송: 거부(크기 강제)      status=403 (SignatureDoesNotMatch)
✅ S3 대조군(content-length 미서명): 초과도 통과  status=200
```

S2가 핵심 — content-length가 서명에 들어가면 선언과 다른 크기는 `403`으로 거부된다. 대조군 S3는
미서명 시 초과가 통과함을 보여, 강제가 **서명 때문**임을 확인한다.

### 브라우저 층 (실제 Chrome, 2회 재현 PASS)

```
S1 정확(body=1000): {"status":200}   ← 정상 업로드
S2 초과(body=5000): {"status":403}   ← 크기 강제
판정: PASS
```

네트워크 원증거: `OPTIONS 204`(CORS preflight 통과) + 초과 `PUT 403`. 브라우저 `fetch`는
`Content-Length`를 **body 크기로 자동설정**(개발자 조작 불가)하므로, 정확한 크기는 서명과 일치해
통과하고 초과는 불일치로 거부된다 — 즉 **브라우저가 헤더를 조작할 수 없다는 점이 오히려 강제를 성립**시킨다.

> **관측: 간헐 `PUT 503`** — 브라우저 연속 요청 시 MinIO 로컬이 일시 `503`을 반환한 적이 있다.
> 크기 강제와 무관한 **로컬 부하성 오류**다(Node 스토리지 스파이크는 503 없이 깨끗한 4/4).
> 구현 시 업로드 실패 재시도로 흡수하고, 실제 R2에서 재확인한다.

## 결론 · 구현 함의

**§결정 8 게이트 통과 → 사진 기능 출시 경로 유효(de-scope 레버 불필요).** 구현 시:

- presign에서 **`allHeaders: true`** + `Content-Length` 헤더로 크기를 서명에 고정한다.
- 클라이언트 업로드는 **정확한 파일 크기**로 PUT(브라우저 fetch가 자동 설정) — 별도 헤더 조작 불필요.
- **CORS**: cross-origin PUT은 preflight를 유발한다. MinIO는 기본 통과했으나 **실제 R2 버킷 CORS 정책은
  구현 선행 재확인 항목**이다 — `AllowedOrigins`=앱 origin 명시(wildcard 금지) · `AllowedMethods`=`PUT`
  (OPTIONS는 R2가 preflight로 처리, 별도 등록 아님) · `AllowedHeaders`=`Content-Type`·`If-None-Match` ·
  `ExposeHeaders`=`ETag`. `Content-Length`는 브라우저가 자동 설정하므로 별도 노출 헤더가 아니다.
- 업로드 실패(간헐 503 등) **재시도**를 클라이언트에 둔다.

### 검증 한계

로컬 MinIO 기준이다. **실제 Cloudflare R2에서의 동일 동작 + CORS 정책은 구현 시 재확인**한다(R2는
S3 호환·aws4fetch 공식 권장이라 확신은 높으나 미검증). 이 재확인을 Plan 3 구현의 선행 항목으로 둔다.

## 재현

```bash
docker compose up -d   # MinIO
# 스토리지 층
./node_modules/.bin/dotenv -e .env.local -- node docs/superpowers/spikes/2026-07-24-photo-content-length/storage-layer.mjs
# 브라우저 층: 아래 서버를 띄우고 브라우저로 http://localhost:8787 접속
./node_modules/.bin/dotenv -e .env.local -- node docs/superpowers/spikes/2026-07-24-photo-content-length/browser-server.mjs
```
