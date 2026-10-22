---
name: analyze-module
description: Groundwork 2단계. 선택한 모듈마다 module-analyzer 서브에이전트를 병렬로 실행해 facts JSON을 만들고 검증한 뒤 report 스킬로 산출물을 만든다. /groundwork:analyze 에서 호출된다.
---

# Groundwork 모듈 심층 분석

이 스킬의 Base directory를 `SKILL_DIR`이라 한다. `PLUGIN` = `SKILL_DIR/../..` (절대 경로로 바꿔 쓴다).

## 0. 입력
- 인자: `<OUT 폴더> <모듈 id ...> [--force]`
- `OUT/_data/module-map.json`과 `OUT/_data/module-files.json`을 Read한다. 둘 중 하나라도 없으면 "먼저 /groundwork:scan 을 실행하세요"라고 알리고 멈춘다.
- `TARGET` = module-map의 `project.root`
- 인자의 모듈 id가 module-map에 없으면 사용 가능한 id 목록을 보여주고 멈춘다.
- 모듈 id를 주지 않았으면 전체 모듈 표를 보여주고 고르라고 요청한 뒤 멈춘다.

## 1. 이어하기 판단
- `--force`가 없고 `OUT/_data/facts/<id>.json`이 이미 있으면, 그 파일을 validate-data로 검증한다. 통과하고 그 파일의 `modulePaths`가 지금 module-map의 `paths`와 같으면 그 모듈은 건너뛴다("이전 결과 사용"으로 보고).
- `modulePaths`가 없거나 다르면 다시 분석한다("모듈 경로가 바뀌어 다시 분석"으로 보고).
- 다시 분석할 모듈마다 Bash: `node "PLUGIN/scripts/match-facts.mjs" "OUT" <id> --snapshot`. 기존 facts를 `OUT/_data/prev/facts/<id>.json`으로 복사한다(정책 번호를 지키는 기준). 예전 스냅숏은 항상 새로 덮어쓴다.

## 2. 병렬 분석
남은 모듈마다 Agent 도구(subagent_type: `groundwork:module-analyzer`)를 **한 메시지에서 동시에** 호출한다. 각 프롬프트에 다음을 넣는다.
- TARGET
- MODULE: 모듈 객체 JSON
- MODULE_FILES: `OUT/_data/module-files.json`
- HINTS: `PLUGIN/hints/generic.md`와 project.stacks의 각 `PLUGIN/hints/<스택>.md` 중 존재하는 파일
- SCHEMA: `PLUGIN/schemas/facts.schema.json`
- OUTPUT: `OUT/_data/facts/<id>.json`
- PREVIOUS: `OUT/_data/prev/facts/<id>.json` (1단계 출력이 `snapshot=created`일 때. `none`이면 "없음")

**큰 모듈은 조각으로 나눠 분석한다.** `module-files.json`의 `.shards[<id>]`가 있는 모듈(파일 수·크기가 한도를 넘어 scan이 나눠 둔 것)은 모듈 하나가 아니라 **조각마다** 에이전트를 호출한다. 같은 메시지에 모든 모듈의 모든 조각을 넣어 한꺼번에 돌린다.
- 호출 전에 Bash: `node "PLUGIN/scripts/merge-facts.mjs" "OUT" <id> --clean` (예전 조각 결과가 섞이지 않게 지운다. `rm`은 쓰지 않는다)
- 조각 번호 `i`는 **0부터** `.shards[<id>]` 배열 순서대로 `0 ~ 조각 수-1`이다. 1부터 매기지 않는다.
- 조각 프롬프트: 위 입력에서 PREVIOUS를 뺀다. `SHARD`: `{ "index": <i>, "total": <조각 수>, "files": [<.shards[<id>][i]의 파일 경로 전부>] }`. `OUTPUT`: `OUT/_data/facts-parts/<id>.<i>.json`
- 조각이 모두 끝나면 Bash: `node "PLUGIN/scripts/merge-facts.mjs" "OUT" <id>`. 조각 facts를 `OUT/_data/facts/<id>.json` 하나로 합치고 번호를 다시 매긴다(출력 `parts= items= merged=`). 종료 코드 2면 오류에 나온 조각(`shard <i>: ...`)만 오류 메시지를 붙여 같은 에이전트로 한 번 다시 호출하고 합친다. 그래도 실패하면 그 모듈을 "실패"로 보고한다.
- 합친 뒤에는 아래 3단계(번호 맞추기, 검증)를 일반 모듈과 똑같이 한다.

