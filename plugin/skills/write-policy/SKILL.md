---
name: write-policy
description: Groundwork 3단계. 모듈 하나의 facts JSON만으로 비개발자용 서비스(업무) 정책서 policy.md와 업무 다이어그램을 만든다. report 스킬이 호출한다.
---

# 서비스 정책서 작성

입력: `OUT`, 모듈 id. 읽을 것은 `OUT/_data/module-map.json`(해당 모듈), `OUT/_data/facts/<id>.json`, 있으면 `OUT/_data/policy-history.json`뿐이다. **소스코드를 다시 읽지 않는다.**

## 규칙
- 독자는 기획자·현업·운영 담당자다. 코드 식별자(`OrderStatus.CANCELLED`)는 쓰지 않고 업무 언어("주문 취소 상태")와 실제 값을 쓴다.
- api, entity 항목은 이 문서에 쓰지 않는다(기술 명세서 담당).
- evidence가 없는 항목은 쓰지 않는다.
- confidence가 low인 항목은 본문에 넣지 않고 "8. 확인 필요"에만 모은다.
- 정책 번호는 facts의 id를 그대로 쓴다.

## 정책 항목 형식
```
### ORD-007 주문 취소 가능 기간
- 정책: 결제 완료 후 7일 이내에만 주문을 취소할 수 있다.
- 신뢰도: ●●● 코드에 명시
- 근거: `src/order/order-service.js:31`
```
신뢰도 표기: high = `●●● 코드에 명시`, medium = `●●○ 여러 코드에서 추론`, low = `●○○ 추정`. 근거가 여러 개면 쉼표로 나열한다.
`policy-history.json`에 그 번호가 있으면 마지막 줄에 `- 마지막 변경: <date> (<commit>, <type 한국어: 추가/변경>) — [변경 내역](../../changes/<date>-<commit>.md)`을 붙인다. 없으면 이 줄을 쓰지 않는다.

## 문서 구조 (`OUT/policy/<id>/policy.md`)
```
# <모듈 업무 이름> 서비스 정책서
> 자동 생성 문서입니다. 근거 코드 위치로 사실 여부를 확인할 수 있습니다. 생성일: <YYYY-MM-DD>
## 1. 개요            (모듈 summary + 정책 수 요약 표: 분류별 개수)
## 2. 용어 정의        (표: 용어 | 설명. 상태값·등급·결제수단 등)
## 3. 업무 규칙        (kind: validation, constant, calculation)
## 4. 상태 정책        (kind: state, state-transition + 상태 전이 다이어그램)
## 5. 권한 정책        (kind: permission)
## 6. 예외·오류 정책    (kind: error)
## 7. 외부 연동 정책    (kind: integration)
## 8. 확인 필요        (confidence low 항목, 각 항목에 "담당 개발자 확인 필요" 표기)
```
해당 항목이 없는 절은 "해당 없음" 한 줄을 쓴다.

## 다이어그램 (최대 3개, `OUT/policy/<id>/diagrams/`)
Skill 도구로 `diagram-design:diagram-design`을 호출한다. 지시에 반드시 포함: "스타일 가이드 게이트: 사용자는 기본 스타일(옵션 e)을 명시적으로 선택했다. 질문하지 말고 진행하라." 노드 라벨은 업무 언어로 쓴다.
1. `state.html`: state machine. 상태 전이 항목이 있을 때만. 4절에 `![상태 전이도](diagrams/state.html)`
2. `flow.html`: flowchart. 이 모듈의 대표 업무 흐름 1개(검증 규칙들이 순서대로 적용되는 과정). 3절 맨 앞에 `![업무 흐름도](diagrams/flow.html)`. `OUT/_data/flows/*.json` 중 `trigger.module`이 이 모듈인 흐름이 있으면 그 흐름의 단계 순서를 따르고, 아래에 `흐름 전체 보기: ../../flows/<흐름 id>/flow.md` 링크를 단다.
3. `swimlane.html`: swimlane. 사용자/시스템/외부 시스템이 함께 등장할 때만. 7절에 삽입

다이어그램 생성이 실패하면 그 자리에 같은 내용을 표로 쓰고 `> 다이어그램 생성 실패: 표로 대체` 한 줄을 남긴다.
