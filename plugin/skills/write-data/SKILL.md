---
name: write-data
description: Groundwork 3단계. 데이터 생애 JSON 하나로 엔티티 하나가 언제 생기고 무엇이 바꾸고 어떤 상태로 끝나는지 보여주는 data.md와 생애 다이어그램을 만든다. report 스킬이 호출한다.
---

# 데이터 생애 문서 작성

입력: `OUT`, 엔티티 id. 읽을 것은 `OUT/_data/lifecycles/<id>.json`, 거기에 나온 factId를 찾을 `OUT/_data/facts/*.json`, 링크할 `OUT/_data/flows/*.json`뿐이다. **소스코드를 다시 읽지 않는다.**

## 규칙
- 독자는 비개발자와 개발자 모두다. 업무 이름(title)을 제목에 쓰고, 테이블 이름과 근거는 표에 둔다.
- 정책 번호는 facts의 id를 그대로 쓴다.
- 같은 엔티티를 여러 모듈이 정의했으면 `entityFacts`에 모두 나온다. 주요 필드 표는 그 항목들을 합쳐 만들고, 소속 모듈은 `module`(대표)을 쓰되 `modules`가 둘 이상이면 "함께 정의한 모듈"로 나머지를 적는다.

## 문서 구조 (`OUT/data/<id>/data.md`)
```
# <title> 데이터 생애
> 자동 생성 문서입니다. 테이블: <table> · 소속 모듈: <module> · 생성일: <YYYY-MM-DD>
## 1. 개요             (entity 항목 summary + 주요 필드 표: 필드 | 의미 | 제약)
## 2. 상태와 전이        (![데이터 생애](diagrams/lifecycle.html) + 표: 상태 → 상태 | 일으키는 것(API·배치) | 관련 정책)
## 3. 누가 만들고 바꾸나   (표: 동작 | 시작점 | 관련 정책 | 흐름 문서. writers와 transitions. 흐름 문서는 ../../flows/<흐름 id>/flow.md)
## 4. 누가 읽나          (표: 시작점 | 설명 | 관련 정책. readers. 없으면 "해당 없음")
## 5. 확인 필요          (관련 facts 중 low 항목)
```

## 다이어그램 (`OUT/data/<id>/diagrams/lifecycle.html`)
Skill 도구로 `diagram-design:diagram-design`을 호출한다. 지시에 반드시 포함: "스타일 가이드 게이트: 사용자는 기본 스타일(옵션 e)을 명시적으로 선택했다. 질문하지 말고 진행하라."
- transitions가 있으면 state machine 유형. 시작 상태는 이 데이터를 만드는 writer에서 들어오고, 전이 화살표에 trigger(API·배치)를 업무 언어로 붙인다.
- transitions가 없으면 flowchart 유형. 생성 → 변경 → 삭제 순서로 writers를 놓는다.

실패하면 표로 대체하고 `> 다이어그램 생성 실패: 표로 대체`를 남긴다.
