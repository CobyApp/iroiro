# MVP 기술 스택

상품 사진이 많은 커머스 페이지를 최소 비용으로 빠르게 배포하기 위한 스택 결정 요약.
영역별 후보 비교와 선택 근거는 각 상세 문서를 참조한다.

## 최종 선택

| 영역 | 선택 | 핵심 이유 | 상세 |
|---|---|---|---|
| 호스팅 | **Vercel (Hobby)** | Next.js zero-config, 자동 CDN, 무료 100GB 대역폭 | — |
| 이미지 저장/CDN | **Cloudflare R2 + Image Resizing** | egress 무료로 트래픽 비용 방어 | [image-strategy.md](./image-strategy.md) |
| DB + Auth | **Supabase (Postgres)** | DB+Auth+RLS+Studio 통합, 표준 Postgres라 탈출 비용 낮음 | [database-strategy.md](./database-strategy.md) |
| 관리자 페이지 | **Next.js 동일 프로젝트 `/admin`** | 인증·배포·타입 공유로 MVP 속도 우선 | [admin-architecture.md](./admin-architecture.md) |

## 전체 비용 구조

MVP 단계 예상 비용: **$0/월** (모든 항목 무료 티어 내)

| 영역 | 무료 한도 | 초과 시 |
|---|---|---|
| Vercel | 100GB 대역폭/월, Image Optimization 5,000건/월 | Pro $20/월 |
| Cloudflare R2 | 10GB 저장 + egress 무료 | $0.015/GB 저장 |
| Cloudflare Images | 5,000장 변환/월 | $5/월부터 |
| Supabase | DB 500MB, 50K MAU | Pro $25/월 |

트래픽이 늘어도 R2 egress가 무료이므로 비용 증가폭이 작다.

## 진행 순서

1. Supabase 프로젝트 생성 → `products`, `orders`, `users` 스키마 설계
2. RLS 정책 설정 (admin role 분리)
3. Cloudflare R2 버킷 생성 + Image Resizing 활성화
4. Next.js `<Image>` `remotePatterns`에 R2 도메인 등록
5. 사용자 페이지 → `/admin` 순서로 구현

## 확장 시 검토 항목

- 트래픽 증가 시 Vercel → Cloudflare Pages 마이그레이션 (egress 0원)
- DB 용량·MAU 증가 시 Supabase Pro
- 결제 연동: Stripe / Toss / PortOne 중 택1
- 관리자 페이지 분리 시점: [admin-architecture.md](./admin-architecture.md) 참조
