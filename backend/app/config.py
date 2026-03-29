from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://eatco:eatco_dev_password@localhost:5432/eatco"
    cors_origins: str = "http://localhost:5173"
    secret_key: str = "eatco-dev-only-change-in-production"
    clova_ocr_api_url: str = ""
    clova_ocr_secret_key: str = ""
    ocr_mock_mode: bool = True
    recipe_api_key: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
