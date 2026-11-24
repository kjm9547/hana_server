#!/usr/bin/env bash
# PostToolUse(Edit|Write): 이 레포 안의 .ts 파일이면 prettier로 정리한다.
repo="$(cd "$(dirname "$0")/../.." && pwd)"
f="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"
case "$f" in
  "$repo"/src/*.ts | "$repo"/test/*.ts) cd "$repo" && npx --no-install prettier --write --log-level warn "$f" ;;
esac
exit 0
