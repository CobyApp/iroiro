# 프로필 개편(레이아웃·아바타·설정·회원탈퇴) — 설계

- 날짜: 2026-07-22
- 상태: 승인됨 → 구현 예정
- 브랜치: `feat/design-revamp`

## 배경 / 목표

`/mypage`(프로필)를 인스타그램 프로필처럼 다듬는다: 원형 아바타 + 통계 가로
레이아웃, 아바타 이미지 업로드, 설정 메뉴 확장(소개·약관·개인정보·회원 탈퇴).
회원 탈퇴는 소프트 삭제(비활성화)로 안전하게.

> **규모 주의:** 성격이 다른 5개 기능(A~C3)을 한 스펙에 담는다(사용자 요청). 특히
> **beta DB 마이그레이션**과 **회원 탈퇴(소프트 삭제)**가 포함된다.

## 데이터 모델 (마이그레이션 1개)

`Account`에 nullable 컬럼 2개 추가 — **additive·비파괴적·하위호환**:
- `avatarKey String?` → `avatar_key` : 아바타 객체 스토리지 키(`avatars/` prefix)
- `deletedAt DateTime?` → `deleted_at` (timestamptz) : 소프트 삭제 시각

마이그레이션 `account_avatar_soft_delete`(현재는 `db/schema.sql`에 통합)
```sql
ALTER TABLE account ADD COLUMN avatar_key text;
ALTER TABLE account ADD COLUMN deleted_at timestamptz;
```
prisma `schema.prisma`의 `model Account`에도 두 필드 추가 후 `prisma generate`.

> **적용:** 로컬 dev도 beta DB에 연결되므로 이 마이그레이션이 beta DB에 적용돼야
> 코드가 동작한다. additive/nullable이라 기존 기능에 무해. 적용은 `dotenv -e
> .env.local -- prisma db execute --file <sql> --schema prisma/schema.prisma`
> 로 수행(사용자 확인됨).

## 인증 가드 (회원 탈퇴 안전)

`modules/auth/lib/session.ts` `validateSessionToken`: 세션·계정 로드 후
`session.account.deletedAt !== null`이면 세션 무효(null 반환). → 탈퇴 계정은
RSC·Server Action·Route Handler 어디서도 인증되지 않음.

## A. 프로필 인스타형 레이아웃 (`/mypage`)

상단 헤더를 가로 배치로: 원형 아바타(`avatarKey` 있으면 `getPublicUrl` 이미지,
없으면 닉네임 이니셜 플레이스홀더) + 닉네임 + 통계(소지 카드 N · 컬렉션 N) + 우측
⚙ 설정. 그 아래 기존 `MyCollections` 그리드.

- 신규 컴포넌트 `ProfileAvatar`(서버/프리젠테이션): `avatarKey`·`displayName` 받아
  원형 이미지 또는 이니셜 렌더.

## B. 아바타 업로드

- `presignAvatar(input: { contentType: string })` server action:
  이미지 MIME 화이트리스트(`image/png|jpeg|webp`) 검증 → 키
  `avatars/{uuidv7}.{ext}` 생성 → `getSignedUploadUrl(key, contentType)` →
  `{ uploadUrl, key }` 반환. 로그인 필수.
- `updateAvatar(input: { key: string })` server action: `getCurrentAccount`(없으면
  throw) → `key`가 `avatars/`로 시작하는지 검증 → `updateAccountAvatar(id, key)` →
  `revalidatePath("/mypage")`.
- 클라 업로드: `/mypage/edit`의 `AvatarUploadField` — 파일 선택 → `presignAvatar`
  → `fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type" }})`
  → `updateAvatar(key)` → 미리보기 갱신·toast. 용량 상한(예: 5MB) 클라 검증.
- 리포지토리 `updateAccountAvatar(accountId, avatarKey)`.

## C1. 이용약관·개인정보 (플레이스홀더)

`app/(marketing)/terms/page.tsx`, `app/(marketing)/privacy/page.tsx` 신규(공개).
본문은 **플레이스홀더**("본 문서는 준비 중입니다. 실제 약관/방침으로 교체 필요.")
+ 제목. 설정 메뉴에서 링크.

