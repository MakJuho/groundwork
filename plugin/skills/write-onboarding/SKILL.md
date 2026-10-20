---
name: write-onboarding
description: Groundwork 3단계. module-map과 모든 facts로 신규 투입 개발자용 온보딩 가이드 onboarding.md를 만든다. report 스킬이 호출한다.
---

# 온보딩 가이드 작성

입력: `OUT`. 읽을 것은 `OUT/_data/inventory.json`, `OUT/_data/module-map.json`, `OUT/_data/facts/*.json`이다. 실행 방법을 확인하려면 inventory.manifests에 있는 빌드 파일만 TARGET(=module-map의 project.root)에서 Read해도 된다.

## 문서 구조 (`OUT/overview/onboarding.md`)
```
# <프로젝트 이름> 온보딩 가이드
> 자동 생성 문서입니다. 생성일: <YYYY-MM-DD>
## 1. 한 장 요약          (서비스 설명, 기술 스택, 모듈 수, 파일 수)
## 2. 전체 구조            (![아키텍처](architecture.html) 와 ![모듈 의존 관계](dependency.html) — 같은 overview 폴더에 있다)
## 3. 모듈 안내            (표: 모듈 | 하는 일 | 소스 경로 | 정책서 | 명세서) 정책서/명세서 칸은 분석된 모듈만 ../policy/<id>/policy.md 링크
## 4. 처음 읽을 파일 10개   (번호 목록: `경로` — 왜 읽어야 하는지. entryPoints, 정책 근거가 많이 모인 파일 우선)
## 5. 실행 방법            (아래 "실행 방법 규칙"을 따른다)
## 6. 핵심 정책 미리보기     (high 신뢰도 정책 중 업무 영향이 큰 5개: 정책 번호 — 요약)
## 7. 주요 흐름과 데이터     (표: 흐름 | 시작점 | 결과 → ../flows/<id>/flow.md 링크. 그 아래 표: 데이터 | 만드는 곳 | 바꾸는 곳 → ../data/<id>/data.md 링크. 없으면 "해당 없음")
```
읽을 것에 `OUT/_data/flows/*.json`, `OUT/_data/lifecycles/*.json`, `OUT/_data/run-commands.json`을 더한다.

## 실행 방법 규칙
- 명령은 `OUT/_data/run-commands.json`에 있는 것만 ```bash 블록에 쓴다. 각 명령 뒤에 `# <하는 일> (<evidence.file>:<evidence.line>)`를 붙인다. `cwd`가 `.`이 아니면 그 앞에 `cd <cwd>`를 쓴다.
- 도구를 보고 "보통 이렇게 실행한다"고 아는 명령(예: `npx prisma migrate deploy`, `npx prisma db seed`, `npm run dev`)은 목록에 없으면 블록에 넣지 않는다. 필요해 보이면 블록 아래 `> **확인 필요**` 목록에 "프로젝트 파일에서 확인되지 않은 명령"으로 적는다.
- 목록이 비어 있으면 "빌드 파일에서 실행 명령을 찾지 못했습니다. 담당자에게 확인하세요"와 inventory.manifests 경로를 쓴다.
- 환경 변수는 facts나 빌드 파일에 근거가 있는 것만 이름을 적는다.
- report 스킬이 작성 후 `run-commands.mjs --check`로 다시 검사한다. 목록에 없는 명령은 자동으로 "확인 필요"로 옮겨진다.
