# 관리자 페이지 아키텍처

## 결정

**MVP는 사용자 페이지와 동일 프로젝트에서 시작하고, 임계점에 도달하면 분리한다.**

## 같은 프로젝트로 시작하는 이유

- 코드 공유: 타입(`Product`, `Order`), Supabase 클라이언트, 유틸 재사용
- 배포 1회: Vercel 프로젝트 1개, 환경변수 1세트
- 인증 통합: 단일 Supabase Auth에서 role로만 구분
- 분리 시 인증·배포·CI를 두 번 세팅해야 하므로 MVP 속도가 느려짐

## 디렉토리 구조

```
app/
├── (shop)/              # 사용자용 라우트 그룹
│   ├── page.tsx
│   ├── products/
│   └── cart/
├── (admin)/             # 관리자 라우트 그룹
│   └── admin/
│       ├── layout.tsx   # 권한 체크 레이아웃
│       ├── products/
│       └── orders/
├── api/
└── lib/
    ├── supabase/        # 양쪽 공유
    └── types/           # 양쪽 공유
```

**원칙**: 비즈니스 로직은 `lib/`에 두고 `(shop)`·`(admin)`은 UI만 담당.
나중에 분리할 때 `lib/`를 패키지로 떼어내면 마이그레이션 비용이 작다.

## 보안 — 1일차부터 필수

분리는 미뤄도 되지만 권한 격리는 처음부터 적용한다.

### 1. Supabase Row Level Security (RLS)
DB 레벨에서 일반 유저가 admin 전용 테이블·컬럼에 접근하지 못하게 한다.
프론트엔드 권한 체크가 우회되어도 DB가 마지막 방어선이 된다.

### 2. Next.js 미들웨어 권한 체크
```typescript
// middleware.ts 골자
if (pathname.startsWith('/admin')) {
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.user_metadata?.role !== 'admin') redirect('/')
}
```

## 분리 시점 신호

다음 중 2개 이상에 해당하면 분리를 검토한다.

- 관리자 페이지 번들 크기가 사용자 페이지 LCP에 영향
- 관리자 전용 무거운 라이브러리 도입 (차트, 리치 에디터 등)
- 관리자 배포 주기를 사용자와 다르게 가져가야 할 때
- 관리자 트래픽이 사용자 서비스에 영향을 줄 때

## 분리 시 마이그레이션 경로

- Turborepo 기반 모노레포로 전환
- `lib/`를 `packages/core`로 추출
- `apps/shop`, `apps/admin`으로 앱 분리
- Vercel 프로젝트 2개로 분리 배포
