from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_LOCAL_PATH = REPO_ROOT / ".env.local"


def load_local_env() -> None:
    if ENV_LOCAL_PATH.exists():
        load_dotenv(ENV_LOCAL_PATH, override=False)


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    database_path: Path
    uploads_dir: Path
    openai_api_key: str | None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_documents_bucket: str = "collexis-documents"

    @classmethod
    def from_env(cls) -> "Settings":
        load_local_env()
        data_dir = Path(os.getenv("COLLEXIS_DATA_DIR", "backend/.data")).resolve()
        return cls(
            data_dir=data_dir,
            database_path=data_dir / "documents.sqlite3",
            uploads_dir=data_dir / "uploads",
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            supabase_url=os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            supabase_documents_bucket=os.getenv("SUPABASE_DOCUMENTS_BUCKET", "collexis-documents"),
        )

    def ensure_directories(self) -> None:
        if self.uses_supabase:
            return
        self.uploads_dir.mkdir(parents=True, exist_ok=True)

    @property
    def uses_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)
