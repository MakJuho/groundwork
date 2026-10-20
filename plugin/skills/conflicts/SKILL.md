---
name: conflicts
description: Groundwork 충돌 찾기(3B단계). 규칙 요약본과 후보 신호를 만들고 conflict-finder 서브에이전트로 규칙 사이의 정책 충돌을 판정해 conflicts.json을 만든 뒤, 번호를 맞추고 근거를 검증한다. /groundwork:conflicts 와 analyze-module, update 스킬이 호출한다.
argument-hint: <출력 폴더> [--incremental <CHANGE>] [--no-report]
---

# Groundwork 정책 충돌 찾기

이 스킬의 Base directory를 `SKILL_DIR`이라 한다. `PLUGIN` = `SKILL_DIR/../..` (절대 경로로 바꿔 쓴다).

**이 단계의 실패는 analyze/update의 실패가 아니다.** 어느 단계에서 멈추든 경고 한 줄("충돌 찾기 실패(문서는 계속)")과 이유를 남기고 끝낸다. 호출한 스킬은 다음 단계로 계속한다.

## 0. 입력
- 인자: `<OUT 폴더> [--incremental <CHANGE>] [--no-report]`. `--incremental`이 있으면 `MODE` = `incremental`, 없으면 `full`이다.
- `OUT/_data/module-map.json`을 Read해서 `TARGET` = project.root를 얻는다. 없으면 "먼저 /groundwork:scan 과 /groundwork:analyze 를 실행하세요"라고 알리고 멈춘다.
- `OUT/_data/facts/*.json`이 하나도 없으면 "분석된 규칙이 없어 충돌 찾기를 건너뜀"으로 보고하고 끝낸다.
- incremental이면 `OUT/_data/changes/<CHANGE>.json`과 `OUT/_data/update-plan.json`이 있어야 한다. 없으면 full로 바꿔 진행하고 보고에 "증분 정보가 없어 전체 판정"이라고 적는다.
- incremental이면 이전 충돌 결과도 확인한다. Bash: `node "PLUGIN/scripts/validate-data.mjs" conflicts "OUT/_data/prev/conflicts.json"`. 파일이 없거나 종료 코드가 0이 아니면 full로 바꿔 진행하고(1단계 스냅숏부터) 보고에 "이전 충돌 결과가 없어 전체 판정"이라고 적는다. 증분 판정은 이전 결과를 고쳐 쓰는 방식이라, 기준이 없으면 바뀌지 않은 곳의 충돌을 놓친다.

## 1. 이전 결과 스냅숏 (full만)
Bash: `node "PLUGIN/scripts/match-conflicts.mjs" "OUT" --snapshot`
- 기존 `OUT/_data/conflicts.json`을 `OUT/_data/prev/conflicts.json`으로 복사한다(충돌 번호를 지키는 기준). 없거나 형식이 깨졌으면 `snapshot=none`이고 prev도 지운다.
- incremental은 이 단계를 건너뛴다. plan-update가 이미 `prev/conflicts.json`을 저장했다.

## 2. 규칙 요약본
Bash: `node "PLUGIN/scripts/build-rule-digest.mjs" "OUT"`
- `OUT/_data/rule-digest.json`을 만든다. 출력 `rules=<n> signals=<m>`을 기록한다.
- 종료 코드가 0이 아니면 오류 메시지를 보여주고 "충돌 찾기 실패(문서는 계속)"로 끝낸다.

## 3. 충돌 판정
Agent 도구(subagent_type: `groundwork:conflict-finder`)를 한 번 호출한다. 프롬프트에 다음을 넣는다.
- TARGET
- DIGEST: `OUT/_data/rule-digest.json`
- FACTS_DIR: `OUT/_data/facts`
- SCHEMA: `PLUGIN/schemas/conflicts.schema.json`
- OUTPUT: `OUT/_data/conflicts.json`
- MODE: `full` 또는 `incremental`
- PREVIOUS: `OUT/_data/prev/conflicts.json` (없으면 "없음"). full에서도 넘긴다(1단계 스냅숏). 판정이 실행마다 흔들려 맞는 충돌이 빠지지 않게, 에이전트는 이전 충돌부터 다시 확인한다.
- incremental만:
  - CHANGE: `OUT/_data/changes/<CHANGE>.json`
  - CHANGED_FILES: `OUT/_data/update-plan.json` (`.changed`가 바뀐 파일 목록)

