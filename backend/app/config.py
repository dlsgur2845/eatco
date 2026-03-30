from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://eatco:eatco_dev_password@localhost:5432/eatco"
    cors_origins: str = "http://localhost:5173"
    secret_key: str = "eatco-dev-only-change-in-production"

    def validate_secret_key(self) -> None:
        if self.secret_key == "eatco-dev-only-change-in-production":
            import warnings
            warnings.warn(
                "SECRET_KEY가 기본값입니다. 프로덕션에서 반드시 변경하세요!",
                stacklevel=2,
            )
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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
