"""
Application configuration settings.
"""
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl, validator
import secrets


class Settings(BaseSettings):
    PROJECT_NAME: str = "CivicDuty"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    ANONYMOUS_TOKEN_EXPIRE_DAYS: int = 365
    ALGORITHM: str = "HS256"
    
    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "civicduty"
    POSTGRES_PASSWORD: str = "civicduty_password"
    POSTGRES_DB: str = "civicduty"
    POSTGRES_PORT: str = "5432"
    
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    @property
    def SYNC_DATABASE_URL(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # S3/Object Storage
    S3_ENDPOINT_URL: Optional[str] = None
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET_NAME: str = "civicduty-media"
    S3_REGION: str = "us-east-1"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:4200", "http://localhost:8080"]
    
    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v
    
    # Scoring configuration
    SCORE_BASE: float = 10.0
    SCORE_MEDIA_PHOTO: float = 15.0
    SCORE_MEDIA_VIDEO: float = 25.0
    SCORE_GPS_VERIFIED: float = 10.0
    SCORE_CONFIRMATION: float = 5.0
    SCORE_FLAG_PENALTY: float = -10.0
    SCORE_ESCALATION_THRESHOLD: float = 75.0
    
    # Trust score configuration
    TRUST_INITIAL: float = 50.0
    TRUST_CONFIRMED_REPORT_BONUS: float = 2.0
    TRUST_FALSE_REPORT_PENALTY: float = -10.0
    TRUST_MIN: float = 0.0
    TRUST_MAX: float = 100.0
    
    # Media configuration
    MAX_IMAGE_SIZE_MB: int = 10
    MAX_VIDEO_SIZE_MB: int = 50
    MAX_MEDIA_PER_REPORT: int = 5
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/webp"]
    ALLOWED_VIDEO_TYPES: List[str] = ["video/mp4", "video/webm", "video/quicktime"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
