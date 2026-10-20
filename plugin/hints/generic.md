# 공통 분석 힌트 (모든 스택)

## 비즈니스 규칙이 숨어 있는 곳 (우선순위 순)
1. 이름에 policy, rule, constant, config, limit, status, state, grade, fee, rate, price 가 들어간 파일
2. 서비스/도메인 계층 함수 안의 조건문과 throw/raise (오류 코드 문자열은 규칙의 이름표다)
3. enum과 상태값 정의, 상태 전이 표 또는 switch
4. 입력 검증 (DTO 어노테이션, 스키마, validator)
5. 권한 검사 (role, admin, owner, permission, authorize)
6. 스케줄러/배치 (cron, 주기 작업): 시간 기반 자동 처리 규칙
7. 외부 호출 (HTTP 클라이언트, URL, 재시도/타임아웃)

## kind 분류 기준
- constant: 이름 붙은 숫자/기간/금액/비율
- validation: 입력·상태를 검사해 거부하는 조건
- calculation: 금액·수량·날짜를 계산하는 식
- state / state-transition: 상태 목록 / 허용되는 상태 변경
- permission: 누가 할 수 있는지
- error: 특정 오류 코드·메시지를 내는 상황 (validation과 겹치면 validation 하나로)
- integration: 외부 시스템 호출, 재시도
- api: 외부에 노출된 엔드포인트
- entity: 저장되는 데이터 구조

## 하나의 규칙 = 하나의 항목
- 상수 정의와 그 상수를 쓰는 조건문이 같은 규칙이면 항목 하나로 만들고 evidence에 두 위치를 모두 넣는다.
- 한 조건문에 규칙이 둘이면(예: 최소·최대) 항목을 둘로 나눈다.

## 하지 말 것
- 프레임워크 기본 동작, 로깅, 단순 getter/setter를 규칙으로 만들지 않는다.
- 테스트 코드의 값을 운영 규칙으로 쓰지 않는다.

## 모듈 경계 신호 (scan 단계에서 읽는다)
- 업무 이름 접두어: 파일·클래스 이름에서 계층 접미어(Controller, Service, ServiceImpl, Repository, Dao, Mapper, Entity, Dto, Request, Response, Vo, Handler, Router, View, Serializer)를 떼고 남는 이름이 업무 이름이다.
- 접두어가 다른 업무 이름의 앞부분이면(예: Book과 Booking) glob 대신 파일 경로를 직접 나열한다.
- 엔티티·테이블 이름은 업무 이름의 강한 신호다. 엔티티 하나가 여러 업무에 쓰이면 그 엔티티를 주로 생성·변경하는 쪽에 둔다.
- 설정, 공통 예외, 유틸, 보안 설정, 애플리케이션 시작 파일은 `common`에 둔다.
