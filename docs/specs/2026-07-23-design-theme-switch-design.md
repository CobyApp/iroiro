# 사이트 디자인 테마 전환 (game / pink)

## 목적
관리자가 사이트 전체 디자인을 **두 테마 중 하나로 전환**한다.
- `game` — 기존 Y2K 버블 키치 (기본값)
- `pink` — 옛 카드 분석 도구(`Card/web`) UI 스타일: 부드러운 핑크/퍼플, 헤어라인 보더,
  글로우 그림자, 그라데이션 배경, Pretendard/SUIT 폰트

## 결정 사항 (브레인스토밍)
- **충실도**: 전역 재스킨(토큰 스왑)만. 레이아웃/컴포넌트 구조 재작업 없음.
- **적용 범위**: 사이트 전체(관리자 포함), 서버에 저장 → 모든 방문자에게 적용.
- **폰트**: CDN `@import` (Card와 동일). 이후 next/font로 정식 임베드 가능.
- **테마 값**: `game`(기본) / `pink`.

## 메커니즘
`.dark`(next-themes)와 동일한 원리로 `<html>`에 `data-design` 속성을 얹고,
CSS 변수 값만 재정의한다. 컴포넌트는 이미 토큰(`bg-primary`, `border-border`,
`shadow-sticker`, `rounded-sm`, `--font-sans` 등)을 참조하므로 값만 바꾸면 전 페이지
자동 재스킨.

### 1. 토큰 레이어 (`app/globals.css`)
- 기본 `:root` = `game` (변경 없음).
- `:root[data-design="pink"]` (+ `:root[data-design="pink"].dark`) 블록에서 재정의:
  - **색**: `--primary` `#ff6b9d`, `--accent` `#b47be5`, `--border` 헤어라인(rgba),
    `--background/--card/--muted/--foreground` → Card paper·ink 팔레트 (라이트/다크 각각).
  - **그림자**: `--shadow-pop/card/sticker/elevated/banner` → 부드러운 블러 글로우.
  - **라디우스**: `--radius-xs..lg` → Card 스케일.
  - **폰트**: `--font-sans/--font-display` → `"Pretendard Variable"`, `"SUIT Variable"`.
  - **배경**: `body` 에 핑크+퍼플 래디얼 그라데이션 (design=pink 스코프).
  - **구조 보정**: `:root[data-design="pink"] .border-\[3px\]{border-width:1px}` 로
    3px 스티커 보더를 헤어라인화.
- 상단에 Pretendard/SUIT CDN `@import` 추가.

### 2. 저장 (싱글턴, `delivery_policy` 패턴)
- 새 테이블 `site_setting`(id=1, `active_design` TEXT NOT NULL DEFAULT 'game', `updated_at`).
- Prisma 모델 `SiteSetting` + 마이그레이션.
- `modules/site-settings/lib/queries.ts` → `getActiveDesign(): "game" | "pink"`
  (mock 모드는 모듈 변수, 미설정/오류 시 `game` 폴백).
- 서버 액션 `setActiveDesign(design)` — 값 검증(game|pink), upsert, revalidate.

### 3. 루트 레이아웃 (`app/layout.tsx`)
- `async` 로 전환, `getActiveDesign()` 읽어 `<html data-design={design}>` 설정 (SSR, 무깜빡임).

### 4. 관리자 토글 (`/admin/settings`)
- "디자인 테마" 섹션: 카드 2개(Game 기존 / Pink Card 스타일) 라디오 선택 + 저장 버튼.
- 저장 시 `setActiveDesign` 호출 → 저장 즉시 전체 반영. (배송비 정책 섹션과 같은 페이지)

### 5. 스토리북 (`.storybook/preview.tsx`)
- 툴바 글로벌 `design: game | pink` 추가 + 데코레이터가 스토리 캔버스 루트에
  `data-design` 적용 → 컴포넌트별 두 스킨 미리보기.

## 테스트
- `setActiveDesign` / `getActiveDesign` mock 경로 단위 테스트 (값 검증·폴백).
- 브라우저: 관리자에서 pink 저장 → 홈·상품·상세 재스킨 확인, 다크모드·관리자 동작 확인,
  game 으로 되돌리기 확인.

## 범위 가드 (YAGNI)
- 전역 재스킨만. 페이지별 맞춤 레이아웃/구조 변경은 하지 않는다.
- 폰트는 CDN import (성능 최적화는 후속).
