# Groundwork 실행 순서

레거시 소스 폴더를 분석해 구조 지도, 흐름 플레이어, 정책서·명세서 리포트를 만드는 순서를 정리한다.
예시는 레포에 들어 있는 `fixtures/nexacro-shop`(Nexacro + Spring)을 기준으로 한다.

| 단계 | 명령 | 결과물 | 소요(nexacro-shop 기준) |
|---|---|---|---|
| 0 | 플러그인을 불러와 `claude` 실행 | — | — |
| 1 | `/groundwork:scan` | 모듈 지도, 화면 지도, 아키텍처·의존성 다이어그램 | 약 7분 |
| 2 | `/groundwork:analyze` | 정책서·명세서·데이터 문서·온보딩 가이드, `index.html` | 약 10분 |
| 3 | `/groundwork:trace` | 버튼·API 흐름, `player.html` | 약 7~17분 |
| 4 | 결과 보기 | 브라우저에서 리포트·플레이어 | — |
| 5 | `/groundwork:update` (선택) | 바뀐 부분만 갱신, 변경 내역 | 변경량에 비례 |

---

## 0. 플러그인을 불러와 Claude 실행

레포 폴더에서 groundwork 플러그인과 다이어그램 플러그인(diagram-design)을 함께 불러온다.

```bash
claude --plugin-dir C:/20261019_groundwork/groundwork/plugin --plugin-dir C:/20261019_groundwork/groundwork/vendor/diagram-design
```

`/groundwork`를 입력했을 때 `scan`, `analyze`, `trace`, `update` 등이 목록에 뜨면 준비 완료.

> `understand-anything:groundwork`는 이름만 비슷한 다른 플러그인이다. 헷갈리지 않도록 주의.

---

## 1. scan — 구조 지도

```
/groundwork:scan C:/20261019_groundwork/groundwork/fixtures/nexacro-shop C:/gw-out
```

- 인자: `<분석할 폴더> [출력 상위 폴더] [--keep-map]`
- 결과는 `C:/gw-out/groundwork-output/nexacro-shop/`에 생긴다. 이 경로가 이후 모든 단계의 **출력 폴더(OUT)** 다.
- 출력 폴더는 분석할 폴더 **바깥**이어야 한다. 안쪽이면 거부된다.
- 끝나면 모듈 표가 나온다. 표의 **코드 이름**(`member`, `order`, `product`)을 2단계에서 쓴다.
- 모듈 나누기가 마음에 들지 않으면 `_data/module-map.json`을 고친 뒤 `--keep-map`을 붙여 다시 실행한다.

결과물

```
OUT/
├── _data/            module-map.json, module-files.json, screens.json(Nexacro)
└── overview/         architecture.html, dependency.html
```

---

## 2. analyze — 정책서·명세서·리포트

```
/groundwork:analyze C:/gw-out/groundwork-output/nexacro-shop member order product
```

- 인자: `<출력 폴더> <모듈 id ...> [--force]`
- 모듈마다 업무 규칙(facts)을 뽑고, 모든 근거가 실제 코드 줄과 맞는지 검증한 뒤 문서를 쓴다.
- 문서를 쓰기 전에 규칙 사이의 정책 충돌(화면·서버, 모듈 사이에서 값·조건이 어긋나는 곳)을 근거 코드와 함께 찾아 리포트 홈에 "정책 충돌 N건"으로 보여 준다. 충돌만 다시 찾으려면 `/groundwork:conflicts <출력 폴더>`.

결과물

```
OUT/
├── index.html        모든 문서를 묶은 리포트
├── overview/         onboarding.md (온보딩 가이드)
├── policy/<모듈>/    policy.md + 흐름·상태 다이어그램
├── spec/<모듈>/      spec.md + ER 다이어그램
├── data/<모듈>/      data.md + 데이터 생애주기 다이어그램
└── flows/<흐름>/     flow.md + 시퀀스·스윔레인 다이어그램
```

---

## 3. trace — 흐름 추적과 플레이어

```
/groundwork:trace C:/gw-out/groundwork-output/nexacro-shop "OrderMng.btn_cancel" "MemberMng.btn_save"
```

- 인자: `<출력 폴더> [시작점 ...] [--auto N] [--force]`
- 시작점 형식
  - 화면 버튼: `"OrderMng.btn_cancel"` (`화면id.버튼id`, scan 결과의 screens.json 기준)
  - API: `"POST /order/cancel.do"`
  - 배치·메서드: `"ReservationScheduler.expire"`
  - 자연어: `"주문 화면의 취소 버튼"`
