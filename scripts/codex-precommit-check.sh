#!/bin/sh
# Codex PreToolUse hook adapter.
#
# Codex hook matcher는 Bash 도구 단위라 command-level 필터가 없다.
# 이 래퍼가 `git commit` 명령일 때만 기존 commit 검사를 실행한다.
#
# 정책 원천:
# - agent/rules/commit-message.md
# - agent/rules/test-policy.md
# - agent/rules/security-review.md

set -eu

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

[ -z "$cmd" ] && exit 0

if ! printf '%s' "$cmd" | grep -Eq '(^|[[:space:];&|()])git[[:space:]]+commit($|[[:space:]])'; then
  exit 0
fi

script_dir=$(cd "$(dirname "$0")" && pwd)

run_adapter() {
  adapter="$1"
  if output=$(printf '%s' "$input" | sh "$script_dir/$adapter"); then
    if [ -n "$output" ]; then
      printf '%s\n' "$output"
      if printf '%s' "$output" | grep -q '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"'; then
        exit 0
      fi
    fi
    return 0
  fi

  exit 1
}

run_adapter "claude-precommit-check.sh"
run_adapter "claude-prelint-check.sh"
run_adapter "claude-security-check.sh"

exit 0
