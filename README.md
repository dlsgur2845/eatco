# Eatco - 가족 식재료 관리 웹앱

가족 단위로 냉장고 식재료를 등록하고, 유통기한을 추적하며, 만료 알림을 받을 수 있는 웹 애플리케이션입니다.

## 주요 기능

### 식재료 관리
- 식재료 등록 (이름, 보관 방법, 수량, 유통기한, 카테고리)
- 보관 방법별 필터링 (냉장 / 냉동 / 실온)
- 검색 기능
- 다중 선택 후 일괄 삭제
- **보관기한 자동 추천** — USDA FoodKeeper 기반 221종 식재료 DB (생선 30종+, 육류 25종+, 유제품 35종+, 채소/과일 100종+ 등)
- **실시간 자동완성 검색** — 한국어 + 영어 동시 검색 지원 (예: "salmon" → 연어, "고등" → 고등어)

### 유통기한 알림
- D-Day 기반 시각적 표시 (위험 / 주의 / 안전 색상 구분)
- 알림 주기 설정 (당일, 1일 전, 3일 전, 5일 전, 7일 전, 14일 전, 21일 전, 30일 전)
- 알림 목록 화면 (읽음 / 안읽음 구분, 클릭 시 해당 화면으로 이동)
- TopAppBar에 안 읽은 알림 수 뱃지 표시 (30초 간격 자동 갱신)
- 앱 시작 시 자동으로 만료 임박 식재료 확인 및 알림 생성

### 가족 관리
- 회원가입 시 1인 가족 자동 생성
- 초대 코드를 통한 가족 참여 (참여 후 코드 자동 갱신 — 1회용)
- 가족 구성원 목록 확인
- 공동 편집 허용 토글
- 가족 탈퇴 (2인 이상일 때만 가능, 탈퇴 시 새 1인 가족 자동 생성)
- 식재료 데이터는 가족 단위로 공유

### 보안
- bcrypt + salt 비밀번호 해싱
- httpOnly + Secure 쿠키 기반 JWT 인증
- 단일 세션 강제 (다른 기기에서 로그인 시 이전 세션 자동 만료 + 알림 메시지)
- 컨테이너 내부 non-root 유저 실행
- 브릿지 네트워크로 컨테이너 간 통신 격리
- HTTPS (자체 서명 인증서)

### 대시보드
- 유통기한 임박 알림 배너
- 식재료 현황 요약 카드 (3일 이내 / 7일 이내 / 안전)
- 최근 등록된 식재료 목록

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 8, React Router 7, Axios |
| Backend | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, PyJWT, bcrypt |
| Database | PostgreSQL 18 |
| Infra | Docker Compose, Nginx (HTTPS reverse proxy), Bridge network |

---

## 프로젝트 구조

```
eatco/
├── docker-compose.yml          # 3-컨테이너 오케스트레이션
├── .env                        # DB 환경 변수
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI 앱 엔트리포인트
│       ├── config.py           # 설정 (환경 변수)
│       ├── database.py         # 비동기 DB 세션
│       ├── seed.py             # 초기 데이터 시드
│       ├── storage_data.py     # 221종 보관기한 DB (USDA FoodKeeper 기반)
│       ├── models/             # SQLAlchemy 모델
│       │   ├── user.py         #   User, Family
│       │   ├── ingredient.py   #   Ingredient (Base 포함)
│       │   ├── category.py     #   Category
│       │   ├── notification.py #   NotificationSetting
│       │   ├── notification_log.py  # NotificationLog
│       │   └── storage_guide.py     # StorageGuide (keywords 기반 검색)
│       ├── routers/            # API 엔드포인트
│       │   ├── auth.py         #   인증 (회원가입/로그인/가족)
│       │   ├── ingredients.py  #   식재료 CRUD
│       │   ├── dashboard.py    #   대시보드 요약
│       │   ├── categories.py   #   카테고리 목록
│       │   ├── notifications.py     # 알림 주기 설정
│       │   ├── notification_logs.py # 알림 로그 CRUD
│       │   └── storage_guide.py     # 보관기한 조회 + 실시간 자동완성
│       ├── schemas/            # Pydantic 스키마
│       └── services/           # 비즈니스 로직
│           └── expiry_checker.py    # 유통기한 알림 생성
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── nginx/
│   │   └── default.conf        # Nginx HTTPS + reverse proxy
│   └── src/
│       ├── App.tsx             # 라우팅
│       ├── api/client.ts       # Axios 인스턴스 (인터셉터)
│       ├── components/layout/  # TopAppBar, BottomNav, Layout
│       └── pages/
│           ├── LoginPage.tsx
│           ├── RegisterAccountPage.tsx
│           ├── DashboardPage.tsx
│           ├── InventoryPage.tsx    # 식재료 목록 + 등록 + 자동완성
│           ├── NotificationsPage.tsx
│           ├── FamilyPage.tsx
│           └── SettingsPage.tsx
│
└── tests/                      # pytest (35개 테스트)
```

