---
name: scan
description: Groundwork 1단계. 대상 소스 폴더를 가볍게 훑어 모듈 지도(module-map.json)와 아키텍처·의존 관계 다이어그램을 만든다. /groundwork:scan 에서 호출된다.
argument-hint: <대상 폴더> [출력 상위 폴더] [--keep-map]
---

# Groundwork 구조 스캔

이 스킬의 Base directory를 `SKILL_DIR`이라 한다. 스크립트는 `SKILL_DIR/../../scripts/`, 힌트는 `SKILL_DIR/../../hints/`, 스키마는 `SKILL_DIR/../../schemas/`에 있다.

## 0. 경로 결정
- 인자: `<대상 폴더> [출력 상위 폴더] [--keep-map]`. 대상 폴더를 절대 경로 `TARGET`으로 바꾼다. 폴더가 아니면 멈추고 알린다.
- `NAME` = TARGET의 폴더명. `OUT` = `<출력 상위 폴더 또는 현재 작업 폴더>/groundwork-output/<NAME>` (절대 경로).
- **TARGET 안에는 어떤 파일도 쓰지 않는다.** OUT이 TARGET 안이면 멈추고 다른 출력 폴더를 요청한다.
- `--keep-map`이면 `OUT/_data/module-map.json`이 있어야 한다. 없으면 "--keep-map 없이 먼저 스캔하세요"라고 알리고 멈춘다. 있으면 1단계 다음에 **4단계 검증으로 바로 간다**(2~3단계를 건너뛰고, 사용자가 고친 module-map을 그대로 쓴다).

## 1. 인벤토리
Bash: `node "SKILL_DIR/../../scripts/scan-inventory.mjs" "TARGET" "OUT/_data/inventory.json"`
- 종료 코드가 0이 아니면 출력된 오류를 사용자에게 그대로 보여주고 멈춘다.
- `OUT/_data/inventory.json`을 Read한다. 특히 `layout.type`, `layout.layerParents`를 확인한다.

## 2. 가볍게 읽기 (최대 30개 파일)
- `stacks`의 각 스택에 대해 `SKILL_DIR/../../hints/<스택>.md`와 `generic.md`를 Read한다. "모듈 경계 신호" 절을 따른다.
- `TARGET/.groundwork-modules.json`이 있으면 Read한다(30개에 포함하지 않는다).
- `manifests`, `entryPoints`, README, 라우팅/설정 파일을 우선으로 읽는다. 업무 로직 본문은 깊게 읽지 않는다.

## 3. 모듈 경계 정하기
아래 우선순위로 정하고, 모듈마다 사용한 기준을 `basis`에 적는다.

1. **`manual`**: `.groundwork-modules.json`의 모듈은 `id`, `name`, `paths`를 그대로 쓴다. 이 모듈들이 덮지 않는 파일만 아래 규칙으로 나눈다.
2. **`build-module`**: 빌드 서브모듈이나 워크스페이스 패키지가 업무 단위면 그대로 쓴다.
3. `layout.type`에 따라:
   - **`feature`** → `folder`: `dirs`의 파일 수 분포로 기능 폴더(order, payment, member...)를 모듈로 삼는다.
   - **`layer`** → `name-prefix`와 `url-prefix`:
     - `layout.layerParents` 아래 계층 폴더마다 Glob으로 **파일 이름만** 나열한다(내용은 읽지 않고, 30개 제한에 포함하지 않는다).
     - 힌트의 계층 접미어를 떼서 업무 이름 후보를 만든다(`LoanController`, `LoanService`, `LoanRepository`, `Loan` → Loan).
     - 스택 힌트에 적힌 URL 접두어 신호를 Grep으로 찾아(`-n`, 결과만 확인) 후보를 확인하고, 엔티티 이름으로 보강한다.
     - `paths`는 glob으로 쓴다. 예: `src/main/java/com/example/library/**/Loan*.java`. 접두어가 다른 업무 이름의 앞부분이면(Book과 Booking) 파일 경로를 직접 나열한다.
     - 요청 DTO처럼 접두어가 없는 파일은 그 파일을 쓰는 서비스나 컨트롤러가 속한 모듈에 파일 경로로 넣는다.
   - **`mixed`** → 기능 폴더는 `folder`로, 계층 폴더 부분은 위 `layer` 규칙으로 나눈다. 한 모듈에 두 기준을 섞었으면 `mixed`다.
4. 설정, 공통 예외, 유틸, 시작 파일은 `common` 하나로 묶는다(`basis`는 `folder` 또는 파일 목록이면 `mixed`).
5. 모듈 수는 3~12개를 목표로 한다. 너무 잘게 나누지 않는다.

