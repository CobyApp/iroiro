# 모바일 하단 네비게이션 바 (Bottom Navigation) — 설계

- 날짜: 2026-07-22
- 상태: 구현 완료
- 브랜치: `feat/design-revamp`

## 갱신 (2026-07-22, 구현 중 반영)

초기 설계에서 아래 두 가지가 변경됨:

1. **모바일 하단 바 5탭 → 4탭.** `컬렉션`을 독립 탭에서 빼고 `마이` 팝오버 안으로
   흡수(팝오버: 인사 + 내 컬렉션 + 로그아웃). 최종 탭: **홈 · 장바구니 · 주문 · 마이**.
2. **데스크톱 상단 바: 메뉴 전부 노출.** `홈 · 컬렉션 · 주문`을 상단 링크로 직접
   노출(`DesktopNavLinks`), 장바구니는 아이콘, 우측 계정은 로그인 시 이름+로그아웃
   드롭다운 / 비로그인 시 로그인 버튼. 이에 맞춰 `AccountMenu` 드롭다운에서
   주문·컬렉션 링크를 제거(상단으로 이동)하고 인사+로그아웃만 남김.

아래 원문 설계는 초기 안이며, 위 갱신이 우선한다.

## 배경 / 목표

현재 이동 목적지(홈·장바구니·계정, 그리고 계정 드롭다운 안의 주문 내역·내
컬렉션)가 상단 헤더에 흩어져 있어 모바일에서 접근성이 떨어진다. 네이티브
앱처럼 **모바일 화면 하단에 고정 탭바**를 두어 핵심 목적지를 한 번에 노출한다.

**데스크톱 UI는 변경하지 않는다.** 이 작업은 모바일(`< sm`, 640px) 전용이다.

## 범위

**포함**
- 모바일 전용 하단 고정 탭바(5탭) 신규 추가
- 모바일 상단 헤더에서 장바구니·계정 클러스터 숨김(로고만 노출)
- 고정 바가 콘텐츠·푸터를 가리지 않도록 하단 여백 확보
- `KakaoFloat`(문의 플로팅 버튼) 을 모바일에서 바 위로 올림

**비포함(Non-goals)**
- 데스크톱 레이아웃 변경
- 신규 마이페이지(`/mypage`) 생성 — "마이"는 팝오버로 처리
- 검색/필터 UI 변경(카탈로그 페이지 소관)
- 라우트·API·데이터 모델 변경

## 결정 사항

1. **탭 개수/구성**: 5탭 — 홈 · 내 컬렉션 · 장바구니 · 주문 · 마이
2. **Breakpoint**: `< sm`에서만 바 노출(`sm:hidden`). 상단 헤더의 장바구니·계정은
   `hidden sm:flex` → 모바일은 로고만.
3. **비로그인 처리**: 5탭 모두 노출. 보호 탭(내 컬렉션·주문·마이)의 `href`를
   `/login`으로 → 탭하면 로그인 유도. 탭 개수가 상태에 따라 바뀌지 않아 안정적.
4. **"마이" 탭(로그인 상태)**: 위로 열리는 계정 팝오버 — `{닉네임}님 ✿` + 로그아웃.
   데스크톱 `AccountMenu`의 내용/`logout` 액션 재사용.
5. **KakaoFloat**: 모바일에서 바 높이 + safe-area 만큼 위로(`bottom` 오프셋 상향),
   데스크톱은 `bottom-6` 유지.

## 탭 정의

| 탭 | 아이콘(lucide) | 이동 | 로그인 필요 | 활성 판정 |
|----|----------------|------|:-----------:|-----------|
| 홈 | `Home` | `/` | – | pathname === `/` |
| 컬렉션 | `LayoutGrid` | `/collections` | ✓ | startsWith `/collections` |
| 장바구니 | `ShoppingBag` (+개수 배지) | `/cart` | – | startsWith `/cart` |
| 주문 | `Receipt` | `/orders` | ✓ | startsWith `/orders` |
| 마이 | `User` | 팝오버 / `/login` | ✓ | – |

- 아이콘은 기존 `AccountMenu`·`CartButton`과 통일.
- 비로그인 시 보호 탭은 `href="/login"`.

## 컴포넌트 구조

기존 `CartButton`(서버) → `AccountMenu`(클라이언트) 패턴을 그대로 따른다.

