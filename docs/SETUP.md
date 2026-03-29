# 설치 및 실행 가이드

## 사전 요구사항

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치 필요
- Git

## 1. 프로젝트 클론

```bash
git clone <repository-url>
cd eatco
```

## 2. 환경 변수 설정

`.env.example`을 복사해서 수정하세요:

```bash
cp .env.example .env
```

필수 설정:
```env
POSTGRES_DB=eatco
POSTGRES_USER=eatco
POSTGRES_PASSWORD=eatco_dev_password
SECRET_KEY=eatco-dev-only-change-in-production

# Gemini API 키 (영수증 스캔 + AI 레시피 추천)
# 발급: https://aistudio.google.com/apikey
GEMINI_API_KEY=your_key_here
OCR_PROVIDER=gemini
OCR_MOCK_MODE=false

# 식품안전나라 레시피 API (선택, fallback용)
# 발급: https://www.foodsafetykorea.go.kr/api/openApiInfo.do
RECIPE_API_KEY=
```

> **프로덕션 배포 시** 반드시 `POSTGRES_PASSWORD`와 `SECRET_KEY`를 변경하세요.

## 3. Docker Compose로 실행

```bash
docker compose up -d --build
```

3개의 컨테이너가 실행됩니다:

| 컨테이너 | 역할 | 포트 |
|---|---|---|
| `eatco-postgres` | PostgreSQL DB | 내부 5432 |
| `eatco-backend` | FastAPI API 서버 | 내부 8000 |
| `eatco-frontend` | Nginx (HTTPS + SPA) | **8443** (HTTPS), 8080 (HTTP) |

## 4. 접속

```
https://localhost:8443
```

> 자체 서명 인증서를 사용하므로 브라우저에서 보안 경고가 나타납니다.
> Chrome: "고급" → "localhost(안전하지 않음)으로 이동" 클릭

## 5. 테스트 실행

```bash
docker exec eatco-backend python -m pytest tests/ -v
```

## 6. 종료

```bash
docker compose down
```

DB 데이터까지 삭제하려면:

```bash
docker compose down
docker volume rm eatco_postgres_data
```
