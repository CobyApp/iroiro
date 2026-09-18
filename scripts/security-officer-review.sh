#!/bin/sh
# security-officer-review.sh
#
# CSO(Chief Security Officer) 정책으로 staged git diff를 보안 검토.
# `claude -p --agent security-officer` 를 통해 *구독 요금제*로 동작 (API 키 불필요).
#
# 정책 원천: agent/rules/security-review.md
#
# 사용처:
#   1. Husky pre-commit (.husky/pre-commit)            — 모든 commit
#   2. Claude Code PreToolUse hook (어댑터 경유)        — Claude가 commit 시도할 때
#
# 동작:
#   - staged diff 없음 → exit 0
#   - claude CLI 미설치 → 경고 후 exit 0 (Phase 1 secretlint이 fallback)
#   - 재진입(자식 claude가 또 hook 트리거) → exit 0
#   - claude 응답 BLOCK → exit 1 (verdict stderr 출력)
#   - claude 응답 PASS → exit 0
#   - 타임아웃/오류 → 경고 후 exit 0 (단, STRICT_SECURITY_CHECK=1이면 exit 1)
#
# 환경 변수:
#   STRICT_SECURITY_CHECK=1   오류 시에도 BLOCK
#   SECURITY_OFFICER_TIMEOUT  기본 90초
#
# 우회 (꼭 필요할 때만): git commit --no-verify

set -eu

# 재진입 방지: 자식 claude가 또 hook을 트리거하는 무한 루프 차단
if [ -n "${OSHIKORE_SECURITY_OFFICER_RUNNING:-}" ]; then
  exit 0
fi
export OSHIKORE_SECURITY_OFFICER_RUNNING=1

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "[security-officer] not in a git repo — skip" >&2
  exit 0
}

# staged diff + staged 파일 목록 (LLM이 파일 매핑을 hallucinate하지 않도록 명시적 목록을 prompt에 추가)
DIFF=$(git diff --cached --no-color)
if [ -z "$DIFF" ]; then
  exit 0
fi

# `git diff --cached --name-status` 출력 (A=added, M=modified, D=deleted, R=renamed, C=copied)
STAGED_FILES=$(git diff --cached --name-status --no-color)

# claude CLI 검사
if ! command -v claude >/dev/null 2>&1; then
  if [ "${STRICT_SECURITY_CHECK:-0}" = "1" ]; then
    echo "🛑 [security-officer] claude CLI 미설치 (STRICT) — commit 차단" >&2
    exit 1
  fi
  echo "[security-officer] claude CLI 미설치 — CSO 리뷰 건너뜀 (Phase 1 secretlint은 동작)" >&2
  exit 0
fi

AGENT_FILE="$REPO_ROOT/.claude/agents/security-officer.md"
if [ ! -f "$AGENT_FILE" ]; then
  echo "[security-officer] agent definition not found: $AGENT_FILE — skip" >&2
  exit 0
fi

POLICY_FILE="$REPO_ROOT/agent/rules/security-review.md"
if [ ! -f "$POLICY_FILE" ]; then
  if [ "${STRICT_SECURITY_CHECK:-0}" = "1" ]; then
    echo "🛑 [security-officer] policy not found: $POLICY_FILE (STRICT) — commit 차단" >&2
    exit 1
  fi
  echo "[security-officer] policy not found: $POLICY_FILE — skip" >&2
  exit 0
fi

POLICY=$(cat "$POLICY_FILE")

# 비용/시간 통제: diff 64KB로 truncate
DIFF=$(printf '%s' "$DIFF" | head -c 65536)

TIMEOUT="${SECURITY_OFFICER_TIMEOUT:-90}"

# claude headless 호출
# - --agent security-officer : 프로젝트 agent 사용 (구독 인증)
# - --tools ""               : 도구 일체 비허용 (verdict만 받음)
# - --disable-slash-commands : 슬래시 명령 비활성
# - --no-session-persistence : 세션 저장 안 함
# - --permission-mode dontAsk: 권한 prompt 차단 (어차피 도구 없음)
PROMPT=$(printf 'Review the staged git changes and respond per the SECURITY REVIEW POLICY.

SECURITY REVIEW POLICY (authoritative):
```md
%s
```

STAGED FILES (authoritative — this is the COMPLETE list of files in the commit;
do NOT infer file presence from the diff content; for criterion 12 test-pair
checks, use ONLY this list to determine whether the expected test file is staged):
```
%s
```

DIFF:
```diff
%s
```' "$POLICY" "$STAGED_FILES" "$DIFF")

RESPONSE=$(printf '%s' "$PROMPT" | (
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$TIMEOUT" claude -p \
      --agent security-officer \
      --tools "" \
      --disable-slash-commands \
      --no-session-persistence \
      --permission-mode dontAsk \
      2>/dev/null
  else
    # macOS 기본은 timeout 없음 — 그냥 호출 (claude 자체 응답 시간이 보통 충분히 빠름)
    claude -p \
      --agent security-officer \
      --tools "" \
      --disable-slash-commands \
      --no-session-persistence \
      --permission-mode dontAsk \
      2>/dev/null
  fi
)) || {
  if [ "${STRICT_SECURITY_CHECK:-0}" = "1" ]; then
    echo "🛑 [security-officer] claude 호출 실패 (STRICT) — commit 차단" >&2
    exit 1
  fi
  echo "[security-officer] claude 호출 실패/타임아웃 — skip (Phase 1 secretlint은 동작)" >&2
  exit 0
}

# 응답 정리 (앞뒤 공백 제거)
VERDICT=$(printf '%s' "$RESPONSE" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

if [ -z "$VERDICT" ]; then
  if [ "${STRICT_SECURITY_CHECK:-0}" = "1" ]; then
    echo "🛑 [security-officer] 빈 응답 (STRICT) — commit 차단" >&2
    exit 1
  fi
  echo "[security-officer] 빈 응답 — skip" >&2
  exit 0
fi

# verdict 첫 토큰으로 BLOCK 검사
FIRST_TOKEN=$(printf '%s' "$VERDICT" | awk 'NR==1{print toupper($1); exit}')

if [ "$FIRST_TOKEN" = "BLOCK" ]; then
  cat >&2 <<EOF

🛑 [security-officer] commit 차단

$VERDICT

해결책:
  1. 위 issue 수정 후 다시 commit
  2. 오탐 의심 → Claude에 verdict 붙여넣고 재검증 요청
  3. 우회 (권장X): git commit --no-verify

EOF
  exit 1
fi

# PASS — warnings 있으면 출력
if printf '%s' "$VERDICT" | head -1 | grep -qi 'warnings'; then
  echo "" >&2
  echo "[security-officer] PASS (경고 있음)" >&2
  printf '%s\n' "$VERDICT" | tail -n +2 >&2
  echo "" >&2
fi

exit 0
