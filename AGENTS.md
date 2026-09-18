<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architecture (read before any code change)

이 프로젝트는 명시적인 아키텍처 룰을 가진다. **코드 작성·수정 전 반드시 다음 문서를 먼저 확인하라.**

1. **[docs/architecture/overview.md](./docs/architecture/overview.md)** — 1페이지 요약과 핵심 룰 4가지. 작업마다 매번 통과.
2. 작업 유형별 진입점은 [docs/architecture/README.md](./docs/architecture/README.md)의 "작업 유형별 진입점" 표 참조.

핵심 룰을 어기면 리뷰에서 거부된다:
- 룰 1: 도메인 명사면 `modules/`, 횡단 인프라면 `lib/`. 중간지대 금지.
- 룰 2: Server Actions는 `modules/<도메인>/actions.ts`. `app/api/`는 webhook만.
- 룰 3: 권한 가드는 layout에서. `isAdmin`은 `modules/admin/lib/isAdmin.ts` 단일 진실.
- 룰 4: 인증은 자체 세션(`account_session`) + 카카오·네이버 OAuth만. NextAuth/Better-auth 도입 금지.

DB 스키마 작업(테이블·컬럼 신설/변경, 마이그레이션 작성) 전에는 **[docs/architecture/data-modeling.md](./docs/architecture/data-modeling.md)를 반드시 확인하라** — 네이밍·키·타입·제약 등 스키마 설계 규칙의 단일 진실.

새 패턴 도입은 [docs/architecture/references.md](./docs/architecture/references.md)의 절차를 따른다.

# 에이전트 정책 (agent, test, commit, security-review 작업 전 확인)

이 프로젝트의 에이전트 정책 단일 원천은 [agent/](./agent) 디렉토리다. Claude, Codex, Husky, CI용 파일은 이 정책을 실행 환경에 연결하는 어댑터일 뿐이다.

작업 유형별로 다음 문서를 먼저 확인하라:

1. 커밋 메시지 작성·커밋 분할 판단: [agent/rules/commit-message.md](./agent/rules/commit-message.md)
2. 테스트 작성 여부 판단: [agent/rules/test-policy.md](./agent/rules/test-policy.md)
3. 커밋 전 보안 리뷰 기준: [agent/rules/security-review.md](./agent/rules/security-review.md)

중복 방지 룰:

- 정책 본문은 `agent/rules/` 아래에만 작성한다.
- `.claude/`, `.codex/`, `scripts/`에 정책을 복제하지 않는다.
- 정책 변경 시 먼저 `agent/rules/`를 수정하고, 어댑터는 새 정책을 읽거나 prompt에 포함하도록만 수정한다.
- Codex hook은 사용자가 `/hooks`에서 신뢰 처리해야 실행된다. 저장소 차원의 최종 강제는 Husky와 CI가 담당해야 한다.
