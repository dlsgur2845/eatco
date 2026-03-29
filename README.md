# Eatco - 가족 식재료 관리 웹앱

가족 단위로 냉장고 식재료를 등록하고, 유통기한을 추적하며, AI 기반 레시피 추천과 가격 추이를 확인할 수 있는 웹 애플리케이션입니다.

## 주요 기능

- **영수증 스캔** — Gemini Flash로 영수증 촬영 한 번에 식재료/가격/매장명 자동 인식
- **AI 레시피 추천** — 냉장고 재료 기반 맞춤 레시피 생성 (Gemini + 식품안전나라 fallback)
- **가계부** — 월별 지출 차트, 식재료별 가격 추이, 매장 비교, 인플레이션 알림
- **유통기한 관리** — D-Day 표시, 알림 주기 설정, 부분 사용/삭제
- **가족 공유** — 초대 코드로 가족 참여, 공동 편집, 데이터 공유
- **보관기한 자동 추천** — USDA FoodKeeper 기반 221종 식재료 DB

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 8, Recharts |
| Backend | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| AI/OCR | Google Gemini 2.5 Flash |
| Database | PostgreSQL 18 |
| Infra | Docker Compose, Nginx |

## 빠른 시작

```bash
git clone <repository-url>
cd eatco
cp .env.example .env
# .env에 GEMINI_API_KEY 입력 (https://aistudio.google.com/apikey)
docker compose up -d --build
```

접속: `https://localhost:8443` (또는 `http://localhost:8080`)

> 상세 설치 가이드: [docs/SETUP.md](docs/SETUP.md)

## 문서

| 문서 | 설명 |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | 설치 및 실행 가이드 |
| [docs/USAGE.md](docs/USAGE.md) | 사용법 (화면별 가이드) |
| [docs/API.md](docs/API.md) | API 엔드포인트 목록 |
| [DESIGN.md](DESIGN.md) | 디자인 시스템 (The Editorial Pantry) |

## 프로젝트 구조

```
eatco/
├── docker-compose.yml
├── .env
├── backend/
│   └── app/
│       ├── routers/        # auth, ingredients, scan, recipes, expenses, ...
│       ├── services/       # ocr_service, gemini_recipe, normalizer, ...
│       ├── models/         # User, Family, Ingredient, ...
│       └── schemas/
├── frontend/
│   └── src/
│       ├── pages/          # MvpDashboard, Scan, Inventory, Expenses, ...
│       ├── components/     # RecipeCard, ResultsModal, BottomNav, ...
│       └── api/
└── docs/
```

## 라이선스

[MIT License](LICENSE)
