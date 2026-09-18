# 마이페이지(프로필) 개편 — 설계

- 날짜: 2026-07-22
- 상태: 승인됨 → 구현 예정
- 브랜치: `feat/design-revamp`

## 배경 / 목표

현재 하단 "마이" 탭은 작은 팝오버(인사 + 내 컬렉션 + 로그아웃)만 띄운다. 이를
**인스타그램 프로필처럼** 하나의 프로필 화면으로 바꾼다: 프로필(닉네임·소지 카드
수) + 컬렉션 그리드를 한 페이지에 보여주고, 상단에 설정 메뉴(회원정보 변경·로그아웃)
를 둔다.

## 범위

**포함**
- 신규 `/mypage` — 프로필 헤더 + 설정 메뉴 + 컬렉션 그리드(기존 `MyCollections` 재사용)
- 신규 `/mypage/edit` — 회원정보 변경(닉네임 수정 폼, 이메일·전화 읽기 전용)
- `/collections` → `/mypage` 리다이렉트
- 모바일 "마이" 탭 → `/mypage` (기존 팝오버 제거)
- 데스크톱 "컬렉션" 링크 → `/mypage`
- 닉네임 수정 server action + 리포지토리 함수

**비포함(Non-goals)**
- 이메일·전화번호 변경(인증 플로우 필요 — 읽기 전용 표시만)
- 컬렉션 관리(`/collections/manage/[id]`)·공개(`/collections/[publicCode]`) 라우트 변경
- 알림/테마 등 추가 설정 항목(추후 설정 메뉴에 확장 가능)
- 데스크톱 상단 바 구조 변경(‘컬렉션’ 링크 목적지만 `/mypage`로 변경)

## 결정 사항

1. **프로필 페이지 위치**: 신규 `/mypage`. 기존 `/collections`(탭형 마이페이지)의
   프로필+컬렉션 구성을 `/mypage`로 옮기고, `/collections`는 `/mypage`로 리다이렉트.
2. **컬렉션 배치**: 프로필에 컬렉션 그리드 직접 표시(인스타형). `MyCollections` 재사용.
3. **설정 메뉴**: 프로필 헤더 우측 상단 ⚙ 아이콘 → Popover에 **회원정보 변경**
   (→`/mypage/edit`) + **로그아웃**. ("설정"은 이 메뉴 자체를 가리킴.)
4. **회원정보 변경 범위**: 닉네임(`displayName`)만 수정 가능. 이메일·전화는 읽기 전용
   (미설정 시 "미설정" 표기).
5. **모바일 마이 탭**: 팝오버 제거, `/mypage`로 이동하는 일반 링크(비로그인 시 `/login`).

## 컴포넌트 / 파일

### 생성
- `app/(shop)/mypage/page.tsx` (서버): 인증 게이트(`getCurrentAccount`, 없으면
  `redirect("/login")`) → 계정·컬렉션·인벤토리 조회 → 프로필 헤더 +
  `ProfileSettingsMenu` + `MyCollections` 렌더. (현재 `/collections/page.tsx` 로직 이관.)
- `app/(shop)/mypage/_components/ProfileSettingsMenu.tsx` (클라이언트): ⚙ 아이콘
  `PopoverTrigger` → 회원정보 변경 `Link`(`/mypage/edit`) + 로그아웃 `form action={logout}`.
- `app/(shop)/mypage/edit/page.tsx` (서버): 인증 게이트 → 계정 조회 →
  `EditProfileForm`에 현재 `displayName`·`email`·`phoneNumber` 전달.
- `app/(shop)/mypage/edit/_components/EditProfileForm.tsx` (클라이언트): 닉네임
  `Input`(prefill) + 저장 버튼(`updateProfile` 호출, `useTransition`+toast) + 취소
  (`/mypage`로). 이메일·전화는 읽기 전용 표시.

### 수정
- `app/(shop)/collections/page.tsx`: 본문 제거 → `redirect("/mypage")`.
- `modules/auth/actions.ts`: `updateProfile({ displayName })` server action 추가 —
  `parseNickname`로 검증, 현재 세션 계정 id로 스코프(`getCurrentAccount`), 미인증 시
  throw. 성공 시 `revalidatePath("/mypage")`.
- `modules/auth/lib/account.ts`: `updateAccountDisplayName(accountId, displayName)`
  추가 — `prisma.account.update({ where: { id }, data: { displayName, updatedAt } })`.
- `app/(shop)/_components/mobile-tabs.ts`: `my` 탭 `href` → `/mypage`.
- `app/(shop)/_components/MobileTabBarClient.tsx`: 마이 팝오버 특수 분기 제거(마이 =
  일반 링크). 미사용 import(`Popover*`, `logout`, `LayoutGrid`)·`displayName` prop 정리.
- `app/(shop)/_components/MobileTabBar.tsx`: `displayName` prop 전달 제거.
- `app/(shop)/_components/DesktopNavLinks.tsx`: "컬렉션" 링크 `href` → `/mypage`.

## 데이터 흐름 (회원정보 변경)

1. `/mypage/edit`의 `EditProfileForm`에서 닉네임 입력 후 저장.
2. `updateProfile({ displayName })` server action 호출.
3. 액션: `getCurrentAccount()`(없으면 throw) → `parseNickname(displayName)`(검증) →
   `updateAccountDisplayName(account.id, parsed)` → `revalidatePath("/mypage")`.
4. 클라: 성공 toast + `router.push("/mypage")`. 실패 시 에러 toast.

## 엣지 케이스

- 비로그인 `/mypage`·`/mypage/edit` → `/login` 리다이렉트(기존 `/collections`와 동일).
- 닉네임 빈값/공백/최대 초과(`NICKNAME_MAX_LENGTH = 20`) → `parseNickname`가 throw →
  폼에서 에러 toast.
- 이메일·전화 `null` → "미설정" 표기(읽기 전용).
- `/collections` 리다이렉트는 index만 — 하위 관리/공개 라우트는 영향 없음.

## 테스트

- **순수 로직**: `mobile-tabs.test.ts` — `my` 탭 `resolveHref(authed=true)` === `/mypage`,
  `authed=false` === `/login`로 갱신.
- **server action**: `updateProfile` — (a) 잘못된 닉네임(빈값/초과) throw, (b) 유효값이면
  현재 계정 id로 `updateAccountDisplayName` 호출. 기존 `tests/modules/auth/actions.test.ts`
  패턴(리포지토리 mock) 따름, node env.
- **시각(프리뷰)**: `/mypage` 프로필+⚙설정+컬렉션 렌더 / ⚙ → 회원정보변경·로그아웃 /
  `/mypage/edit` 닉네임 저장 후 반영 / `/collections`→`/mypage` 리다이렉트 / 모바일 마이
  탭→`/mypage` / 데스크톱 컬렉션→`/mypage`.

## 향후(참고)

- 이메일·전화 변경(인증 플로우), 알림·테마 등은 설정 메뉴/`/mypage/edit`에 확장.