- `--auto 3`처럼 주면 시작점을 알아서 고른다.
- 흐름마다 정상 경로와 실패 분기를 기록하고, 단계마다 근거 코드 줄을 붙인다.

결과물: `OUT/_data/flows/*.json`, `OUT/player.html`

> **주의: analyze 다음에 trace를 돌린다.**
> 현재 analyze가 `_data`를 다시 만들면서 scan의 화면 지도(screens.json)와 trace의 버튼 흐름을 지우는 문제가 있다.
> 순서가 뒤바뀌었다면 아래로 복구한다.
>
> ```bash
> node plugin/scripts/build-screens.mjs <출력 폴더>
> ```
>
> 그다음 trace를 다시 실행한다.

---

## 4. 결과 보기

파일을 더블클릭해 열면 플레이어 일부가 동작하지 않을 수 있으므로 로컬 서버로 연다.

```bash
python -m http.server 8765 --directory C:/gw-out/groundwork-output/nexacro-shop
```

- 리포트: <http://localhost:8765/index.html>
- 플레이어: <http://localhost:8765/player.html> (특정 버튼 바로 열기: `player.html#OrderMng.btn_cancel`)

근거 검증만 다시 돌려 보고 싶을 때:

```bash
node plugin/scripts/verify-citations.mjs fixtures/nexacro-shop C:/gw-out/groundwork-output/nexacro-shop
```

`failed=0`이면 모든 근거가 실제 코드와 일치한다.

### 개발자용: 필요한 규칙만 골라 보기

정책서를 처음부터 읽지 않고, 지금 손대는 코드에 걸린 규칙만 본다. analyze 뒤에 쓸 수 있다.

- **리포트의 "규칙 찾기"** (index.html 맨 위): 검색창에 아래 중 무엇이든 넣는다. 모듈·종류 칩으로 더 좁힐 수 있다.
  - 파일과 줄: `OrderService.java:33` (근거가 ±3줄 안에 있는 규칙, 가까운 순)
  - 화면 버튼: `OrderMng.btn_cancel`
  - API 경로: `/order/cancel.do`
  - 테이블·엔티티: `TB_ORDER`
  - 업무 용어: `주문접수 취소`
- 규칙 카드에는 요약, 근거 코드 줄, 정책서·명세서 위치, 이 규칙이 적용되는 흐름(플레이어 링크)이 나온다.
- 바로 열기 링크: `index.html#rule=ORD-004`, `index.html#find=OrderService.java:33`
- 플레이어 단계의 정책 칩(ORD-004 등)을 누르면 해당 규칙 카드가 열린다.

터미널·에이전트용 (마크다운 출력, `--json`도 가능):

```bash
node plugin/scripts/query-rules.mjs C:/gw-out/groundwork-output/nexacro-shop --file OrderService.java:33
```

필터: `--file 파일[:줄]`, `--screen 화면[.버튼]`, `--endpoint /경로`, `--entity 엔티티|테이블`, `--module`, `--kind`, `--id`, 나머지 단어는 본문 검색. 색인은 리포트를 만들 때 `_data/rule-index.json`으로도 저장된다.

> Git Bash에서는 `/order/cancel.do` 같은 인자가 Windows 경로로 바뀌므로 `MSYS_NO_PATHCONV=1`을 앞에 붙인다.

---

## 5. update — 코드가 바뀐 뒤 (선택)

```
/groundwork:update C:/gw-out/groundwork-output/nexacro-shop
```

- 인자: `<출력 폴더> [이전 커밋] [새 커밋] [--yes]`
- 마지막 분석 커밋 이후 바뀐 파일이 속한 모듈과 흐름만 다시 분석한다. 정책 번호는 유지된다.
- 변경 내역은 `OUT/changes/<날짜>-<커밋>.md`에 생긴다.
- 분석 대상 폴더가 **git 저장소**여야 한다.

---

## 자주 겪는 문제

| 증상 | 원인·해결 |
|---|---|
| `/groundwork:` 명령이 목록에 없음 | `--plugin-dir`로 `plugin`과 `vendor/diagram-design`을 둘 다 불러왔는지 확인 |
| node 실행 승인 창이 계속 뜸 | `Bash(node:*)` 권한을 허용 |
| 출력 폴더를 거부함 | 출력 폴더가 분석 대상 폴더 안에 있음. 바깥으로 옮긴다 |
| 플레이어에 화면·버튼이 없음 | analyze가 screens.json을 지운 경우. `build-screens.mjs` 실행 후 trace 재실행 |
| 리포트 "분석 리포트 열기"가 안 열림 | analyze를 아직 안 돌림 (index.html 없음) |