## 4. 검증과 1회 재시도
Bash: `node "PLUGIN/scripts/validate-data.mjs" conflicts "OUT/_data/conflicts.json"`
- 실패하면 같은 서브에이전트를 한 번 더 호출한다. 프롬프트에 3단계 입력과 오류 메시지 전문을 붙이고, 기존 OUTPUT을 읽어 고치라고 지시한다.
- 그래도 실패하면(또는 OUTPUT이 없으면) 이전 결과로 되돌린다.
  - `OUT/_data/prev/conflicts.json`이 있으면 그 파일을 `OUT/_data/conflicts.json`으로 복사한다.
  - 없으면 `OUT/_data/conflicts.json`을 지운다(리포트는 충돌 화면 없이 만들어진다).
  - 되돌린 뒤에는 항상 Bash: `node "PLUGIN/scripts/verify-citations.mjs" "TARGET" "OUT"`를 실행한다. 되돌린 충돌은 갱신 전 코드 기준이라, 지금 코드와 근거 줄이 맞지 않는 충돌은 `unverified`로 내려야 한다(파일을 지웠어도 facts·흐름 검증을 위해 실행한다). 종료 코드가 0이 아니어도 계속한다.
  - "충돌 찾기 실패(문서는 계속)"와 오류 요약을 보고하고 끝낸다. 오류로 멈추지 않는다.

## 5. 번호 맞추기
Bash: `node "PLUGIN/scripts/match-conflicts.mjs" "OUT" --seen <SEEN>`
- `SEEN`: full이면 지금 ISO 시각(예: `2026-10-19T09:30:00Z`), incremental이면 `CHANGE`
- 이전 충돌과 같은 충돌에 이전 `CFL` 번호와 `firstSeen`을 되돌리고, 새 충돌에 새 번호를 매기고, 사라진 번호는 `OUT/_data/retired-conflicts.json`에 남긴다. 이전 결과가 없으면(또는 깨졌으면 WARN 후) `prev=none`이고 `firstSeen`을 채우며 임시 번호(`CFL-900` 이상)를 다음 빈 번호로 바꾼다. 매번 `generatedAt`을 지금 시각으로 쓴다.
- 출력 `kept= restored= added= retired=`을 기록한다.
- 종료 코드가 2(지금 `conflicts.json` 자체가 깨짐)면 4단계의 "그래도 실패하면"과 같이 되돌리고(근거 검증 포함) 끝낸다.

## 6. 근거 검증
Bash: `node "PLUGIN/scripts/verify-citations.mjs" "TARGET" "OUT"`
- 근거 줄이 실제 코드와 맞지 않는 충돌은 `status: "unverified"`가 되어 홈 카드 수에서 빠지고 "확인 필요"에만 나온다.
- 출력 끝의 `conflicts=<n>`과, `skipped` 줄에 `conflicts.json`이 있으면 그 이유를 기록한다.
- 종료 코드가 2면 오류 메시지를 보여주고 끝낸다.

## 6A. 리포트 (독립 실행만)
`--no-report`가 없으면 Bash: `node "PLUGIN/scripts/build-report.mjs" "OUT"`. 홈 카드·충돌 화면·정책서 배지를 새 결과로 다시 그린다. analyze-module과 update 스킬은 `--no-report`를 붙여 부르고 리포트를 직접 만든다.

## 7. 결과 보고
`OUT/_data/conflicts.json`을 Read해서 보고한다.
- 정책 충돌: open N건 (confidence high N · medium N), 확인 필요(unverified) N건
- open 충돌 표: 번호, 제목, 유형, 심각도. 최대 10건
- incremental이면 번호 맞추기 결과: 유지 N(kept) · 새 충돌 N(added) · 해소 N(retired)
- 실패했으면 "충돌 찾기 실패(문서는 계속)"와 이유
- 다시 실행하는 명령: `/groundwork:conflicts "OUT"`
