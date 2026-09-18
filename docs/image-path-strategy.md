# 이미지 경로(R2 객체 키) 설계 전략

상품 사진을 Cloudflare R2에 **어떤 키(경로) 규칙으로 저장할지**에 대한 의사결정 기록.
[`image-strategy.md`](./image-strategy.md)가 *왜 R2인가*(스택 선택)를 다룬다면, 이 문서는 *R2 안에서 키를 어떻게 나눌 것인가*(레이아웃 설계)를 다룬다.

- **상태**: 경로·식별자(UUIDv7) 구현 완료 · 샤딩 미도입(raw) · 캐시는 Cloudflare Cache Rule로 적용(절차: [r2-adoption.md](./r2-adoption.md) > CDN 캐싱)
- **작성일**: 2026-05-30
- **관련**: [`docs/lessons/08-r2-storage-pattern.md`](./lessons/08-r2-storage-pattern.md)가 "r2_key 설계 — 운영하면서 결정"으로 열어둔 항목을 이 문서가 확정한다.

---

## 목차

1. [배경과 범위](#1-배경과-범위)
2. [현재 상태 진단](#2-현재-상태-진단)
3. [요구사항 (논의로 확정)](#3-요구사항-논의로-확정)
4. [외부 베스트 프랙티스 조사](#4-외부-베스트-프랙티스-조사)
5. [핵심 논점과 결정](#5-핵심-논점과-결정)
   - 5.1 [평면 프리픽스의 단점과 샤딩](#51-평면-프리픽스의-단점과-샤딩)
   - 5.2 [경로 기반 캐싱 — 어느 "차원"이 필요한가](#52-경로-기반-캐싱--어느-차원이-필요한가)
   - 5.3 [식별자 선택: ULID vs UUIDv4 vs UUIDv7](#53-식별자-선택-ulid-vs-uuidv4-vs-uuidv7)
   - 5.4 [(참고) 나중에 샤드를 추가한다면](#54-참고-나중에-샤드를-추가한다면)
6. [최종 설계](#6-최종-설계)
7. [결정 요약](#7-결정-요약)
8. [참고 자료](#8-참고-자료)

---

## 1. 배경과 범위

"커머스는 사진 데이터가 많은데, S3 같은 스토리지에 어떤 경로로 저장하는 게 좋은가?"라는 질문에서 출발했다.
현재 키 생성 규칙을 검토한 결과 몇 가지 약점이 드러났고, **나중에 규모가 커져도 깨지지 않는 깔끔한 경로 규칙**을 확정하는 것을 목표로 외부 사례를 조사하고 설계를 정리했다.

**범위 안**: 키(경로) 레이아웃, 식별자 종류, 샤딩 여부, 변형(variants) 자리 예약, 캐시 메타데이터.
**범위 밖**: 변형 이미지 *생성* 로직, 기존 데이터 마이그레이션, 공개→비공개 접근제어 전환. (→ [6. 최종 설계](#6-최종-설계)의 범위 밖 참조)

## 2. 현재 상태 진단

코드 검토(`lib/r2/presign.ts`, `modules/products/actions.ts`, `prisma/schema.prisma`) 결과:

| 항목 | 현재 상태 | 위치 |
|---|---|---|
| 키 형식 | `products/{id}/{timestamp}-{rand6}.{ext}` | `lib/r2/presign.ts` `buildR2Key` |
| 실제 `{id}` | **`pending-{Date.now()}`** — presign이 상품 생성 *전*이라 임시값 | `actions.ts` `presignProductPhotos` |
| 난수 | `Math.random().toString(36)` — **암호학적 난수 아님** | 〃 |
| 저장 | `product_photo.r2_key`에 전체 키 문자열 | `schema.prisma` |
| 변형 | **없음** — 원본 1장만, UI 모든 곳에서 원본 풀사이즈 fetch | 갤러리/카드/리스트 |

**약점 3가지**

1. **경로가 상품을 식별하지 못함** — `pending-…` 세그먼트가 영구히 남는다. lesson 08이 경고한 *"처음부터 안정적인 식별자로"* 를 위반.
2. **원본/변형 분리 없음** — 변형을 둘 자리가 설계에 없고, 목록에도 원본 풀사이즈를 내려보내 대역폭 손해.
3. **난수 품질** — `Math.random()`은 충돌·예측 위험. 적절한 식별자로 교체 필요.

## 3. 요구사항 (논의로 확정)

| 질문 | 확정 |
|---|---|
| 예상 규모 | **미정 — 우선 "커져도 안 깨지는 깔끔한 구조"** 목표 (성능용 파티셔닝은 불필요) |
| 이미지 변형 | **나중에 도입 — 경로에 자리만 예약** (생성 로직은 범위 밖) |
| 기존 데이터 | **신규 업로드부터만 새 규칙** (마이그레이션 없음, 기존 키는 그대로 유효) |
| 업무 차원(상품·기획전) 캐싱/퍼지 | **불필요** 확인됨 (→ [5.2](#52-경로-기반-캐싱--어느-차원이-필요한가)) |

## 4. 외부 베스트 프랙티스 조사

1. **모던 S3/R2는 프리픽스를 자동 스케일.** S3는 프리픽스당 **3,500 write / 5,500 read req/s**, 초과 시 자동 분할(2018년 이후). 과거의 *"성능을 위해 랜덤 프리픽스로 분산"* 조언은 대부분 불필요해졌다. ([AWS S3 성능](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html), [AWS 객체 키 명명](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html))
2. **엔티티 기반 계층 경로**가 표준 — `products/{...}`처럼 도메인 식별자를 앞에 둔다.
3. **원본과 변형(파생)을 분리** — `original/` vs `variants/` 프리픽스. 원본은 백업/복제 대상, 변형은 재생성 가능하므로 lifecycle로 정리 가능. ([Solidus: Storing images on S3/CDN](https://github.com/solidusio/solidus/wiki/Storing-images-on-S3-and-CDN%27s))
4. **불변 키 + 긴 TTL + CDN 캐시** — 키가 불변이면 `Cache-Control: max-age=1년, immutable`로 캐시 최적화.
5. **키 안전 문자** — 영숫자 + `- _ . * ' ( )`. `/`는 폴더 구분에만. ([AWS 객체 키 명명](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html))
6. **R2는 평면 구조 + LIST 1,000건/페이지**, 용량 확장은 버킷 샤딩 권장. ([R2 Limits](https://developers.cloudflare.com/r2/platform/limits/))

> **핵심 통찰**: "사진이 많으니 경로를 잘 나눠야 한다"의 실제 이유는 *성능*이 아니라 *운영·조직화*다. R2/S3는 알아서 스케일하므로, 우리가 얻을 실익은 ① 안정적 식별자, ② 원본/변형 분리, ③ 불변키+CDN 캐시다.

## 5. 핵심 논점과 결정

### 5.1 평면 프리픽스의 단점과 샤딩

**오해부터 정리**: S3/R2는 폴더가 없는 평면 키-값 저장소다. `products/original/`는 진짜 디렉토리가 아니라 키 접두사일 뿐이라 — 프리픽스당 객체 수 제한이 없고, **개별 GET/PUT 속도는 형제 파일 수와 무관**하다(우리는 DB의 정확한 키로 직접 fetch). 즉 파일시스템식 "한 폴더에 파일 too many" 문제는 적용되지 않는다.

**진짜 단점 2가지**

- **① LIST·콘솔 브라우징 부담** — LIST는 1,000건/페이지 페이지네이션이라 평면 프리픽스에 수십만 개가 쌓이면 콘솔 탐색·정합성 점검이 무거워진다. (단, 이 앱은 런타임에 LIST를 안 함 → 영향은 운영/콘솔 한정)
- **② (S3 한정) 순차 키 쓰기 핫스팟** — 순차 키는 공통 접두사를 길게 공유해 자동 분산이 어렵다. (단, R2는 S3식 프리픽스 물리파티션 모델이 아니고, 관리자 업로드 수준 쓰기율이라 비현실적 위험)

**결정 (갱신)**: 샤딩은 **도입하지 않는다(raw 유지)**.

```
products/original/{id}.{ext}
```

위 두 단점 모두 이 프로젝트에선 발현되지 않는다 — 앱은 런타임에 LIST를 안 하고(DB가 인덱스), R2엔 S3식 핫스팟이 없으며, 무료 한도(≈사진 5만 장)까지 평면 프리픽스로 충분하다. 샤드는 *수십만+ 객체*에서나 의미가 있어 현 규모엔 과한 보험이다.

> 되돌리기: 정말 규모가 커지면 **신규 업로드부터 샤드를 추가**하면 되고(기존 키는 DB에 전체 경로 저장이라 공존), 전체 키가 DB에 있으니 일괄 마이그레이션(객체 rename + 행 업데이트)도 가능하다. 상품 폴더·실제 productId 경로·해시 샤드 모두 검토했으나 이 규모에선 순이득이 작았다.

### 5.2 경로 기반 캐싱 — 어느 "차원"이 필요한가

CDN은 기본적으로 URL 단위로 캐싱한다. "특정 경로만 캐싱"은 곧 *"경로마다 캐시 처리를 다르게"* 라는 뜻이고, 그 차원은 둘로 갈린다.

| 차원 | 예시 | 경로 구조 필요? |
|---|---|---|
| **종류(kind)** | `original/*`은 영구캐시, `variants/*`는 다른 정책 | ✅ `original`/`variants` prefix로 충분 |
| **업무(business)** | 특정 상품·기획전 단위로 캐싱/퍼지 | 경로에 그 차원 필요 — 우린 불필요 확인 |

**불변 키의 반전**: 키가 불변이면 "이미지 교체 = 새 키 = 새 URL"이라 **퍼지(invalidation) 자체가 거의 불필요**하다. DB의 `r2_key`만 새 키로 갈아끼우면 옛 URL은 자연 만료된다. → 업무 차원 퍼지 동기 대부분 소멸.

**결정**: 업무 차원 경로 분리는 **불필요**(논의로 확인). 캐싱은 `original`/`variants` **종류 prefix**로 충분하다.

### 5.3 식별자 선택: ULID vs UUIDv4 vs UUIDv7

| | ULID | UUIDv4 | UUIDv7 |
|---|---|---|---|
| 구성 | 48bit 시간 + 80bit 난수 | 122bit 난수 | 48bit 시간 + 74bit 난수 |
| 표기 | Base32 26자 | hex 36자 | hex 36자 |
| 시간 정렬 | ✅ | ❌ | ✅ |
| 앞자리 | 시간(순차) | 난수 | 시간(순차) |
| 표준 | 커뮤니티 | RFC 9562 | **RFC 9562** |
| Node 생성 | 라이브러리 | **`crypto.randomUUID()` 내장** | 라이브러리 |

**중요한 구분**: 웹의 "UUIDv7이 베스트 프랙티스" 합의는 **DB 기본키** 기준이다 — 그 근거는 B-tree 인덱스 지역성(insert 성능)이다. 그런데 우리 식별자는 **R2 객체 키(파일명)** 이고 `product_photo`의 PK는 별도 `bigint`라, **v7의 간판 장점(인덱스 지역성·시간정렬)이 둘 다 힘을 못 쓴다**(`created_at`이 이미 DB에 있음).

**검증한 사실**

- Node 25에도 native UUIDv7 없음 — `crypto.randomUUID()`는 v4 전용(`{version:7}` 옵션 무시됨). v7은 라이브러리 필요.
- `uuid`([uuidjs/uuid](https://github.com/uuidjs/uuid))가 JS 사실상 표준 구현체. 현재 **v14.0.0**, TypeScript 타입 번들 내장.

**결정**: 객체 키 관점에선 v4가 더 단순하지만(무의존), 검증된 공식 라이브러리(`uuid`) 추가가 허용되어 — **UUIDv7 채택**. 시간정렬 키(콘솔 디버깅 편의)와 모던 표준 통일성을 취한다. (`Math.random()`도 함께 제거)

### 5.4 (참고) 나중에 샤드를 추가한다면

> 샤딩은 현재 **미도입**(§5.1). 아래는 추후 규모가 커져 샤드를 넣을 때를 위한 참고다.

UUIDv7은 `[앞=시간][뒤=난수]` 구조라, **끝 2자리(난수부)** 를 샤드로 쓰면 해시 없이 균등 분산된다.

```
id    = 0190c6e2-7f3a-7c91-b5d2-3f9a1e4c7b88
shard = id.slice(-2)  →  "88"   (난수부. 앞 시간부로 샤딩하면 안 됨)
```

> 대안: 시간정렬 식별자에서 해시 기반 샤드가 필요하면 `sha256(id)` 앞 2자리를 쓴다(눈사태 효과로 균등 분산). 우리는 끝자리 방식으로 충분.

## 6. 최종 설계

### 키 구조

```
products/original/{uuidv7}.{ext}
products/variants/{size}/{uuidv7}.{ext}      ← 자리만 예약 (생성 로직은 범위 밖)
```

예: `products/original/0190c6e2-7f3a-7c91-b5d2-3f9a1e4c7b88.jpg`

- `products` = 엔티티 네임스페이스 (향후 확장 여지)
- `original`/`variants` = 종류 분리 (캐시·정리 정책 차등 가능)
- `{uuidv7}` = 사진 식별자(`uuid` v14), `{ext}` = 원본 확장자(소문자 정규화)
- 샤딩 없음(raw) — 근거 §5.1

### 식별자 생성

`lib/r2/presign.ts`의 `buildR2Key`를 productId 비의존으로 교체 (→ `pending-` 소멸):

```ts
import { v7 as uuidv7 } from "uuid";

export function buildR2Key(filename: string): string {
  const ext = extractExt(filename);   // 확장자 정규화·소문자·폴백
  const id = uuidv7();
  return `products/original/${id}.${ext}`;
}
```

### 변형 자리 예약 규약

- 변형 키는 **원본의 UUID를 재사용**, `{size}` 세그먼트만 다름 → 원본 키로 변형 키를 결정적으로 계산.
- `{size}` 토큰 집합만 규약화(예: `thumb`, `medium`). 실제 픽셀·생성 로직은 도입 시 결정.

### 캐시·메타데이터

- 키가 불변이므로 1년 적극 캐싱. **적용 위치 = Cloudflare Cache Rule**(엣지+브라우저 TTL) — 오브젝트 메타데이터/서명 PUT 헤더 방식 대신 CDN 레이어에서 처리해 **코드·클라이언트 변경 0**. 절차: [`r2-adoption.md`](./r2-adoption.md) > CDN 캐싱.
- `Content-Type`은 업로드 presign 서명에 현행대로 포함.

### 코드 변경 범위 / 영향

| 대상 | 변경 |
|---|---|
| `lib/r2/presign.ts` | `buildR2Key` 교체 (UUIDv7, 샤드 없음) |
| `modules/products/actions.ts` | `pending-`/`tempProductId` 제거, `buildR2Key(file.filename)` 호출 |
| `package.json` | `uuid` v14 추가 |
| `product_photo.r2_key` (DB) | **변경 없음** |
| 읽기/서빙 (`getPublicUrl`, 갤러리·다운로드·`photo-filename.ts`) | **변경 없음** |
| 기존 `pending-` 키 | **그대로 유효** (신규만 새 규칙) |

### 범위 밖 (YAGNI)

- 변형 이미지 *생성* 로직 (Cloudflare Image Resizing 등 — [`image-strategy.md`](./image-strategy.md) 참조)
- 기존 데이터 마이그레이션
- 공개→서명/비공개 접근제어 전환
- 업무 차원(상품·기획전) 경로 분리

## 7. 결정 요약

| 논점 | 결정 | 핵심 근거 |
|---|---|---|
| 경로 모양 | `products/original/{id}.{ext}` | 종류(original) 분리, 그 외는 raw |
| 샤딩 | **미도입** | 현 규모(≈5만장)엔 불필요. 필요 시 신규부터 추가 |
| 식별자 | **UUIDv7** (`uuid` v14) | 공식 라이브러리 허용 → 시간정렬·표준 채택 |
| 변형 | `variants/{size}/` 자리 예약 | 나중 도입, 경로 변경 없이 확장 |
| 캐싱 | Cloudflare Cache Rule(1년·불변키) | 코드 변경 0, 업무 차원 퍼지 불필요 확인 |
| 마이그레이션 | 신규 업로드만 | 기존 키는 전체 경로 저장이라 그대로 동작 |
| 난수 | `Math.random()` 제거 | UUIDv7로 암호학적 품질 확보 |

## 8. 참고 자료

**외부**
- [AWS — Naming Amazon S3 objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html)
- [AWS — Best practices: optimizing S3 performance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)
- [Cloudflare R2 — Limits](https://developers.cloudflare.com/r2/platform/limits/)
- [RFC 9562 — UUIDs](https://www.rfc-editor.org/info/rfc9562/)
- [UUIDv7 comes to PostgreSQL 18 (The Nile)](https://www.thenile.dev/blog/uuidv7)
- [UUID v4 vs v7 vs ULID 비교 (thetexttool)](https://thetexttool.com/compare/uuid-v4-vs-v7-vs-ulid)
- [uuidjs/uuid (npm 표준 구현체)](https://github.com/uuidjs/uuid)
- [Solidus — Storing images on S3 and CDN's](https://github.com/solidusio/solidus/wiki/Storing-images-on-S3-and-CDN%27s)

**내부**
- [`docs/image-strategy.md`](./image-strategy.md) — 이미지 스택 선택(왜 R2)
- [`docs/lessons/08-r2-storage-pattern.md`](./lessons/08-r2-storage-pattern.md) — DB는 메타·스토리지는 바이트, r2_key 설계 (이 문서가 확정)
- [`docs/lessons/03-primary-key-strategy.md`](./lessons/03-primary-key-strategy.md) — PK 식별자 전략 (UUID vs BIGINT)
