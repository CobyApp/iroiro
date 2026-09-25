# 중고거래 직거래 + 취소·환불·분쟁(안전거래) 설계

작성 2026-09-25. 승인된 브레인스토밍 결과의 단일 원천. 결제·정산을 건드리는 민감 변경이라
2단계로 나눠 구현한다.

## 목표
1. 중고 매물 등록에 **직거래**를 택배와 **독립 선택**으로 추가한다(둘 다·택배만·직거래만).
2. 직거래 선택 시 **선호 만날 장소를 최대 3곳** 미리 지정한다(카카오맵 검색/핀 + 라벨 + 좌표).
3. 매물 상세에 **지도**로 만날 장소를 보여준다.
4. **취소·환불·분쟁 가이드라인**을 정하고 기능으로 잇는다(구매자·판매자 양쪽, 택배+직거래).

## 배송/거래 방식 모델 (독립 선택)
`used_listing`:
- `parcel_enabled boolean` — 택배 가능. true 면 기존 `shipping_method`(post|parcel)·`shipping_fee` 사용.
- `direct_enabled boolean` — 직거래 가능.
- `meet_locations jsonb` — 직거래 만날 장소 배열(최대 3). 요소: `{ label, address, lat, lng }`.
- 제약: `parcel_enabled OR direct_enabled` 최소 하나 true(스키마 refine + DB CHECK).
- 기존 데이터 마이그레이션: `parcel_enabled=true`(현행 전부 택배)로 백필, `direct_enabled=false`.

`meet_locations` 요소 검증: label 1~30자, address 문자열, lat/lng 유효 범위(대한민국 대략 33~39, 124~132; 범위 밖은 거부). 최대 3개.

## 거래 상태 머신 (used_trade)
기존: `pending → paid → shipped → completed`, `canceled`.
추가 상태: `handed_over`(직거래 대면 전달 표시), `disputed`(분쟁), `refunded`(환불 완료).
추가 필드: `handed_over_at`, `disputed_at`, `dispute_reason`, `refunded_at`, `refund_amount`, `refund_reason`, `resolved_by`(관리자), `trade_kind`(parcel|direct — 구매 시 확정).

전이(모두 조건부 updateMany 로 멱등):
- pending → paid (결제 승인), pending → canceled (실패/취소).
- **택배**: paid → shipped(송장) → completed(수령확정 or 발송 7일 자동확정) → 정산.
- **직거래**: paid → handed_over(판매자 전달표시) → completed(수령확정 or 전달 3일 자동확정) → 정산.
- **취소·환불(신규)**:
  - paid & 아직 미발송/미전달 → **refunded**(구매자/판매자 취소, PG 환불). 매물 active 복귀.
  - 택배 paid 후 3일 미발송 → 구매자 취소 가능 → refunded.
  - 직거래 paid 후 14일 미전달·미확정 → 자동 refunded(구매자 보호).
  - shipped/handed_over 후 문제 → **disputed**(자동확정 정지) → 관리자가 refunded 또는 completed 로 종결.
- completed·refunded·canceled 는 종결 상태.

## 환불 원칙
- **보호(환불):** 미발송, 미도착/분실, 파손, 설명과 다름(하자·가품).
- **비보호:** 단순 변심(판매자 동의 시에만). 신고 화면에서 사유를 하자/변심으로 구분 노출.

## 결제·환불(PG)
`CheckoutProvider`에 `refund(input) : Promise<{ ok; failMessage? }>` 추가.
- KakaoPay: 결제취소 API(`/online/v1/payment/cancel`, cid+tid+cancel_amount) 구현.
- Mock: 항상 성공(개발/폴백).
환불 시 사용 포인트 복원, 매물 상태 복귀, 양측 알림.

## 구매(buy) 흐름 변경
- 구매자가 매물의 거래 방식 중 선택: 택배(가능할 때, 배송지 입력) 또는 직거래(가능할 때, 배송지 불필요·만날 장소 확인).
- `usedBuySchema`: `tradeKind`(parcel|direct) 추가. parcel 이면 recipient* 필수, direct 면 recipient* 생략.
- 직거래 결제도 안전거래(에스크로): paid 후 대면 수령확정 → 정산.

## UI/UX
- **등록 폼(UsedListingForm):** "거래 방식" 섹션 — [택배] 토글(+우체국/택배·배송비), [직거래] 토글. 직거래 켜면
  카카오맵 장소 선택기: 키워드 검색 → 결과 선택 or 지도 핀 드롭 → 라벨 입력 → 최대 3곳 칩 리스트. 지도에 핀 표시.
- **매물 상세:** 거래 방식 배지(택배/직거래), 직거래면 지도 + 장소 리스트. 구매 CTA 에서 방식 선택.
- **거래 화면(구매자/판매자 mypage):** 구매자 — 구매취소(미발송/미전달)·수령확정·문제신고(분쟁). 판매자 — 판매취소·발송(송장)·전달완료(직거래).
- **관리자:** 분쟁 큐(근거 열람 → 환불/정산 종결).
- **지도 컴포넌트:** 카카오맵 JS SDK(`dapi.kakao.com/v2/maps/sdk.js?appkey=<JS키>&libraries=services`). env `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`. 키 없으면 주소 텍스트 폴백(지도 숨김). 기존 Daum 우편번호와 동일하게 `<Script>` 지연 로드.

## 타이머(자동 잡)
기존 `autoConfirmUsedTradeIfDue` 확장/추가:
- 택배 발송 7일 → 자동확정.
- 직거래 전달 3일 → 자동확정.
- 택배 미발송 3일 → 구매자 취소 가능(자동 아님, 버튼 노출).
- 직거래 미전달·미확정 14일 → 자동 환불.

## 단계
- **1단계:** 직거래 옵션 + 만날장소 + 카카오맵(등록/상세) + 직거래 수령확정→정산 + 발송/전달 전 취소=환불(PG 환불 포함) + 미확정 자동확정.
- **2단계:** 분쟁(하자·미배송) 신고→관리자 중재→선택 환불, 단순변심 정책 세부, 미발송 자동취소 안내.

## 테스트
- 순수 로직(Vitest): 상태 전이 가드(각 전이 허용/거부), 환불 가능 판정, 만날장소 스키마, 타이머 컷오프.
- 액션: 결제취소=환불 멱등, 권한(구매자/판매자/관리자), 직거래 배송지 없음 검증.
- 회귀: 기존 택배 흐름·자동확정 유지.

## 멀티테넌시/보안
iroiro 단일 앱(모노레포 아님). 결제 콜백·환불은 소유권 검증(구매자/판매자 본인) 필수. 관리자 전용 분쟁 API 는 requireAdmin.
