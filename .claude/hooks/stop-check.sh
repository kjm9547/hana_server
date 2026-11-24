#!/usr/bin/env bash
# Stop: 서버 코드가 바뀌었으면 npm run check(타입·린트·포맷·유닛·e2e)를 돌리고,
# 실패하면 종료를 막아 Claude가 고치게 한다. 같은 실패로 두 번째 막히면 무한 루프 방지를 위해 경고만 남긴다.
repo="$(cd "$(dirname "$0")/../.." && pwd)"
input="$(cat)"
cd "$repo" || exit 0

[ -z "$(git status --porcelain -- src test drizzle package.json package-lock.json)" ] && exit 0

out="$(npm run check 2>&1)" && exit 0

tail_out="$(printf '%s\n' "$out" | tail -40)"
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  jq -n --arg m "hana_server: npm run check 가 아직 실패 중입니다. 직접 확인이 필요합니다." '{systemMessage: $m}'
  exit 0
fi
printf 'hana_server의 npm run check 가 실패했습니다. 고친 뒤 끝내세요.\n\n%s\n' "$tail_out" >&2
exit 2