`SKILL_DIR/../../schemas/module-map.schema.json` 형식으로 `OUT/_data/module-map.json`을 Write한다.
- `project.root` = TARGET, `project.stacks` = inventory의 stacks
- 모듈마다 `id`(kebab-case 영문), `abbrev`(2~4 대문자, 중복 금지), `name`(업무 이름 한국어), `codeName`, `summary`(업무 언어 한 문장), `paths`, `fileCount`(일단 0, 5단계에서 채워진다), `dependsOn`(import/호출 관계로 판단), `basis`

## 4. 검증
Bash: `node "SKILL_DIR/../../scripts/validate-data.mjs" module-map "OUT/_data/module-map.json"`
- 실패하면 오류 메시지를 보고 파일을 고쳐 **한 번만** 다시 검증한다. 또 실패하면 오류를 보여주고 멈춘다.

## 5. 경로 해석과 점검
Bash: `node "SKILL_DIR/../../scripts/resolve-modules.mjs" "OUT"`
- 종료 코드가 0이 아니면 오류를 보여주고 멈춘다.
- `SHARD module ...` 줄은 파일이 많은 모듈을 분석 때 여러 에이전트가 나눠 읽는다는 알림이다(파일 40개 또는 300KB 초과. 환경 변수 `GROUNDWORK_SHARD_FILES`, `GROUNDWORK_SHARD_BYTES`로 바꾼다). 고칠 것은 없고 결과 보고에 넣는다.
- `WARN`이 있거나 `overlaps`가 0보다 크면 `OUT/_data/module-files.json`의 `unassigned.sample`, `overlaps.sample`을 보고 module-map의 `paths`를 **한 번만** 고친 뒤 4~5단계를 다시 실행한다.
  - 미배정 파일 중 업무 파일은 알맞은 모듈에, 나머지는 `common`에 넣는다. 빌드 파일, 문서, 테스트 같은 비업무 파일은 미배정으로 남겨도 된다.
  - 중복 파일은 한 모듈에만 남긴다.
- `--keep-map`일 때는 고치지 않는다. 경고를 그대로 결과 보고에 넣는다(사용자가 고친 내용을 존중한다).

### 5-1. 화면 지도 (Nexacro만)
inventory의 `stacks`에 `nexacro`가 있으면(module-map이 있어야 하므로 5단계 뒤에 실행한다) Bash: `node "SKILL_DIR/../../scripts/build-screens.mjs" "OUT"`
- `OUT/_data/screens.json`에 화면, 컴포넌트, 버튼별 핸들러 → 서버 호출 → URL → Spring 컨트롤러가 담긴다. 종료 코드가 0이 아니면 오류를 보여주고 멈춘다.
- 출력 한 줄(`screens=... buttons=... linked=... warnings=...`)을 결과 보고에 그대로 넣는다.

## 6. 다이어그램 (diagram-design)
Skill 도구로 `diagram-design:diagram-design`을 호출해 두 개를 만든다. 호출할 때 다음을 반드시 지시한다: "스타일 가이드 게이트: 사용자는 기본 스타일(옵션 e)을 명시적으로 선택했다. 질문하지 말고 진행하라."
1. `OUT/overview/architecture.html`: architecture 유형. 사용자/외부 시스템 → 진입점 → 모듈 → 저장소. 노드 9개 이하.
2. `OUT/overview/dependency.html`: dependency 유형. module-map의 dependsOn 관계.

다이어그램 생성이 실패하면 같은 내용을 Markdown 표로 `OUT/overview/<이름>.md`에 쓰고, 실패 사실을 결과 보고에 적는다.

## 7. 결과 보고
사용자에게 다음을 보여준다.
- 구조 유형: `layout.type` (기능별 / 계층별 / 혼합)
- 모듈 표: 업무 이름, 코드 이름, 파일 수, 경계 기준(`basis`), 예상 분석 시간(파일 30개당 약 1분으로 추정, 최소 1분. 조각으로 나뉘는 모듈은 가장 큰 조각 기준), 조각 수(나뉘는 모듈만)
- 미배정 파일 수와 비율, 중복 파일 수 (resolve-modules 첫 줄), 경고
- 건너뛴 파일 수(`skipped.count`)
- 모듈이 잘못 나뉘었을 때 고치는 방법:
  1. `OUT/_data/module-map.json`의 `paths`나 `name`을 고친 뒤 `/groundwork:scan "TARGET" --keep-map`
  2. 다음 스캔에서도 쓰려면 `TARGET/.groundwork-modules.json`에 `{ "modules": [{ "id", "name", "paths" }] }` 형식으로 저장 (사용자가 직접 만든다. scan은 이 파일을 쓰지 않는다)
- 다음 명령 예: `/groundwork:analyze "OUT" <모듈 id ...>`
