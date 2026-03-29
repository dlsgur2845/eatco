# API 엔드포인트

## 인증
| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 유저 정보 |

## 가족
| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/auth/family` | 가족 생성 |
| POST | `/api/auth/family/join` | 초대 코드로 가족 참여 |
| POST | `/api/auth/family/leave` | 가족 탈퇴 |
| GET | `/api/auth/family/{id}` | 가족 정보 조회 |
| PUT | `/api/auth/family/settings` | 가족 설정 변경 |

## 식재료
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/ingredients` | 목록 조회 (필터/검색) |
| POST | `/api/ingredients` | 등록 |
| GET | `/api/ingredients/{id}` | 상세 조회 |
| PUT | `/api/ingredients/{id}` | 수정 |
| DELETE | `/api/ingredients/{id}` | 삭제 |
| POST | `/api/ingredients/batch-delete` | 일괄 삭제 |

## 영수증 스캔
| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/scan/analyze` | 영수증 이미지 → 식재료 추출 (Gemini) |
| POST | `/api/scan/register` | 분석된 식재료 등록 |
| GET | `/api/scan/items` | 가정 식재료 목록 |
| PATCH | `/api/scan/items/{id}` | 식재료 수정 |
| DELETE | `/api/scan/items/{id}` | 식재료 삭제 |

## 레시피 추천
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/recipes/recommend` | AI 레시피 추천 (Gemini + 식품안전나라 fallback) |

## 가계부
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/expenses/monthly` | 월별 지출 요약 |
| GET | `/api/expenses/suggest-items` | 식재료 이름 자동완성 (구매 이력 기반) |
| GET | `/api/expenses/by-item` | 식재료별 가격 이력 |
| GET | `/api/expenses/by-category` | 보관방법별 지출 비율 |
| GET | `/api/expenses/alerts` | 인플레이션 알림 |
| GET | `/api/expenses/compare` | 매장별 가격 비교 |
| GET | `/api/expenses/budget` | 예산 조회 |
| POST | `/api/expenses/budget` | 예산 설정 |

## 알림
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/notifications/settings` | 알림 주기 설정 조회 |
| PUT | `/api/notifications/settings/{id}` | 알림 주기 변경 |
| GET | `/api/notification-logs` | 알림 로그 목록 |
| GET | `/api/notification-logs/unread-count` | 안 읽은 수 |
| PUT | `/api/notification-logs/{id}/read` | 읽음 처리 |
| PUT | `/api/notification-logs/read-all` | 모두 읽음 |

## 보관기한 가이드
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/storage-guide/lookup?name=` | 보관기한 조회 |
| GET | `/api/storage-guide/suggest?q=` | 실시간 자동완성 검색 |

## 기타
| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/health` | 헬스 체크 |
