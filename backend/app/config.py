from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://eatco:eatco_dev_password@localhost:5432/eatco"
    cors_origins: str = "http://localhost:5173"
    secret_key: str = "eatco-dev-only-change-in-production"

    clova_ocr_api_url: str = ""
    clova_ocr_secret_key: str = ""
    ocr_mock_mode: bool = True
    gemini_api_key: str = ""
    ocr_provider: str = "gemini"  # "gemini" | "clova" | "mock"
    recipe_api_key: str = ""
    data_go_kr_api_key: str = ""
    environment: str = "development"  # "development" | "production"
    rate_limit_scan: str = "100/hour"  # 개발: 100/hour, 프로덕션: 10/hour
    rate_limit_recipes: str = "200/hour"  # 개발: 200/hour, 프로덕션: 20/hour
    timezone: str = "Asia/Seoul"
    upload_dir: str = "/app/uploads"

    # Gemini 모델 — 쉼표 구분 폴백 체인. 앞쪽이 우선.
    # 모델 ID 를 코드에 하드코딩하지 말 것. gemini-2.0-flash 는 2026-06-01 에
    # 종료됐는데 4개 파일에 흩어져 있어서 3곳이 조용히 죽어도 아무도 몰랐다.
    # 갱신 전 `GET /v1beta/models` 로 실재 여부를 확인할 것.
    gemini_models_vision: str = "gemini-3.5-flash,gemini-2.5-flash"
    gemini_models_fast: str = "gemini-3.5-flash-lite,gemini-2.5-flash-lite"

    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claim_email: str = "mailto:admin@eatco.app"

    def validate_secret_key(self) -> None:
        """JWT 서명 키 점검. 예전에는 정의만 있고 **어디서도 호출되지 않았다**.

        docker-compose 의 SECRET_KEY 는 `${SECRET_KEY}` 로 기본값이 없어서
        호스트 변수가 비면 빈 문자열로 JWT 를 서명한다. 그러면 누구나 임의
        사용자의 토큰을 위조할 수 있다. 프로덕션에서는 기동을 막는다.
        """
        weak = not self.secret_key or self.secret_key == "eatco-dev-only-change-in-production"
        if not weak:
            return
        reason = "비어 있습니다" if not self.secret_key else "기본값입니다"
        if self.environment == "production":
            raise RuntimeError(
                f"SECRET_KEY 가 {reason}. 프로덕션에서는 기동할 수 없습니다. "
                "임의의 긴 문자열로 설정하세요 (예: openssl rand -hex 32)."
            )
        import warnings

        warnings.warn(
            f"SECRET_KEY 가 {reason}. 프로덕션에서 반드시 변경하세요!",
            stacklevel=2,
        )

    @property
    def vision_models(self) -> list[str]:
        return [m.strip() for m in self.gemini_models_vision.split(",") if m.strip()]

    @property
    def fast_models(self) -> list[str]:
        return [m.strip() for m in self.gemini_models_fast.split(",") if m.strip()]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
