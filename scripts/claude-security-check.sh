#!/bin/sh
# Claude Code PreToolUse hook 어댑터 — security-officer 서브에이전트 호출.
# settings.json의 PreToolUse > Bash > if: "Bash(git commit *)" 와 함께 사용.
#
# 보안 리뷰 정책 원천: agent/rules/security-review.md
#
# 입력: stdin JSON (사용 안 함 — `if` 필터가 이미 git commit만 통과시킴)
# 동작: scripts/security-officer-review.sh 실행
#         exit 1 → PreToolUse deny JSON으로 변환 (Claude의 commit 차단)
#         exit 0 → 통과
# 출력: BLOCK 시 hookSpecificOutput JSON, 그 외에는 무출력

set -eu

# stdin 비우기
cat > /dev/null

script_dir=$(cd "$(dirname "$0")" && pwd)

# CSO 리뷰 실행, stderr 캡처 (Claude에게 verdict 전달용)
if review_output=$(sh "$script_dir/security-officer-review.sh" 2>&1); then
  # PASS — 경고가 있을 수 있으니 stderr로 흘려보냄
  if [ -n "$review_output" ]; then
    printf '%s\n' "$review_output" >&2
  fi
  exit 0
fi

# BLOCK → PreToolUse deny JSON
reason=$(printf '%s' "$review_output" | jq -Rs .)
cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": $reason
  }
}
JSON
exit 0
