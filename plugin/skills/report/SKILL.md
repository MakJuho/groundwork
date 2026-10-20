---
name: report
description: Groundwork 3~4단계. 근거 검증 후 분석된 모든 모듈의 정책서·명세서와 온보딩 가이드를 만들고 index.html 리포트를 빌드한다. analyze-module 스킬 또는 /groundwork:report 에서 호출된다.
argument-hint: <출력 폴더>
---

# Groundwork 산출물 생성

이 스킬의 Base directory를 `SKILL_DIR`이라 한다. `PLUGIN` = `SKILL_DIR/../..` (절대 경로).

## 0. 입력
- 인자: `<OUT 폴더>`. `OUT/_data/module-map.json`을 Read해서 `TARGET` = project.root를 얻는다.
- 분석된 모듈 = `OUT/_data/facts/*.json` 파일명(확장자 제외). 하나도 없으면 "먼저 /groundwork:analyze 를 실행하세요"라고 알리고 멈춘다.
- 추적된 흐름 = `OUT/_data/flows/*.json` 파일명(없어도 된다).

## 1. 근거 검증 (문서 작성 전에)
Bash: `node "PLUGIN/scripts/verify-citations.mjs" "TARGET" "OUT"`
- facts 항목과 흐름 단계 중 검증에 실패한 것은 자동으로 low(확인 필요)가 된다. 출력의 failed 수를 기록한다.
- 출력의 `skipped` 줄은 형식이 깨져 건너뛴 파일이다. 결과 보고에 그 목록을 넣는다.
- 종료 코드가 2면(대상 폴더가 없거나 module-map의 project.root와 다름 등) 문서를 만들지 말고 오류 메시지를 그대로 보여준 뒤 멈춘다.

## 1A. 데이터 생애 집계
Bash: `node "PLUGIN/scripts/build-lifecycles.mjs" "OUT"`
- 종료 코드가 0이 아니면 오류 메시지를 보여주고 멈춘다.

## 1B. 실행 명령 근거 수집
Bash: `node "PLUGIN/scripts/run-commands.mjs" "OUT"`
- 대상 폴더의 빌드 파일(package.json scripts, pom.xml, gradle, Makefile 등)이 뒷받침하는 명령만 `OUT/_data/run-commands.json`에 남긴다. 온보딩 가이드는 이 목록만 쓴다.

## 2. 문서 작성
기존 문서가 이미 있어도 건너뛰지 말고 항상 다시 만든다(코드는 다시 읽지 않고 facts·flows·lifecycles만 쓴다).
1. 분석된 모듈마다 Skill 도구로 `groundwork:write-policy`와 `groundwork:write-spec`을 실행한다(인자: `"OUT" <id>`).
2. 추적된 흐름마다 `groundwork:write-flow`를 실행한다(인자: `"OUT" <흐름 id>`).
3. `OUT/_data/lifecycles/*.json` 중 `documented`가 true인 엔티티마다 `groundwork:write-data`를 실행한다(인자: `"OUT" <엔티티 id>`). 최대 12개이며, writers와 transitions 수가 많은 순서로 고른다.
4. 마지막으로 `groundwork:write-onboarding`을 한 번 실행한다(인자: `"OUT"`).
5. Bash: `node "PLUGIN/scripts/run-commands.mjs" "OUT" --check`. 온보딩 가이드의 명령 블록에서 근거 없는 명령을 "확인 필요"로 옮긴다. 출력의 `unverified` 수와 옮긴 명령을 결과 보고에 넣는다.

## 3. 리포트 빌드
Bash: `node "PLUGIN/scripts/build-report.mjs" "OUT"`
- 종료 코드가 0이 아니면(예: OUT이 대상 폴더 안에 있음, module-map.json 없음) 오류 메시지를 보여주고 멈춘다.

## 4. 결과 보고
- `OUT/index.html` 경로 (브라우저로 열면 된다)
- 모듈별 정책 수, 확인 필요 수, 근거 검증 실패 수
- 흐름 문서 수, 데이터 생애 문서 수. 1A 출력의 `entities`는 집계한 엔티티 전체이고, 문서는 `documented`인 엔티티만 만든다. 두 수를 함께 적는다(예: "엔티티 10개 중 쓰기·상태 변화가 있는 6개 문서화").
- 실패한 다이어그램이 있으면 그 목록
