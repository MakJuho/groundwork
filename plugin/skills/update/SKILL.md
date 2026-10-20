---
name: update
description: Groundwork 부분 갱신(U단계). 마지막 분석 커밋 이후 바뀐 파일이 속한 모듈과 흐름만 다시 분석하고, 정책 번호를 그대로 유지한 채 정책 변경 내역(changes/<날짜>-<커밋>.md)을 만든다. /groundwork:update 로 실행한다.
argument-hint: <출력 폴더> [이전 커밋] [새 커밋] [--yes]
---

# Groundwork 부분 갱신

이 스킬의 Base directory를 `SKILL_DIR`이라 한다. `PLUGIN` = `SKILL_DIR/../..` (절대 경로로 바꿔 쓴다).

처음 전체 분석(`/groundwork:analyze`) 뒤에 쓰는 명령이다. 바뀐 부분만 다시 읽으므로 비용은 변경량에 비례한다.

## 0. 입력
- 인자: `<OUT 폴더> [이전 커밋] [새 커밋] [--yes]`. 이전 커밋을 주지 않으면 `OUT/_data/source-state.json`의 커밋, 새 커밋을 주지 않으면 대상 폴더의 HEAD다.
- `OUT/_data/module-map.json`을 Read해서 `TARGET` = project.root를 얻는다. 없으면 "먼저 /groundwork:scan 과 /groundwork:analyze 를 실행하세요"라고 알리고 멈춘다.

## 1. 영향 범위
Bash: `node "PLUGIN/scripts/plan-update.mjs" "OUT" [이전 커밋] [새 커밋] [--yes]`
출력 JSON을 `PLAN`이라 한다. 종료 코드와 `PLAN.status`에 따라:
- 2: 오류 메시지를 그대로 보여주고 멈춘다(Git 저장소가 아님, 이전 커밋 없음 등).
- 3: 대상 폴더가 새 커밋이 아니거나 커밋하지 않은 수정이 있다. 메시지를 보여주고 멈춘다. **대상 폴더에서 git checkout·stash를 대신 실행하지 않는다.**
- 4 (`over-threshold`): 분석된 모듈의 30%를 넘게 바뀌었다(`PLAN.modules.ratio`). 영향 모듈 목록을 보여주고 "전체 재분석: `/groundwork:analyze "OUT" <모듈...> --force` / 부분 갱신 계속: `/groundwork:update "OUT" <이전> <새> --yes`" 두 가지를 안내하고 멈춘다.
- 5 (`map-review`): 어느 모듈에도 속하지 않은 새 업무 파일(`PLAN.unassigned.files`)이 20개 이상이거나 새 폴더(`PLAN.unassigned.newDirs`)가 생겼다. 목록을 보여주고 모듈 지도를 고친 뒤(`/groundwork:scan "TARGET" --keep-map`) 다시 실행하라고 안내하고 멈춘다.
- 0 + `noop`: 분석된 모듈에 속한 파일이 바뀌지 않았다(제외 폴더·`.groundworkignore`에 걸린 파일은 처음부터 세지 않는다). Bash: `node "PLUGIN/scripts/source-state.mjs" "OUT" --record` 후 "바뀐 정책 없음"으로 보고하고 끝낸다. `PLAN.unassigned.files`가 있으면 "어느 모듈에도 속하지 않은 새 파일"로 목록을 함께 보여준다.
- 0 + `ready`: 아래로 계속한다. plan-update가 이미 `OUT/_data/prev/`에 갱신 전 facts·flows·lifecycles·conflicts를 저장했고 `module-files.json`을 새 파일 목록으로 바꿨다. `PLAN.resumed`가 true면 중단된 갱신을 이어서 하는 것이다(이전 스냅숏을 그대로 쓴다). 보고에 "이어서 실행"이라고 적는다.

## 2. 영향 모듈 다시 분석
`PLAN.modules.affected`의 모듈마다 Agent 도구(subagent_type: `groundwork:module-analyzer`)를 **한 메시지에서 동시에** 호출한다. 프롬프트는 analyze-module 스킬 2단계와 같고, 다음을 반드시 넣는다.
- PREVIOUS: `OUT/_data/prev/facts/<id>.json`
- 바뀐 파일: `PLAN.changed` 중 이 모듈 파일 목록(`OUT/_data/module-files.json`의 `.modules[<id>]`)에 든 것. "이 파일들을 먼저 읽고, 나머지 파일의 규칙은 PREVIOUS를 그대로 옮기되 근거 줄 번호가 맞는지 확인하라"고 지시한다.

