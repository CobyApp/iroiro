# 에이전트 정책 원천

이 디렉토리는 Claude, Codex, Husky, CI가 공통으로 참조하는 에이전트 정책의 단일 원천이다.

## 원칙

- 정책 본문은 `agent/rules/` 아래에만 둔다.
- `.claude/`, `.codex/`, `scripts/`는 실행 환경별 어댑터다. 정책을 새로 정의하거나 복제하지 않는다.
- 정책을 바꿀 때는 먼저 `agent/rules/`를 수정하고, 필요한 경우 어댑터가 새 정책을 제대로 전달하거나 검증하는지만 수정한다.
- 자동 강제는 에이전트 지침이 아니라 Husky, Codex hooks, CI 같은 실행 장치가 담당한다.

## 정책 문서

- [커밋 메시지 정책](./rules/commit-message.md)
- [테스트 작성 정책](./rules/test-policy.md)
- [보안 리뷰 정책](./rules/security-review.md)

## 어댑터 위치

- `AGENTS.md`: 모든 에이전트가 읽는 프로젝트 공통 지침
- `CLAUDE.md`: Claude가 `AGENTS.md`를 읽도록 연결
- `.claude/`: Claude Code용 hook/agent 어댑터
- `.codex/`: Codex용 hook/agent 어댑터
- `scripts/`: Husky와 에이전트 hook에서 호출하는 실행 스크립트
