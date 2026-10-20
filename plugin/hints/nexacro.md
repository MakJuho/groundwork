# Nexacro(넥사크로) + Spring 분석 힌트

## 파일 위치
- 화면: `*.xfdl` (XML 안에 Dataset 정의와 `<Script>`가 함께 있다). 공통 스크립트: `*.xjs`. 프로젝트: `*.xprj`.
- 화면 안에서 `include "lib::common.xjs";`처럼 공통 파일을 가져온다. `lib::`는 `.xprj`의 `Service prefixid="lib"` 경로다.

## 버튼에서 핸들러까지
- 버튼은 `<Button id="btn_save" text="저장" onclick="btn_save_onclick" .../>`처럼 이벤트 속성에 핸들러 이름을 적는다.
- 핸들러는 같은 화면 `<Script>`의 `this.btn_save_onclick = function(obj, e) { ... }`이다. 이 함수의 줄부터 따라간다.
- 화면 검사(`fn_validate` 같은 함수)에서 `return false`나 `gfn_alert`로 끝나는 길이 있으면 분기 단계로 만든다.

## 서버 호출
- 보통 화면은 URL을 직접 쓰지 않고 `gfn_*` 공통 함수를 부른다. 예: `this.gfn_callApi("member.save", "ds_in=ds_member:U", "ds_result=ds_result", "fn_callback")`. 인자 순서는 공통 함수 정의를 읽어서 확인한다.
- 공통 함수 안에서 `this.transaction(svcId, url, inDs, outDs, args, callback)`을 부른다. 인자 순서: 서비스 ID, URL, 보내는 Dataset, 받는 Dataset, 추가 인자, 콜백 함수 이름.
- Dataset 표기: 보내는 쪽은 `"서버이름=화면Dataset"`, 받는 쪽은 `"화면Dataset=서버이름"`. 뒤에 `:U`가 붙으면 바뀐 행(입력·수정·삭제)만 보낸다.
- URL 매핑 찾기: 서비스 키(`member.save`)를 `*.xjs`의 매핑 객체(예: `gv_apiUrl`, `apiUrl.xjs`)에서 Grep해 서버 경로를 얻는다. 그 줄을 공통 단계의 근거로 남긴다.
- URL 앞의 `svc::` 접두어는 `.xprj`의 `<Service prefixid="svc" ... url="http://서버/컨텍스트"/>`에 해당한다. 최종 경로는 이 주소 + 매핑된 경로다.
- 서버 경로를 Controller에서 찾을 때는 `@RequestMapping`/`@PostMapping` 경로와 `.do` 확장자 유무를 맞춰 본다.

## 서버 쪽 (uiadapter)
- Controller는 `@ParamDataSet`으로 Dataset을 DTO 목록으로 받고, `NexacroResult`에 `addDataSet("ds_result", ...)`/`addVariable`로 응답을 담는다.
- 행 상태는 `DataSetRowTypeAccessor`나 `DataSet.ROW_TYPE_INSERTED/UPDATED/DELETED`로 구분한다. 행 상태별로 다른 SQL을 부르는지 확인한다.
- 행 상태 상수는 화면과 서버가 다르다. 화면(xfdl, 클라이언트)은 `Dataset.ROWTYPE_INSERT/UPDATE/DELETE`, 서버(Java, xapi)는 `DataSet.ROW_TYPE_INSERTED/UPDATED/DELETED`다. `:U`로 보내면 바뀐 행만 행 상태와 함께 서버로 가고, 서버에서 그 상태로 입력·수정·삭제를 가른다.
- Mapper 인터페이스 메서드는 이름이 같은 `Mapper.xml`의 `<insert|update|delete|select id="...">`로 이어진다. 그 SQL 줄(`INSERT INTO ...`)이 DB 단계의 근거다.
- `map-underscore-to-camel-case`가 켜져 있으면 컬럼 `MEMBER_NM`은 DTO 필드 `memberNm`이다(`application.yml`/`.properties` 확인).

## 응답과 콜백
- 서버는 보통 `ErrorCode`/`ErrorMsg`를 담아 응답한다. `ErrorCode < 0`이면 오류다.
- 화면 콜백은 `this.fn_callback = function(svcId, errorCode, errorMsg)`처럼 받는다. `errorCode < 0` 분기에서 오류 메시지를 보여주고, 아니면 성공 처리(메시지, 재조회)를 한다. 두 길을 모두 단계로 남긴다.
- 서버 예외는 `@ControllerAdvice`(예: `GlobalExceptionHandler`)가 `ErrorCode`로 바꿔 응답하는 경우가 많다. 예외 처리기를 찾아 반환값을 확인한다.

## 업무 규칙이 있는 곳
- 화면의 입력 검사(`fn_validate` 등)와 콜백 분기.
- 서비스의 중복·상태 검사와 예외(`BizException` 류).
- Mapper XML의 where 조건과 제약, 스키마 SQL의 제약.
