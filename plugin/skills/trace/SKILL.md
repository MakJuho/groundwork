---
name: trace
description: Groundwork 2.5단계. 시작점(API·배치·화면 동작)에서 호출을 실제로 따라가 흐름 JSON을 만든다. /groundwork:trace 와 analyze-module 스킬이 호출한다.
argument-hint: <출력 폴더> ["METHOD /경로" ...] [--auto N] [--force]
---

# Groundwork 흐름 추적

이 스킬의 Base directory를 `SKILL_DIR`이라 한다. `PLUGIN` = `SKILL_DIR/../..` (절대 경로로 바꿔 쓴다).

## 0. 입력
- 인자: `<OUT 폴더> [시작점 ...] [--auto N] [--force] [--no-report]`. 시작점은 따옴표로 묶은 문자열이다. 예: `"POST /api/loans"`, `"ReservationScheduler.expire"`, `"예약 화면의 취소 버튼"`
- `OUT/_data/module-map.json`과 `OUT/_data/module-files.json`을 Read한다. 없으면 "먼저 /groundwork:scan 을 실행하세요"라고 알리고 멈춘다.
- `TARGET` = module-map의 `project.root`
- `OUT/_data/facts/`가 비어 있으면 정책 번호 연결과 자동 선택을 할 수 없다고 알린다. 시작점이 없으면 멈춘다.

## 1. 시작점 정하기
**시작점을 주지 않았으면** Bash: `node "PLUGIN/scripts/pick-flows.mjs" "OUT" --max <N, 기본 3>` (`--force`면 `--all`을 붙인다)
- 출력 JSON 배열의 각 항목이 시작점이다. `TRIGGER` = `{kind: "api", label, module, factId}`, `FLOW_ID` = 항목의 `id`
- 배열이 비어 있으면 "자동으로 고를 흐름이 없습니다(데이터를 쓰는 API를 찾지 못함)"라고 기록하고 4단계로 간다.

**시작점을 주었으면** 각각에 대해:
0. `<화면 id>.<버튼 id>` 형식(예: `MemberMng.btn_save`)이고 `OUT/_data/screens.json`의 `screens[]`에서 그 화면 id의 `buttons[]`에 그 버튼 id가 있으면: `FLOW_ID` = `ui-<화면 id 소문자 kebab>-<버튼 id의 _를 -로>`(화면 id의 kebab 변환: 소문자나 숫자 뒤에 오는 대문자 앞에 `-`를 넣고 모두 소문자로 바꾼다. 예: `MemberMng.btn_save` → `ui-member-mng-btn-save`), `TRIGGER` = `{kind: "ui", label: "<화면 title> · <버튼 text>", screen, component, module?}`. 에이전트 프롬프트에 SCREEN(그 화면 항목 JSON)을 함께 넣는다. 아래 1~3은 건너뛴다.
1. `<METHOD> <경로>` 형식이면 facts의 api 항목(`details.method`, `details.path`)과 비교한다. 대소문자는 무시하고, 경로 변수 이름은 무시한다(`{id}`와 `{loanId}`는 같다). 찾으면 `FLOW_ID` = 항목 id 소문자, `TRIGGER` = `{kind: "api", label, module, factId}`
2. 못 찾았거나 다른 형식이면 TARGET에서 Grep으로 찾는다(클래스·메서드 이름, 라우트 문자열, 화면 문구). 찾으면 `FLOW_ID` = `custom-<시작점을 kebab-case로, 최대 40자>`, `TRIGGER.kind`는 batch, event, ui, message 중 알맞은 것이다.
3. 그래도 못 찾으면 "시작점을 찾지 못함"으로 기록하고, facts의 api 항목 중 비슷한 것을 최대 5개 보여준다.

`--force`가 없고 `OUT/_data/flows/<FLOW_ID>.json`이 이미 있으면 그 흐름은 건너뛴다("이전 결과 사용"으로 보고).

## 2. 병렬 추적
남은 흐름마다 Agent 도구(subagent_type: `groundwork:flow-tracer`)를 **한 메시지에서 동시에** 호출한다. 각 프롬프트에 다음을 넣는다.
- TARGET, TRIGGER(JSON), FLOW_ID
- SCREEN(`ui` 시작점만): screens.json의 해당 화면 항목 JSON
- MODULE_MAP: `OUT/_data/module-map.json`, MODULE_FILES: `OUT/_data/module-files.json`
- FACTS_DIR: `OUT/_data/facts`
- HINTS: `PLUGIN/hints/generic.md`와 project.stacks의 각 `PLUGIN/hints/<스택>.md` 중 존재하는 파일
- SCHEMA: `PLUGIN/schemas/flow.schema.json`
- OUTPUT: `OUT/_data/flows/<FLOW_ID>.json`

## 3. 검증과 1회 재시도
흐름마다 Bash: `node "PLUGIN/scripts/validate-data.mjs" flow "OUT/_data/flows/<FLOW_ID>.json"`
- 실패한 흐름은 같은 서브에이전트를 한 번 더 호출한다. 프롬프트에 오류 메시지 전문을 붙이고, 기존 OUTPUT을 읽어 고치라고 지시한다.
- 그래도 실패하면 그 흐름을 "실패"로 표시하고 파일을 `OUT/_data/flows-failed/<FLOW_ID>.json`으로 옮긴다(리포트에 섞이지 않게 한다). 나머지는 계속 진행한다.

## 4. 산출물 생성
`--no-report`가 없으면 Skill 도구로 `groundwork:report`를 실행한다. 인자: `"OUT"`

## 5. 결과 보고
흐름별 표: 흐름 id, 제목, 시작점, 단계 수, 실패 분기 수, 상태(완료 / 이전 결과 사용 / 실패 / 시작점 못 찾음). 완료된 흐름은 문서 위치 `OUT/flows/<FLOW_ID>/flow.md`를 함께 보여준다.
