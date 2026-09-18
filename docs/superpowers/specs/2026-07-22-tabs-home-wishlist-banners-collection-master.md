# 탭 개편·홈·찜·배너·컬렉션 자동분류 — 마스터 설계

- 날짜: 2026-07-22
- 상태: 승인됨(전부 진행) → 단계별 구현
- 브랜치: `feat/design-revamp`

> **대형 6종.** 브랜치에 단계별(Phase)로 쌓아 완성한다. 각 Phase는 test·commit로
> 품질 확보. 신규 DB 엔티티(Wishlist·Banner)는 beta DB additive 마이그레이션.

## 탭 (5개)

홈 `/` · 상품 `/products` · 찜 `/wishlist` · 장바구니 `/cart` · 마이페이지 `/mypage`
아이콘(lucide): Home · Store · Heart · ShoppingBag · User.
- 찜·마이페이지: 로그인 필요(비로그인 → /login).
- 주문내역: 장바구니 탭 상단 링크(`/orders`)로 접근(+마이페이지에서도).

## Phase 1 — 탭 개편 + 상품 탭

- 현재 `/`(카탈로그: 검색·필터·그리드·페이지네이션)를 **`/products`로 이동**.
- `/`는 **새 홈**(Phase 4 전까지 임시: 간단한 히어로 + 상품 바로가기).
- `mobile-tabs.ts` → 5탭. `MobileTabBarClient` 아이콘. `DesktopNavLinks` → 상품/찜 등.
- 장바구니 탭(`/cart`) 상단에 "주문내역" 링크 추가.

## Phase 2 — 찜(Wishlist)

- 신규 엔티티 `Wishlist`(`id`, `accountId`, `productId`, `createdAt`, unique[accountId,productId]).
  마이그레이션 additive.
- 액션 `toggleWishlist(productId)`(로그인 필요), `isWished` 조회.
- `ProductCard`에 하트 토글 버튼(로그인 필요 시 /login 유도).
- `/wishlist` 페이지 — 찜한 상품 그리드.

## Phase 3 — 배너 + 관리자

- 신규 엔티티 `Banner`(`id`, `imageKey`, `linkUrl`, `title`, `startsAt`, `endsAt`,
  `sortOrder`, `createdAt`). 마이그레이션 additive.
- 관리자 `/admin/banners`(목록·생성·수정·삭제): 이미지 R2 presign 업로드(기존 패턴),
  링크 URL, 제목, 게시 시작/종료일, 정렬 순서.
- 공개 조회 `getActiveBanners()`: `startsAt <= now <= endsAt` (null은 무제한) 정렬.
- 슬라이더 컴포넌트(여러 개면 자동/수동 슬라이드). 클릭 → `linkUrl` 새 탭.

## Phase 4 — 홈 화면 (배너 + KREAM식 상품 구성)

- `/` 홈: 상단 배너 슬라이더 + 큐레이션 섹션들(신상품, 인기, 그룹별 추천 등).
  KREAM/무신사 등 커머스 UX 참고 — 가로 스크롤 캐러셀 섹션 + 섹션 헤더("더보기"→
  /products?필터).
- `listProducts`로 섹션별 조회(정렬/필터 파라미터 재사용).

## Phase 5 — 마이페이지 컬렉션 자동분류 + 시드

- 마이페이지 기본 뷰: 구매 카드(`InventoryItem`)를 **그룹(Team)/멤버(Member)별 자동 분류**
  하여 전부 표시(아무 커스텀 없어도). Product→teamId/memberId로 분류.
- "커스텀하기" 토글 → 기존 `MyCollections`(사용자 정의 컬렉션).
- 시드: 내 계정(도로롱)에 `InventoryItem`(+필요 시 Order/OrderItem) 임의 삽입 —
  beta DB. 다양한 그룹/멤버 커버.

## 공통/데이터

- 이미지 업로드: 기존 `lib/r2`(presign) 재사용(배너 `banners/`, 아바타 `avatars/`).
- 모든 신규 엔티티는 `tenant` 개념 없음(이 앱은 단일 상점) — 기존 모델과 동일.
- 마이그레이션은 additive/nullable 위주, beta DB에 `prisma db execute`로 적용.

## 테스트

- 순수/액션 단위테스트(기존 node env 패턴): 탭 href, toggleWishlist, getActiveBanners
  기간 필터, 컬렉션 분류 로직.
- 관리자 배너 CRUD·업로드는 타입·빌드 + 브라우저 검증.
- 로그인 필요 화면은 사용자 확인.

## 비목표

- 배너 인앱 상세 콘텐츠(지금은 외부 링크만).
- 실제 약관/문구, 결제 로직 변경.