---

## 시작하기

### 사전 요구사항

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치 필요
- Git

### 1. 프로젝트 클론

```bash
git clone <repository-url>
cd eatco
```

### 2. 환경 변수 확인

`.env` 파일이 프로젝트 루트에 있어야 합니다. 기본값:

```env
POSTGRES_DB=eatco
POSTGRES_USER=eatco
POSTGRES_PASSWORD=eatco_dev_password
```

> **프로덕션 배포 시** 반드시 `POSTGRES_PASSWORD`를 변경하세요.

### 3. Docker Compose로 실행

```bash
docker compose up -d --build
```

3개의 컨테이너가 실행됩니다:

| 컨테이너 | 역할 | 포트 |
|---|---|---|
| `eatco-postgres` | PostgreSQL DB | 내부 5432 |
| `eatco-backend` | FastAPI API 서버 | 내부 8000 |
| `eatco-frontend` | Nginx (HTTPS + SPA) | **8443** (HTTPS), 8080 (HTTP → 리다이렉트) |

### 4. 접속

브라우저에서 아래 주소로 접속합니다:

```
https://localhost:8443
```

> 자체 서명 인증서를 사용하므로 브라우저에서 보안 경고가 나타납니다.
> Chrome: "고급" → "localhost(안전하지 않음)으로 이동" 클릭

### 5. 테스트 실행

```bash
docker exec eatco-backend python -m pytest tests/ -v
```

### 6. 종료

```bash
docker compose down
```

DB 데이터까지 삭제하려면:

```bash
docker compose down
docker volume rm eatco_postgres_data
```

---

## 보관기한 데이터 출처

식재료 보관 기간 추천 데이터는 다음 소스를 기반으로 구축되었습니다:

- **USDA FoodKeeper** (미국 농무부 식품안전검사국) — 650+ 식품 항목의 냉장/냉동/실온 보관 기간
- **한국 식재료 확장** — 김치, 된장, 고추장 등 한국 전통 식품 + 한국식 생선/채소명 매핑

총 **221종** 식재료에 대해 보관 방법별 권장 보관일수를 제공합니다. 검색 시 한국어와 영어 키워드를 동시에 지원합니다.

---

## 사용법

### 회원가입 및 로그인

1. `https://localhost:8443` 접속 → 로그인 화면 표시
2. **"회원가입"** 클릭 → 이름, 이메일, 비밀번호 입력 → 계정 생성
3. 회원가입 완료 시 자동으로 **1인 가족**이 생성되며 대시보드로 이동
4. 이후 이메일/비밀번호로 로그인 (엔터키로도 로그인 가능)

> 하나의 계정은 한 기기에서만 로그인 가능합니다. 다른 기기에서 로그인하면 이전 세션이 만료됩니다.

### 식재료 등록

1. 하단 네비게이션바에서 **"식재료"** 탭 선택
2. 우측 상단 **"+ 등록"** 버튼 클릭 (모바일에서는 우측 하단 FAB 버튼)
3. 등록 모달에서 정보 입력:
   - **상품명**: 입력 시 실시간 자동완성 + 보관기한 정보 자동 표시
   - **보관 방법**: 냉장 / 냉동 / 실온 중 선택
   - **카테고리**: 유제품, 채소/과일, 육류/수산, 가공식품 등
   - **수량**: +/- 버튼으로 조절
   - **유통기한**: 날짜 선택
4. **"등록하기"** 클릭 → 목록에 즉시 반영

### 식재료 관리

