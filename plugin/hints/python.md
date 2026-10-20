# Python 분석 힌트

## 먼저 볼 것
- 모듈 수준 대문자 상수, `settings.py`/`config.py`의 업무 값
- `services.py`, `domain/`, `usecases/` 함수의 if/raise (커스텀 예외 클래스명과 메시지)
- `Enum`/`TextChoices`/`IntegerChoices` 상태, 전이 함수
- Django: `models.py`(필드 제약 `max_length`, `unique`, `validators`), `views.py`/`viewsets`, `permissions.py`, `serializers.py`의 `validate_*`
- FastAPI: `@router.get/post` 경로, Pydantic 모델의 `Field(gt, ge, lt, le, max_length)`와 `@validator`
- 권한: `permission_classes`, `Depends(get_current_admin)` 류
- 스케줄: Celery beat, APScheduler, cron 설정

## API 추출
- Django `urls.py`의 `path()`와 view를, FastAPI는 `APIRouter(prefix=...)`와 데코레이터 경로를 합친다.

## 모듈 경계 신호 (scan 단계에서 읽는다)
- Django: `INSTALLED_APPS`의 프로젝트 앱(폴더에 `apps.py`가 있음) 하나가 대개 모듈 하나다.
- FastAPI: `APIRouter(prefix="/orders")` 하나가 대개 모듈 하나다.
- 계층형 폴더(`routers/`, `services/`, `models/`, `schemas/`)이면 파일 이름(`orders.py`, `order_service.py`)으로 묶는다.