### `MobileTabBar` (서버 컴포넌트)
- 위치: `app/(shop)/_components/MobileTabBar.tsx`
- 책임: 신원·장바구니 개수 조회
  - `const account = await getCurrentAccount();`
  - `const cartCount = account ? await getCartCount(account.id) : 0;`
- 렌더: `<MobileTabBarClient isAuthed={!!account} displayName={account?.displayName ?? null} cartCount={cartCount} />`
- 레이아웃에서 `<Suspense>`로 감싼다(비동기 조회, `CartButton`과 동일).

### `MobileTabBarClient` (클라이언트 컴포넌트)
- 위치: `app/(shop)/_components/MobileTabBarClient.tsx`
- Props: `{ isAuthed: boolean; displayName: string | null; cartCount: number }`
- `usePathname()`으로 활성 탭 판정.
- 탭 정의는 배열 상수로: `{ key, label, icon, href, requiresAuth }`.
  - `requiresAuth && !isAuthed` → `href = "/login"`.
- 장바구니 탭: `cartCount > 0`일 때 `Badge` 표시(`CartButton`과 동일 스타일).
- 마이 탭:
  - `!isAuthed` → `/login` 링크.
  - `isAuthed` → `Popover` 트리거, 콘텐츠에 `{displayName}님 ✿` + 로그아웃
    (`form action={logout}`). `AccountMenu`의 팝오버 콘텐츠를 재사용/발췌.
- 컨테이너: `fixed inset-x-0 bottom-0 z-40 sm:hidden`,
  `border-t-[3px] border-border bg-cream/95 backdrop-blur`,
  하단 safe-area: `pb-[env(safe-area-inset-bottom)]`.
- 각 탭: 세로(아이콘 위 / 작은 라벨 아래), 활성 시 색 강조(Y2K 키치 톤 유지).

## 레이아웃 변경 (`app/(shop)/layout.tsx`)

1. 헤더 우측 클러스터(`CartButton` + `AccountNav`)를 감싼 `div`에 `hidden sm:flex`
   → 모바일은 로고만.
2. 푸터 뒤(또는 루트 컨테이너)에서 `<Suspense><MobileTabBar /></Suspense>` 렌더.
3. 루트 컨테이너에 모바일 하단 여백: `pb-16 sm:pb-0`(+ safe-area) → 고정 바가
   `main`/`SiteFooter`를 가리지 않게.

## KakaoFloat 변경 (`app/(shop)/_components/KakaoFloat.tsx`)

- 현재: `fixed bottom-6 right-6 z-40`.
- 변경: 모바일에서 바(약 4rem) + safe-area + 간격만큼 위로.
  예) `bottom-24 sm:bottom-6`(또는 `bottom-[calc(...)]`로 safe-area 반영).
  데스크톱(`sm:`)은 `bottom-6` 유지. `right`·`z`는 그대로.

## 엣지 케이스

- **활성 판정**: `/`는 정확히 일치, 나머지는 `startsWith`로 하위 경로 포함.
- **배지**: `cartCount === 0`이면 배지 숨김.
- **비로그인**: 보호 탭 눌러 `/login` 이동해도 탭 개수·레이아웃 불변.
- **iOS 홈 인디케이터**: `env(safe-area-inset-bottom)`으로 바·플로팅 버튼 여백 보정.
- **접근성**: 각 탭 `aria-label`, 활성 탭 `aria-current="page"`.

## 테스트 계획 (Vitest + RTL)

`MobileTabBarClient` 대상(순수 props, 클라이언트):
- 5개 탭이 모두 렌더된다.
- `pathname`에 따라 올바른 탭이 활성(`aria-current="page"`)이다.
- `isAuthed=false`면 보호 탭(컬렉션·주문·마이)의 `href`가 `/login`이다.
- `cartCount > 0`이면 장바구니 배지에 개수가 보이고, `0`이면 안 보인다.
- `isAuthed=true`면 마이 탭이 팝오버 트리거이고, 로그아웃 폼을 포함한다.

구현 후 프리뷰를 모바일 뷰포트(375px)로 리사이즈해 시각·상호작용 검증.

## 향후(Out of scope, 참고)

- 정식 `/mypage` 페이지가 생기면 "마이" 탭을 팝오버 대신 페이지 링크로 전환.