모듈마다 차례로:
1. Bash: `node "PLUGIN/scripts/match-facts.mjs" "OUT" <id>` (정책 번호 복원. `--snapshot`은 쓰지 않는다)
2. Bash: `node "PLUGIN/scripts/validate-data.mjs" facts "OUT/_data/facts/<id>.json"`
3. 실패 처리와 1회 재시도는 analyze-module 스킬 3단계와 같다. 재시도 뒤에는 1번을 다시 실행한다. 끝내 실패한 모듈은 `OUT/_data/prev/facts/<id>.json`을 `OUT/_data/facts/<id>.json`으로 되돌려 이전 결과를 유지하고 "실패(이전 결과 유지)"로 보고한다.

## 3. 영향 흐름 다시 추적
`PLAN.flows.affected`가 있으면 Skill 도구로 `groundwork:trace`를 실행한다. 인자: `"OUT" "<PLAN.flows.labels[id]>" ... --force --no-report` (흐름마다 시작점 하나씩)

## 4. 검증과 변경 비교
1. Bash: `node "PLUGIN/scripts/verify-citations.mjs" "TARGET" "OUT"` (전체 근거를 다시 검증한다. 다른 파일 수정으로 줄이 밀린 근거도 여기서 잡힌다)
2. Bash: `node "PLUGIN/scripts/build-lifecycles.mjs" "OUT"`
3. Bash: `node "PLUGIN/scripts/diff-facts.mjs" "OUT" --from <PLAN.from> --to <PLAN.to>`. 출력의 `changes=<이름>`을 `CHANGE`라 한다. `OUT/_data/changes/<CHANGE>.json`을 Read한다.
4. Skill 도구로 `groundwork:conflicts`를 실행한다. 인자: `"OUT" --incremental <CHANGE> --no-report`. 바뀐 규칙·파일이 걸린 충돌만 다시 판정하고 새 충돌을 찾는다. 실패해도 계속한다.
5. Bash: `node "PLUGIN/scripts/diff-conflicts.mjs" "OUT" <CHANGE>`. 이전과 이후 충돌을 비교해 changes JSON에 `conflicts`(새 충돌·해소·변경·근거 확인 필요)를 넣는다. 출력 `added= resolved= changed= needsReview=`을 기록한다. 실패해도 계속한다.

## 5. 바뀐 문서만 다시 쓰기
기준은 changes JSON이다. 코드는 다시 읽지 않는다.
- `modules`의 모듈마다 `groundwork:write-policy`, `groundwork:write-spec` (인자: `"OUT" <id>`)
- `flows` 중 status가 `unchanged`가 아닌 흐름마다 `groundwork:write-flow` (인자: `"OUT" <흐름 id>`)
- `entities.added`와 `entities.changed` 중 `OUT/_data/lifecycles/<id>.json`의 `documented`가 true인 것마다 `groundwork:write-data` (인자: `"OUT" <엔티티 id>`). `entities.removed`의 `OUT/data/<id>/` 폴더는 지운다.
- 모듈 목록·흐름 목록이 바뀌었으면(`flows`에 added/removed가 있거나 `entities`에 added/removed가 있으면) `groundwork:write-onboarding`도 다시 실행하고 Bash: `node "PLUGIN/scripts/run-commands.mjs" "OUT" --check`

## 6. 변경 내역 문서와 리포트
1. Bash: `node "PLUGIN/scripts/render-changes.mjs" "OUT" <CHANGE>` → `OUT/changes/<CHANGE>.md`
2. Bash: `node "PLUGIN/scripts/build-report.mjs" "OUT"`
3. Bash: `node "PLUGIN/scripts/source-state.mjs" "OUT" --record` (다음 갱신의 기준 커밋)

## 7. 결과 보고
- 커밋 범위: `<PLAN.from 7자리> → <PLAN.to 7자리>`, 바뀐 파일 수
- 영향 모듈(업무 이름)과 상태(갱신 / 실패-이전 결과 유지), 다시 추적한 흐름
- 정책 변경: 추가 N · 변경 N · 삭제 N. 변경은 최대 5건을 `정책 번호: 이전 → 이후`로 보여준다.
- match-facts가 되돌린 번호 수(`restored`), 은퇴한 번호
- 정책 충돌: 새 N · 해소 N (diff-conflicts의 added, resolved). 새 충돌은 번호와 제목을 보여준다. 충돌 찾기가 실패했으면 "충돌 찾기 실패(문서는 계속)"
- 변경 내역 문서 `OUT/changes/<CHANGE>.md`, 리포트 `OUT/index.html`