## 3. 번호 맞추기, 검증과 1회 재시도
모듈마다 Bash: `node "PLUGIN/scripts/match-facts.mjs" "OUT" <id>`
- 이전 facts가 있으면 같은 규칙에 이전 정책 번호를 되돌려 주고, 사라진 번호는 `OUT/_data/retired-ids.json`에 남긴다. 처음 분석이면 `prev=none`이 나오고 아무것도 바꾸지 않는다. 종료 코드 2면 아래 검증 실패와 같이 처리한다.

모듈마다 Bash: `node "PLUGIN/scripts/validate-data.mjs" facts "OUT/_data/facts/<id>.json"`
- 실패한 모듈은 같은 서브에이전트를 한 번 더 호출한다. 프롬프트에 오류 메시지 전문을 붙이고, 기존 OUTPUT을 읽어 고치라고 지시한다. 조각으로 나눈 모듈은 합친 결과(`facts/<id>.json`)를 고치게 한다.
- 그래도 실패하면 그 모듈을 "실패"로 표시하고 파일을 `OUT/_data/facts-failed/<id>.json`으로 옮긴다(흐름 추적과 리포트에 섞이지 않게 한다). 나머지는 계속 진행한다.
- 검증을 통과한 모듈에 예전 `OUT/_data/facts-failed/<id>.json`이 남아 있으면 지운다.

## 3A. 흐름 추적
Skill 도구로 `groundwork:trace`를 실행한다. 인자: `"OUT" --auto 3 --no-report`
- 데이터를 쓰는 API 중 최대 3개를 자동으로 골라 흐름을 추적한다. 이미 추적한 흐름은 건너뛴다.
- 흐름 추적이 실패해도 문서 생성은 계속한다.

## 3B. 충돌 찾기
Skill 도구로 `groundwork:conflicts`를 실행한다. 인자: `"OUT" --no-report`
- 분석된 모든 모듈의 규칙(`OUT/_data/facts`)을 놓고 규칙 사이의 정책 충돌을 찾아 `OUT/_data/conflicts.json`에 남긴다. 이전 충돌 번호는 유지된다.
- 충돌 찾기가 실패해도 4단계로 계속한다.

## 4. 산출물 생성
Skill 도구로 `groundwork:report`를 실행한다. 인자: `"OUT"`

이어서 Bash: `node "PLUGIN/scripts/source-state.mjs" "OUT" --record`. 분석한 커밋을 남겨 다음 `/groundwork:update`의 기준으로 삼는다(Git 저장소가 아니면 `git:false`로 남고 부분 갱신은 쓸 수 없다).

## 5. 결과 보고
모듈별 표: 업무 이름, 상태(완료/이전 결과 사용/실패), 항목 수, 신뢰도 분포, 조각 수(나눈 모듈만). 실패한 모듈은 다시 실행하는 명령을 보여준다: `/groundwork:analyze "OUT" <실패 id> --force`

추적한 흐름 목록(trace 스킬의 결과 표)과 다른 흐름을 추적하는 명령 예: `/groundwork:trace "OUT" "POST /api/..."`

정책 충돌: open N건(high N · medium N), 확인 필요 N건(conflicts 스킬의 결과). 충돌 찾기가 실패했으면 "충돌 찾기 실패(문서는 계속)"와 다시 실행하는 명령 `/groundwork:conflicts "OUT"`을 보여준다.
