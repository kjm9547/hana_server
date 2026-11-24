#!/usr/bin/env bash
# PreToolUse(Bash): main 직접 push와 --force push를 막는다. (CONTRIBUTING.md 4장)
cmd="$(jq -r '.tool_input.command // empty')"
deny() { jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'; exit 0; }

printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+push' || exit 0

if printf '%s' "$cmd" | grep -qE -- '(--force([[:space:]]|$)|[[:space:]]-f([[:space:]]|$)|[[:space:]]\+[[:alnum:]])'; then
  deny "--force push 금지. rebase 후에는 --force-with-lease를 쓴다 (CONTRIBUTING.md)"
fi
if printf '%s' "$cmd" | grep -qE -- '[[:space:]](main|HEAD:main|[^[:space:]]*:main)([[:space:]]|$)'; then
  deny "main 직접 push 금지. 브랜치에서 PR로 올린다 (CONTRIBUTING.md)"
fi
# 대상 브랜치를 명시하지 않은 push(옵션 제외 인자가 remote 하나 이하)는 현재 브랜치로 간다
args="$(printf '%s' "$cmd" | sed -E 's/.*git[[:space:]]+push//; s/[;&|].*//' | tr -s ' ' '\n' | grep -v '^-' | grep -c .)"
branch="$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null)"
if [ "$branch" = "main" ] && [ "$args" -lt 2 ]; then
  deny "현재 브랜치가 main이라 이 push는 main으로 간다. 기능 브랜치를 만들어 push한다 (CONTRIBUTING.md)"
fi
exit 0
