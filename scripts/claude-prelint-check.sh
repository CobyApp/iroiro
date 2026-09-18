#!/bin/sh
# Claude Code PreToolUse hook — git commit 직전 lint + typecheck 검사.
# 둘 중 하나라도 실패하면 commit을 deny.
# settings.json의 PreToolUse > Bash > if: "Bash(git commit *)" 와 함께 사용.
#
# 테스트 정책 원천: agent/rules/test-policy.md
#
# stdin 입력은 사용하지 않음 (if 필터가 이미 git commit만 통과시킴).

set -eu

# stdin 비우기 (hook이 JSON 입력을 흘려보냄)
cat > /dev/null

errors=""

if ! lint_output=$(npm run --silent lint 2>&1); then
  errors="${errors}=== ESLint ===
$lint_output

"
fi

if ! tc_output=$(npm run --silent typecheck 2>&1); then
  errors="${errors}=== TypeScript ===
$tc_output

"
fi

if [ -z "$errors" ]; then
  exit 0
fi

# 실패 → PreToolUse deny JSON
reason=$(printf '%s\n\nlint·typecheck를 통과시킨 후 다시 시도하세요.' "$errors" | jq -Rs .)
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