- **검색**: 상단 검색바에서 식재료명으로 검색
- **필터**: 전체 / 냉장 / 냉동 / 실온 칩으로 필터링
- **삭제**: "선택" 버튼 → 삭제할 항목 선택 → "삭제" 버튼
- **D-Day 표시**: 각 식재료 카드에 만료까지 남은 일수를 색상으로 구분
  - 빨강: D-DAY ~ D-3 (위험)
  - 주황: D-4 ~ D-7 (주의)
  - 초록: D-8 이상 (안전)

### 대시보드

- 상단에 유통기한 임박 알림 배너
- 식재료 현황 요약 (3일 이내 / 7일 이내 / 안전 개수)
- 최근 등록된 식재료 목록

### 알림

- **상단 종 아이콘** 또는 **하단 네비바 "알림" 탭** 클릭
- 유통기한 만료 알림이 자동으로 생성됨
- 안 읽은 알림은 파란 점으로 표시
- 알림 클릭 시 읽음 처리 + 해당 화면으로 이동
- **"모두 읽음"** 버튼으로 일괄 처리 가능

### 알림 주기 설정

1. 하단 네비바에서 **"설정"** 탭 선택
2. **유통기한 알림 주기** 섹션에서 원하는 주기를 체크/해제:
   - 당일 알림, 1일 전, 3일 전, 5일 전, 7일 전, 14일 전, 21일 전, 한 달 전
3. 체크된 주기에 해당하는 식재료가 있으면 알림이 자동 생성됨

### 가족 관리

#### 초대 코드로 가족 초대
1. **"가족 관리"** 탭 → 우측 패널에 **초대 코드** 표시
2. 코드를 복사하여 가족에게 전달
3. 가족 구성원이 회원가입 후 → **"다른 가족에 참여하기"** → 초대 코드 입력 → **"참여하기"**
4. 참여 즉시 화면에 반영되며, 초대 코드는 자동으로 갱신됨 (보안)

#### 가족 탈퇴
1. **"가족 관리"** 탭 → 구성원 목록 아래 **"가족에서 탈퇴하기"** 버튼 (2인 이상일 때만 표시)
2. 확인 대화상자에서 승인 → 새 1인 가족이 자동 생성됨

#### 공동 편집
- 우측 패널 **"공유 및 권한 설정"** → **"공동 편집 허용"** 토글
- 활성화 시 모든 구성원이 식재료를 추가/삭제 가능

---

## API 엔드포인트

### 인증
| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 유저 정보 |

### 가족
| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/auth/family` | 가족 생성 |
| POST | `/api/auth/family/join` | 초대 코드로 가족 참여 |
| POST | `/api/auth/family/leave` | 가족 탈퇴 |
| GET | `/api/auth/family/{id}` | 가족 정보 조회 |
| PUT | `/api/auth/family/settings` | 가족 설정 변경 |

### 식재료
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/ingredients` | 목록 조회 (필터/검색) |
| POST | `/api/ingredients` | 등록 |
| GET | `/api/ingredients/{id}` | 상세 조회 |
| PUT | `/api/ingredients/{id}` | 수정 |
| DELETE | `/api/ingredients/{id}` | 삭제 |
| POST | `/api/ingredients/batch-delete` | 일괄 삭제 |

### 대시보드
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/dashboard/summary` | 현황 요약 |
| GET | `/api/dashboard/recent` | 최근 등록 |
| GET | `/api/dashboard/expiring` | 만료 임박 |

### 알림
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/notifications/settings` | 알림 주기 설정 조회 |
| PUT | `/api/notifications/settings/{id}` | 알림 주기 변경 |
| GET | `/api/notification-logs` | 알림 로그 목록 |
| GET | `/api/notification-logs/unread-count` | 안 읽은 수 |
| PUT | `/api/notification-logs/{id}/read` | 읽음 처리 |
| PUT | `/api/notification-logs/read-all` | 모두 읽음 |
| POST | `/api/notification-logs/check-expiry` | 수동 만료 체크 |

### 보관기한 가이드
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/storage-guide/lookup?name=` | 보관기한 조회 (키워드 매칭) |
| GET | `/api/storage-guide/suggest?q=` | 실시간 자동완성 검색 (최대 15건) |

### 기타
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/health` | 헬스 체크 |

---

## 라이선스

Private Project
