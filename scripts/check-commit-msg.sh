#!/bin/sh
# 커밋 메시지 컨벤션 검사
#
# 정책 원천: agent/rules/commit-message.md
#
# 사용법:
#   scripts/check-commit-msg.sh <file>   Husky commit-msg에서 호출 ($1 = .git/COMMIT_EDITMSG)
#   scripts/check-commit-msg.sh -        stdin에서 메시지 읽기 (Claude Code hook adapter용)
#
# 종료 코드: 0 통과, 1 위반

set -eu

if [ "${1:-}" = "-" ] || [ -z "${1:-}" ]; then
  msg=$(cat)
else
  msg=$(cat -- "$1")
fi

first_line=$(printf '%s\n' "$msg" | sed -n '1p')

# 자동 생성 커밋(merge, revert, fixup, squash, 빈 메시지)은 검사 스킵
case "$first_line" in
  "Merge "*|"Revert \""*|"Revert '"*|"fixup!"*|"squash!"*|"Squashed commit"*|"")
    exit 0 ;;
esac

errors=""
add_error() { errors="${errors}- $1
"; }

allowed_types='feat|fix|docs|refactor|chore|test|style|perf|ci|revert'

# 룰 1: '<type>: <제목>' 형식
if ! printf '%s' "$first_line" | grep -Eq "^($allowed_types): .+"; then
  add_error "첫 줄은 '<type>: <제목>' 형식이어야 합니다 (type ∈ {$allowed_types})."
fi

# 룰 2: 첫 줄 70자 미만 (멀티바이트 카운트는 wc -m + UTF-8 로케일)
len=$(printf '%s' "$first_line" | LC_ALL="${LANG:-en_US.UTF-8}" wc -m | tr -d '[:space:]')
if [ "$len" -ge 70 ]; then
  add_error "첫 줄은 70자 미만이어야 합니다 (현재: ${len}자)."
fi

# 룰 3: 제목이 마침표로 끝나면 안 됨
case "$first_line" in
  *.) add_error "제목은 마침표로 끝나면 안 됩니다." ;;
esac

# 룰 4: Co-Authored-By footer 금지
if printf '%s\n' "$msg" | grep -qi "^Co-Authored-By:"; then
  add_error "Co-Authored-By footer는 사용하지 않습니다 (.claude/settings.json의 attribution 설정으로 자동 비활성화)."
fi

# 룰 5: 한국어 포함 (비-ASCII 바이트 존재로 판정)
non_ascii=$(printf '%s' "$first_line" | LC_ALL=C tr -d '\000-\177')
if [ -z "$non_ascii" ]; then
  add_error "제목은 한국어로 작성합니다 (영문 X)."
fi

if [ -n "$errors" ]; then
  printf '\n' >&2
  printf '❌ 커밋 메시지 컨벤션 위반 — agent/rules/commit-message.md 참조\n' >&2
  printf '\n' >&2
  printf '%s' "$errors" >&2
  printf '\n메시지 첫 줄:\n  %s\n' "$first_line" >&2
  exit 1
fi

exit 0
