import "server-only";

import { r2, r2Endpoint, r2UgcBucket } from "./client";

// §결정 8 상수 — 값 변경은 스펙 개정과 함께.
export const UGC_PUT_TTL_SECONDS = 600; // presigned PUT·대기 사진 10분
export const UGC_GET_TTL_SECONDS = 900; // 서명 GET 15분(숨김·삭제 후 잔여 접근 상한)
export const UGC_CACHE_CONTROL = "private, no-store"; // 캐시 계약(P1-2) — 최적화·공유 캐시 차단

// R2 요청 견고성 수치(P2-2 확정) — 재시도는 네트워크·5xx만, 4xx(412 포함) 금지.
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 300; // 300ms → 900ms (+ jitter ≤100ms)

export class R2ConditionFailedError extends Error {}
export class R2RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "R2RequestError";
  }
}

// 파이프라인 전체 예산 signal을 호출부(pending-photo)가 주입한다(P1-3) — 요청별 timeout과 결합해
// "min(요청 10초, 남은 전체 예산)"으로 동작하고, 예산 소진 시 진행 중 요청도 중단된다.
export type R2CallOptions = { signal?: AbortSignal };

function objectUrl(key: string): string {
  return `${r2Endpoint}/${r2UgcBucket}/${key}`;
}

// 백오프도 예산 signal에 반응해야 한다 — 안 그러면 예산 소진 후에도 재시도 대기가 남는다.
function backoff(attempt: number, signal?: AbortSignal): Promise<void> {
  const ms = BACKOFF_BASE_MS * 3 ** attempt + Math.random() * 100;
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// 서명된 Request를 요청별 timeout으로 실행. 5xx·네트워크 오류만 재시도(최대 2회).
// 전체 예산 signal이 abort되면 재시도 없이 즉시 중단한다.
async function fetchWithRetry(request: Request, options: R2CallOptions = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const response = await fetch(request.clone(), { signal });
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await backoff(attempt, options.signal);
        continue;
      }
      return response;
    } catch (error) {
      if (options.signal?.aborted) throw error; // 예산 소진 — 재시도 금지
      if (attempt < MAX_RETRIES) {
        await backoff(attempt, options.signal);
        continue;
      }
      throw error;
    }
  }
}

// 임시 키 presign — Content-Length·Content-Type·If-None-Match를 서명에 고정(allHeaders).
// 크기 강제 스파이크(2026-07-24) 실증: 선언과 다른 크기는 403 SignatureDoesNotMatch.
export async function presignUgcPut(
  key: string,
  contentType: string,
  sizeBytes: number,
): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(UGC_PUT_TTL_SECONDS));
  const signed = await r2.sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(sizeBytes),
        "If-None-Match": "*", // 최초 업로드 후 동일 키 덮어쓰기 차단
      },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

// 비공개 버킷 서빙용 서명 GET — 발급 여부(노출 판단)는 호출부(queries·admin signer) 책임.
export async function getSignedUgcGetUrl(
  key: string,
  expiresInSeconds = UGC_GET_TTL_SECONDS,
): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await r2.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export type UgcObjectHead = {
  etag: string;
  contentType: string | null;
  contentLength: number | null;
};

export async function headUgcObject(
  key: string,
  options: R2CallOptions = {},
): Promise<UgcObjectHead | null> {
  const signed = await r2.sign(new Request(objectUrl(key), { method: "HEAD" }));
  const response = await fetchWithRetry(signed, options);
  if (response.status === 404) return null;
  if (!response.ok) throw new R2RequestError(`HEAD 실패: ${key}`, response.status);
  const etag = response.headers.get("etag");
  if (!etag) throw new R2RequestError(`ETag 없음: ${key}`, response.status);
  const length = response.headers.get("content-length");
  return {
    etag,
    contentType: response.headers.get("content-type"),
    contentLength: length !== null ? Number(length) : null,
  };
}

// 검증용 헤더 바이트 — If-Match(ETag 고정)로 "검증 후 교체" TOCTOU 차단(§결정 8).
export async function getUgcObjectRange(
  key: string,
  etag: string,
  start: number,
  endInclusive: number,
  options: R2CallOptions = {},
): Promise<Uint8Array> {
  const signed = await r2.sign(
    new Request(objectUrl(key), {
      method: "GET",
      headers: { Range: `bytes=${start}-${endInclusive}`, "If-Match": etag },
    }),
  );
  const response = await fetchWithRetry(signed, options);
  if (response.status === 412) throw new R2ConditionFailedError(`ETag 불일치: ${key}`);
  if (response.status !== 200 && response.status !== 206) {
    throw new R2RequestError(`range GET 실패: ${key}`, response.status);
  }
  return new Uint8Array(await response.arrayBuffer());
}

// 조건부 복사(임시 → 최종) — x-amz-copy-source-if-match(ETag 고정) + 최종 객체 메타 명시(REPLACE):
// Content-Type·Cache-Control(private, no-store — P2-1 캐시 계약).
export async function copyUgcObject(
  srcKey: string,
  destKey: string,
  etag: string,
  contentType: string,
  options: R2CallOptions = {},
): Promise<void> {
  const signed = await r2.sign(
    new Request(objectUrl(destKey), {
      method: "PUT",
      headers: {
        "x-amz-copy-source": `/${r2UgcBucket}/${srcKey}`,
        "x-amz-copy-source-if-match": etag,
        "x-amz-metadata-directive": "REPLACE",
        "Content-Type": contentType,
        "Cache-Control": UGC_CACHE_CONTROL,
      },
    }),
  );
  const response = await fetchWithRetry(signed, options);
  if (response.status === 412) throw new R2ConditionFailedError(`복사 ETag 불일치: ${srcKey}`);
  if (!response.ok) throw new R2RequestError(`복사 실패: ${destKey}`, response.status);
  // S3 CopyObject는 200 응답 바디에 오류를 담을 수 있다 — <Error> 감지 시 실패 처리.
  const body = await response.text();
  if (body.includes("<Error>")) {
    throw new R2RequestError(`복사 실패(응답 오류): ${destKey}`, response.status);
  }
}

// 멱등 삭제 — 404도 성공. 실패는 throw 대신 false(호출부가 보상 로그 판단).
export async function deleteUgcObject(
  key: string,
  options: R2CallOptions = {},
): Promise<boolean> {
  try {
    const signed = await r2.sign(new Request(objectUrl(key), { method: "DELETE" }));
    const response = await fetchWithRetry(signed, options);
    return response.ok || response.status === 404;
  } catch {
    return false; // 예산 중단·네트워크 실패 포함 — 호출부가 보상 로그로 처리
  }
}
