#!/bin/sh
# Claude Code PreToolUse hook adapter — git commit 메시지 컨벤션 검사
#
# 정책 원천: agent/rules/commit-message.md
# settings.json의 PreToolUse > Bash > if: "Bash(git commit *)" 와 함께 사용.
#
# 입력: stdin JSON ({ tool_input: { command: "..." } })
# 동작: bash 명령에서 메시지를 추출(HEREDOC 또는 -m "...") 후 check-commit-msg.sh 호출
# 출력: 위반 시 PreToolUse hookSpecificOutput JSON으로 deny

set -eu

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

[ -z "$cmd" ] && exit 0

msg=""

# 패턴 1: HEREDOC <<'EOF' ... EOF
if printf '%s' "$cmd" | grep -q "<<'EOF'"; then
  msg=$(printf '%s\n' "$cmd" | sed -n "/<<'EOF'/,/^EOF$/p" | sed '1d;$d')
fi

# 패턴 2: -m "..." 단일 인용 (간단 추출, 이스케이프 미지원)
if [ -z "$msg" ] && printf '%s' "$cmd" | grep -qE 'git commit[^|;&]*-m "'; then
  msg=$(printf '%s' "$cmd" | sed -nE 's/.*git commit[^"]*-m "([^"]*)".*/\1/p')
fi

# 추출 실패 시 통과 (Husky가 잡음)
[ -z "$msg" ] && exit 0

# 검증 (스크립트 절대 경로로 호출 — cwd가 다를 수 있음)
script_dir=$(cd "$(dirname "$0")" && pwd)
if validation_output=$(printf '%s' "$msg" | sh "$script_dir/check-commit-msg.sh" - 2>&1); then
  exit 0
fi

# 실패 → PreToolUse deny JSON
reason=$(printf '%s' "$validation_output" | jq -Rs .)
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
