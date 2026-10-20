---
name: write-flow
description: Groundwork 3단계. 흐름 JSON 하나로 비개발자와 개발자가 함께 읽는 흐름 추적 문서 flow.md와 업무용 스윔레인·개발자용 시퀀스 다이어그램을 만든다. report 스킬이 호출한다.
---

# 흐름 추적 문서 작성

입력: `OUT`, 흐름 id. 읽을 것은 `OUT/_data/flows/<id>.json`, `OUT/_data/module-map.json`, 정책 요약을 가져올 `OUT/_data/facts/*.json`, 링크할 `OUT/_data/lifecycles/*.json`뿐이다. **소스코드를 다시 읽지 않는다.**

## 규칙
- 1~4절은 비개발자가 읽는다. 단계의 `action`과 정책 요약을 쓰고, 코드 식별자는 쓰지 않는다.
- 5절은 개발자가 읽는다. `call`과 근거 `` `파일:줄` ``을 쓴다.
- confidence가 low인 단계는 본문에 `●○○ 확인 필요` 표시를 달고 6절에도 모은다.

## 문서 구조 (`OUT/flows/<id>/flow.md`)
```
# <title> 흐름
> 자동 생성 문서입니다. 시작점: <trigger.label> · 생성일: <YYYY-MM-DD>
## 1. 한 줄 요약        (outcome)
## 2. 업무 흐름          (![업무 흐름](diagrams/swimlane.html) + 번호 목록: 단계 action — 관련 정책 번호)
## 3. 실패하는 경우      (표: 조건 | 결과 | 관련 정책. branch가 있는 단계. 없으면 "해당 없음")
## 4. 데이터 변화        (표: 단계 | 읽는 데이터 | 바뀌는 데이터. 데이터 이름은 lifecycles의 title로 쓰고 ../../data/<엔티티 id>/data.md 링크)
## 5. 처리 흐름 (개발자용) (![처리 흐름](diagrams/sequence.html) + 표: 단계 | 주체 → 주체 | 호출 | 근거 | 신뢰도)
## 6. 확인 필요          (low 단계 목록, "담당 개발자 확인 필요")
```

## 다이어그램 (`OUT/flows/<id>/diagrams/`)
Skill 도구로 `diagram-design:diagram-design`을 호출한다. 지시에 반드시 포함: "스타일 가이드 게이트: 사용자는 기본 스타일(옵션 e)을 명시적으로 선택했다. 질문하지 말고 진행하라."
1. `swimlane.html`: swimlane 유형. 레인은 사용자(client), 시스템(component 전부를 하나로), 데이터 저장소(db), 외부 시스템(external), 배치(batch) 중 등장하는 것만. 칸에는 action을 짧게 쓰고 정책 번호를 붙인다. 실패 분기는 점선 화살표로 결과를 보여준다.
2. `sequence.html`: sequence 유형. 참여자는 actors, 화살표 라벨은 `call` (`파일:줄`). 실패 분기는 alt 블록으로 그린다.

실패하면 그 자리에 같은 내용을 표로 쓰고 `> 다이어그램 생성 실패: 표로 대체` 한 줄을 남긴다.