## C2. 소개 링크

설정 메뉴에 `/welcome` 링크.

## C3. 회원 탈퇴 (소프트 삭제)

- 리포지토리 `softDeleteAccount(accountId)`: 트랜잭션 — `account.update`
  (`deletedAt = now`, `displayName = "탈퇴한 회원"`) + `accountSession.deleteMany`
  ({ accountId }) 로 세션 전부 폐기.
- `deleteAccount()` server action: `getCurrentAccount`(없으면 throw) →
  `softDeleteAccount(account.id)` → `clearSessionCookie()` → `redirect("/")`.
- UI: 설정 메뉴 **회원 탈퇴**(빨강) → `Dialog` 확인("정말 탈퇴하시겠어요? 되돌릴 수
  없습니다") → 확인 시 `deleteAccount`.

## 설정 메뉴 최종 (`ProfileSettingsMenu`, ⚙)

회원정보 변경 · 소개(/welcome) · 이용약관(/terms) · 개인정보처리방침(/privacy) ·
로그아웃 · **회원 탈퇴**(빨강, Dialog 확인).

## 컴포넌트 / 파일

### 생성
- `app/(shop)/mypage/_components/ProfileAvatar.tsx` — 원형 아바타/이니셜.
- `app/(shop)/mypage/edit/_components/AvatarUploadField.tsx` — 아바타 업로드(클라).
- `app/(shop)/mypage/_components/DeleteAccountItem.tsx` — 회원 탈퇴 Dialog(클라).
- `app/(marketing)/terms/page.tsx`, `app/(marketing)/privacy/page.tsx` — 플레이스홀더.
- `db/schema.sql` — `account_avatar_soft_delete` 섹션.

### 수정
- `prisma/schema.prisma` — Account에 `avatarKey`·`deletedAt`.
- `modules/auth/lib/session.ts` — `validateSessionToken` deletedAt 가드.
- `modules/auth/lib/account.ts` — `updateAccountAvatar`, `softDeleteAccount`.
- `modules/auth/actions.ts` — `presignAvatar`, `updateAvatar`, `deleteAccount`.
- `app/(shop)/mypage/page.tsx` — 인스타형 헤더(ProfileAvatar + 통계).
- `app/(shop)/mypage/edit/_components/EditProfileForm.tsx` — AvatarUploadField 추가.
- `app/(shop)/mypage/_components/ProfileSettingsMenu.tsx` — 링크·회원탈퇴 확장.

## 테스트 (Vitest, node env — 기존 actions.test 패턴)

- `validateSessionToken`: 탈퇴 계정(`deletedAt` 있음) → null. (session.ts 테스트,
  db mock.)
- `updateAvatar`: 비로그인 throw / `avatars/` 아닌 키 거부 / 유효 시 계정 id로 저장.
- `deleteAccount`: 비로그인 throw / 유효 시 `softDeleteAccount` 호출 + 쿠키 제거 +
  `/` 리다이렉트.
- `presignAvatar`: 비이미지 MIME 거부 / 이미지면 `avatars/`·확장자 키 반환.
- 시각(프리뷰, 로그인 필요분은 사용자 확인): 프로필 레이아웃·아바타 업로드/표시·
  설정 링크·탈퇴 Dialog→탈퇴 후 로그아웃 상태.

## 엣지 케이스

- 아바타 MIME/용량 위반 → 거부·toast.
- `avatarKey` null → 이니셜 플레이스홀더.
- 탈퇴 후 세션 쿠키가 남아도 `validateSessionToken`가 차단(이중 방어).
- 약관/개인정보는 플레이스홀더 — 실제 문구 교체 전까지 "준비 중" 명시.

## 비목표

- 이메일·전화 변경(인증 필요) — 여전히 읽기 전용.
- 실제 약관/개인정보 문구 작성(법적 — 사용자 제공).
- 하드 삭제·계정 복구 UI.
