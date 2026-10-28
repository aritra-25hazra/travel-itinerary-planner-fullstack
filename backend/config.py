"""Environment configuration. Every variable is optional: with none set the API runs in Demo AI + guest mode."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Generative AI (Groq, OpenAI-compatible). Empty -> deterministic Demo engine.
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # Unsplash images. Empty -> gradient placeholders in the UI.
    unsplash_access_key: str = ""

    # Supabase (auth + trips storage). Empty -> guest mode with local SQLite.
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # Comma-separated list of browser origins allowed to call this API.
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # AI endpoint rate limit per user / guest / IP.
    rate_limit_per_hour: int = 20

    # SQLite file used for guest trips (and for everyone when Supabase is not configured).
    sqlite_path: str = "trips.db"

    @property
    def ai_mode(self) -> str:
        return "groq" if self.groq_api_key else "demo"

    @property
    def storage_mode(self) -> str:
        return "supabase" if (self.supabase_url and self.supabase_anon_key) else "sqlite"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
