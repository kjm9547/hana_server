# Git 규칙과 컨벤션

Hana의 모든 레포(`hana_front`, `hana_server`)에 같은 규칙을 쓴다. 사람이든 AI 에이전트든 동일하게 따른다.

## 한눈에 보기

```
이슈 생성 → 브랜치 <type>/<이슈번호>-<요약> → 커밋 → push → PR(Closes #N) → CI 통과 → Squash 머지 → 브랜치 자동 삭제
```

## 1. 이슈

- 모든 작업은 **GitHub Issue에서 시작**한다. 관련 이슈가 없으면 먼저 만든다.
- 프론트·서버에 모두 걸치는 기능은 각 레포에 이슈를 만들고 본문에서 서로 링크한다 (`kjm9547/hana_server#12`).
- 진행 상황과 결정 사항은 이슈 코멘트로 남긴다.

| 라벨 | 용도 |
|------|------|
| `planning` | 기획·스펙·정책 |
| `design` | UI/UX |
| `frontend` | Flutter 구현 |
| `backend` | NestJS 구현 |
| `bug` | 버그 |
| `enhancement` | 기존 기능 개선 |
| `chore` | 설정·도구·잡일 |
| `documentation` | 문서 |

## 2. 브랜치

- 형식: `<type>/<이슈번호>-<짧은-영문-요약>`
  - 예: `feat/12-chat-socket`, `fix/15-login-401`, `chore/3-git-conventions`
- `main`은 항상 배포 가능한 상태. **`main`에 직접 커밋·push 하지 않는다** (브랜치 보호로 막혀 있음).
- 브랜치는 `main`에서 딴다. 작업 중 `main`이 앞서가면 `git rebase main`.

## 3. 커밋 메시지

```
<type>(<scope>): <한국어 요약> (#이슈번호)

<본문: 왜 바꿨는지. 무엇을은 diff가 말해준다> (선택)
```

| type | 언제 |
|------|------|
| `feat` | 사용자에게 보이는 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변화 없는 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트만 추가·수정 |
| `docs` | 문서만 |
| `chore` | 설정·의존성·잡일 |
| `ci` | CI/워크플로우 |

- `scope`는 선택: `feat(chat): ...`, `fix(auth): ...`
- 하위 호환을 깨면 `!`: `feat(api)!: 응답 형식 변경`
- 요약은 50자 안팎, 마침표 없이, "~한다/~추가/~수정"처럼 무엇을 했는지
- 한 커밋에는 한 가지 일만. 포맷 정리와 기능 변경을 섞지 않는다
- 예: `feat(chat): 1:1 대화방 생성 API 추가 (#12)`

## 4. Push

- 자기 기능 브랜치에만 push 한다.
- 강제 push가 필요하면(rebase 후) **`--force-with-lease`만** 쓴다. `--force`는 금지.
- `main`에는 강제 push·삭제 모두 금지 (브랜치 보호).
- 비밀값(`.env`, 키, 토큰)은 절대 커밋하지 않는다. `.env.example`만 커밋한다.

## 5. PR

- **제목 = 머지 후 `main`에 남는 커밋 메시지**다 (Squash 머지). 커밋 메시지와 같은 형식이어야 하고 CI가 검사한다.
  - 예: `feat(chat): 1:1 대화방 생성 API 추가` — 이슈 번호는 본문의 `Closes #N`으로 연결하고, 머지 시 PR 번호가 자동으로 붙는다
- 본문은 템플릿을 따른다: 요약 / 변경 사항 / 검증 / `Closes #N`
- 하나의 PR은 하나의 이슈. 리뷰할 수 있는 크기로 (대략 400줄 이하 권장, 생성 파일·lock 제외)
- 다른 PR에 의존하면 본문 맨 위에 적는다: `> #12 위에 쌓은 PR`

## 6. 머지

- 방식: **Squash 머지만** 허용. 머지 후 브랜치는 자동 삭제된다.
- 조건: CI 통과 — 서버는 `check`(npm run check)·`pr-title`, 프론트는 `pr-title`.
- **머지는 오너(jaemin)가 한다.** AI 에이전트는 PR까지만 만들고, 오너가 명시적으로 요청할 때만 머지한다.

## 7. AI 에이전트 추가 규칙

- 위 규칙을 그대로 따른다. 커밋 끝에 `Co-Authored-By` 트레일러, PR 본문 끝에 생성 표시를 남긴다.
- `main` 직접 push, `--force` push는 Claude Code 훅(`.claude/hooks/guard-git.sh`)이 차단한다.
- 커밋·push·PR은 오너가 요청했을 때 한다.
