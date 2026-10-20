# Java / Spring 분석 힌트

## 먼저 볼 것
- `@Service`, `@Component` 클래스의 `static final` 상수와 public 메서드의 if/throw
- `@Entity` 클래스: 테이블(`@Table`), 컬럼 제약(`@Column(nullable, unique, length)`), `@Enumerated`
- enum: 값마다 붙은 생성자 인자(등급 기준 금액 등), 상태 전이 메서드(`canChangeTo` 류)
- DTO/record의 Bean Validation: `@NotNull @NotBlank @Size @Min @Max @Positive @Email @Pattern`
- 권한: `@PreAuthorize`, `@Secured`, `hasRole`, SecurityConfig의 `requestMatchers`
- 스케줄: `@Scheduled(cron|fixedDelay)` 메서드 → 시간 기반 규칙, cron 식은 사람이 읽는 말로 풀어 쓴다
- 트랜잭션: `@Transactional(noRollbackFor=...)`처럼 예외적인 설정만 규칙으로 기록
- Repository `@Query`: where 조건에 담긴 업무 정의(예: "진행 중 = PENDING, CONFIRMED")
- 설정: `application.yml|properties`의 업무 값(한도, 기간)

## API 추출
- `@RestController` + `@RequestMapping` 접두어 + `@GetMapping/@PostMapping...` 경로를 합친다.
- 요청 본문은 `@RequestBody` 타입, 인증 사용자는 `@AuthenticationPrincipal`.

## 숫자 표기
- `300_000` 같은 밑줄 표기는 300,000으로 쓴다.

## 모듈 경계 신호 (scan 단계에서 읽는다)
- Maven `<modules>`, Gradle `settings.gradle`의 `include`: 서브모듈이 업무 단위면 그대로 모듈로 쓴다.
- 계층형 패키지(`controller/service/repository/entity`)이면 클래스 이름 접두어로 묶는다: `OrderController`, `OrderService(Impl)`, `OrderRepository`, `OrderMapper`, `Order`.
- URL 접두어: Grep `@RequestMapping\(` 결과의 첫 경로 조각(`/api/orders` → orders).
- MyBatis: `resources/mapper/**/*Mapper.xml`의 파일 이름 접두어도 같은 모듈에 넣는다.
