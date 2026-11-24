@AGENTS.md
@docs/PRODUCT.md
@CONTRIBUTING.md

## 작업 규칙 (하네스)

이 레포의 오너는 서버 코드를 한 줄씩 검토하지 못한다. 그래서 검증은 사람이 아니라 테스트와 훅이 한다.

- **완료 기준은 `npm run check` 통과.** 타입체크 → oxlint → prettier 검사 → 유닛 → e2e. Stop 훅이 서버 코드 변경 시 자동으로 돌리고, 실패하면 종료를 막는다.
- **동작을 바꾸면 e2e로 증명한다.** 새 엔드포인트·정책은 `test/*.e2e-spec.ts`에 실제 HTTP 흐름으로 테스트를 추가한다. 권한(남의 데이터 접근 차단), 검증 실패(400), 미인증(401) 케이스를 빼먹지 않는다.
- **기존 테스트를 지우거나 약화시키지 않는다.** 테스트가 틀렸다고 판단되면 고치기 전에 이유를 설명하고 묻는다.
- **DB 스키마**: `src/db/schema.ts`를 고친 뒤 `npx drizzle-kit generate --name=<change>`. 이미 커밋된 `drizzle/` migration은 절대 수정하지 않는다.
- **비밀값**은 `.env`에만. 코드·테스트·커밋에 넣지 않는다.
- **포맷**은 PostToolUse 훅이 편집한 `.ts` 파일에 prettier(120자)를 자동 적용한다.
- Git 작업은 `CONTRIBUTING.md`를 따른다 (이슈 → `<type>/<이슈번호>-<요약>` 브랜치 → PR, Squash 머지, 머지는 오너가). CI는 `npm run check`와 PR 제목 형식을 검사한다.
