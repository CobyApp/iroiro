# 참고 오픈소스

이 아키텍처가 어디서 왔는지의 출처. 새 패턴을 도입할 때는 반드시 이 표 안에서 인용 가능해야 한다 — "어디선가 본 것 같아서"는 거부.

## 베이스 + 부분 차용

| 역할 | 프로젝트 | 차용 범위 |
|---|---|---|
| **베이스 폴더 컨벤션** | [formbricks/formbricks](https://github.com/formbricks/formbricks) | `apps/web/modules/<도메인>/` 응집 구조 |
| **`/admin` 라우트 그룹** | [elie222/inbox-zero](https://github.com/elie222/inbox-zero) | `app/(app)/admin/` 정공법, `isAdmin()` 함수 |
| **버전 핀** | inbox-zero | Next 16.2.4 + React 19.2.5 (참고 기준) |
| **R2 통합 패턴** | [dubinc/dub](https://github.com/dubinc/dub) | `lib/storage.ts`의 AwsClient + region: "auto" |
| **인증** | [Supabase 공식 SSR 가이드](https://supabase.com/docs/guides/auth/server-side/nextjs) | server/client/middleware 3분리 그대로 |
| **결제 게이트웨이 포트/어댑터** | [medusajs/medusa](https://github.com/medusajs/medusa) · [vendure-ecommerce/vendure](https://github.com/vendure-ecommerce/vendure) | `AbstractPaymentProvider`(Medusa)·코어 내장 `dummyPaymentHandler`(Vendure) = PG를 포트 뒤에 두고 mock 어댑터로 대체, `PAYMENT_PROVIDER` env로 교체. `lib/payments/`에 구현 |
| **주소 입력 위젯** | [Daum 우편번호 서비스](https://postcode.map.daum.net/guide) | 체크아웃 배송지 우편번호·기본주소 자동완성. 무료·키 불필요. `next/script` lazy 로드(외부 런타임 스크립트 1건) |
| **문서 다이어그램 표기 (Mermaid)** | [elie222/inbox-zero](https://github.com/elie222/inbox-zero/blob/main/.devcontainer/README.md) (`.devcontainer/README.md`가 `graph LR` + `subgraph`로 아키텍처 다이어그램) · [supabase/supabase 문서 기여 가이드](https://github.com/supabase/supabase/blob/master/apps/docs/CONTRIBUTING.md) (flowchart·sequence·ER 다이어그램을 Mermaid 펜스로 작성하도록 기여자에게 명시 지시) | GitHub이 비공개 저장소에서도 네이티브 렌더링하는 `mermaid` 펜스로 구조·흐름 다이어그램을 작성한다. **현재 차용 범위는 README의 시스템 개요 1건뿐** — 나머지 문서의 ASCII 박스 다이어그램은 유지한다(터미널·`cat`·에디터에서 즉시 읽히고, VS Code 기본 프리뷰는 Mermaid를 렌더하지 못함). 확산 여부는 GitHub 실렌더링 확인 후 재판단 |
| **서버 액션 오류 계약** | [elie222/inbox-zero](https://github.com/elie222/inbox-zero) (next-safe-action의 `{ data, serverError }` 결과) + [Next.js 공식 error-handling 가이드](https://nextjs.org/docs/app/getting-started/error-handling) | 예상 오류(중복·재고·상태 충돌·rate limit 등)는 throw가 아니라 `ActionResult` 판별 유니온 **반환값**으로 모델링(`lib/action-result.ts`의 `runAction`/`DomainError`). 프로덕션 빌드에서 Server Action이 throw한 Error는 message가 digest로 치환·소실되므로(실측), 사용자 표시 메시지는 반드시 반환값으로 전달한다. 진짜 불변식 위반·시스템 오류·`redirect`/`notFound`는 그대로 throw. inbox-zero의 결과 반환 패턴을 라이브러리 없이 최소 구현으로 차용 |
| **고객용 상품 이미지 보호** | [Sharp 공식 composite API](https://sharp.pixelplumbing.com/api-composite/) + [Next.js 공식 Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) + [Cloudflare R2 public bucket access control](https://developers.cloudflare.com/r2/buckets/public-buckets/) | 고객 화면은 R2 원본 URL 대신 서명된 same-origin GET Route Handler만 사용한다. Node 런타임에서 원본을 축소·반복 워터마크·WebP 재인코딩하고 캐시한다. 운영에서는 `products/original/*`의 공개 도메인 우회를 WAF로 차단하고 `r2.dev` 공개 URL을 비활성화한다. 관리 화면의 원본 작업은 S3 서명 경로로 유지한다. |

## 명시적으로 거부한 패턴

| 패턴 | 출처 | 거부 이유 |
|---|---|---|
| `utils/actions/<도메인>.ts` 평면 폴더 | inbox-zero | 도메인 응집을 깸 |
| Better-auth, NextAuth 도입 | inbox-zero / formbricks | Supabase Auth와 중복 |
| `modules/ee/` 별도 LICENSE 분리 | formbricks | MVP에 과잉 |
| `apps/web/lib/<도메인>/` | formbricks 일부 | 룰 1 위반 (도메인 lib 침범) |
| 모노레포 (`apps/`, `packages/`) | midday, dub, formbricks | MVP 단일 앱이면 불필요 |

## 평가 결론

> **장점은 +20% 늘었고 단점은 +10% 늘었으니 순이익 양수.**
> 단 "합본 아키텍처"라 부르지 말고 **"formbricks 베이스 + inbox-zero 패치 2건"** 으로 명명해 정독 범위를 좁힌다.

근거 자료는 대화 히스토리 및 각 GitHub 리포 직접 확인(2026-04-29, Mermaid 항목은 2026-08-06 추가 확인).

## 새 패턴 도입 시 절차

1. 위 "베이스 + 부분 차용" 표에 추가될 만한가?
2. "거부 패턴" 표와 충돌하지 않는가?
3. 실제 운영 중인 프로덕션 OSS에 코드로 존재하는가? (스타터/데모는 근거 부족)
4. 위 3개를 통과하면 이 문서에 출처와 차용 범위를 추가한 뒤 도입.
