# Node.js / TypeScript 분석 힌트

## 먼저 볼 것
- `*-policy.*`, `constants.*`, `config/*`의 `export const` 숫자/배열
- `*-service.*`, `*.service.ts`, `domain/`의 함수 안 if/throw (커스텀 Error의 code 문자열)
- `Object.freeze({...})` 또는 TS `enum`으로 정의된 상태, 전이 표(`ALLOWED_TRANSITIONS` 류)
- 라우터: Express `Router().get/post`, NestJS `@Controller` + `@Get/@Post`, Fastify `route`
- 검증: zod/joi/yup 스키마, class-validator 데코레이터(`@IsInt @Min @Max @Length`)
- 권한: 미들웨어(`requireRole`, `isAdmin`), `req.user.role` 비교, NestJS Guard
- 외부 연동: `fetch`, `axios`, SDK 클라이언트 파일, 재시도 루프
- 스케줄: `node-cron`, `setInterval`, BullMQ/agenda 작업

## API 추출
- `app.use('/api/x', router)`의 접두어와 라우터 경로를 합친다.

## 모듈 경계 신호 (scan 단계에서 읽는다)
- 워크스페이스: `package.json`의 `workspaces`, `packages/*`, `apps/*`가 업무 단위면 그대로 모듈로 쓴다.
- NestJS: `*.module.ts` 하나가 대개 모듈 하나다.
- 계층형 폴더(`controllers/`, `services/`, `routes/`, `models/`)이면 파일 이름 접두어(`order.controller.ts`, `orderService.js`)로 묶는다.
- URL 접두어: `app.use('/api/orders', ...)`의 첫 경로 조각.
