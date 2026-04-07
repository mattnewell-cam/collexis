from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_LOCAL_PATH = REPO_ROOT / ".env.local"
DEFAULT_DATA_DIR = Path("runtime/backend-data/default")
DEFAULT_BUG_AUTOFIX_ARTIFACTS_DIR = Path("runtime/bug-autofix")
DEFAULT_BUG_AUTOFIX_RUNNER = REPO_ROOT / "scripts" / "bug_autofix_runner.py"


def load_local_env() -> None:
    if ENV_LOCAL_PATH.exists():
        load_dotenv(ENV_LOCAL_PATH, override=False)


def resolve_repo_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    database_path: Path
    uploads_dir: Path
    openai_api_key: str | None
    brevo_api_key: str | None
    collexis_from_email: str
    collexis_from_name: str
    brevo_sandbox: bool
    scheduler_poll_interval_seconds: int
    scheduler_claim_timeout_seconds: int
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_documents_bucket: str = "collexis-documents"
    bug_triage_enabled: bool = False
    bug_triage_poll_interval_seconds: int = 300
    bug_triage_bootstrap_lookback_hours: int = 24
    bug_triage_model: str = "gpt-5.4-mini"
    bug_triage_autofix_min_confidence: float = 0.82
    bug_autofix_runner: Path | None = None
    bug_autofix_repo_path: Path = REPO_ROOT
    bug_autofix_artifacts_dir: Path = DEFAULT_BUG_AUTOFIX_ARTIFACTS_DIR
    bug_autofix_timeout_seconds: int = 1800

    @classmethod
    def from_env(cls) -> "Settings":
        load_local_env()
        data_dir = resolve_repo_path(os.getenv("COLLEXIS_DATA_DIR", str(DEFAULT_DATA_DIR)))
        bug_autofix_runner = (os.getenv("BUG_AUTOFIX_RUNNER") or "").strip()
        default_bug_autofix_runner = DEFAULT_BUG_AUTOFIX_RUNNER.resolve() if DEFAULT_BUG_AUTOFIX_RUNNER.exists() else None
        return cls(
            data_dir=data_dir,
            database_path=data_dir / "documents.sqlite3",
            uploads_dir=data_dir / "uploads",
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            brevo_api_key=os.getenv("BREVO_API_KEY"),
            collexis_from_email=(os.getenv("COLLEXIS_FROM_EMAIL") or "hello@collexis.uk").strip(),
            collexis_from_name=(os.getenv("COLLEXIS_FROM_NAME") or "Collexis").strip(),
            brevo_sandbox=(os.getenv("BREVO_SANDBOX") or "").strip().lower() == "true",
            scheduler_poll_interval_seconds=max(int(os.getenv("SCHEDULER_POLL_INTERVAL_SECONDS", "60")), 15),
            scheduler_claim_timeout_seconds=max(int(os.getenv("SCHEDULER_CLAIM_TIMEOUT_SECONDS", "600")), 60),
            supabase_url=os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            supabase_documents_bucket=os.getenv("SUPABASE_DOCUMENTS_BUCKET", "collexis-documents"),
            bug_triage_enabled=env_bool("BUG_TRIAGE_ENABLED", False),
            bug_triage_poll_interval_seconds=max(int(os.getenv("BUG_TRIAGE_POLL_INTERVAL_SECONDS", "300")), 60),
            bug_triage_bootstrap_lookback_hours=max(int(os.getenv("BUG_TRIAGE_BOOTSTRAP_LOOKBACK_HOURS", "24")), 1),
            bug_triage_model=(os.getenv("BUG_TRIAGE_MODEL") or "gpt-5.4-mini").strip(),
            bug_triage_autofix_min_confidence=min(
                max(float(os.getenv("BUG_TRIAGE_AUTOFIX_MIN_CONFIDENCE", "0.82")), 0.0),
                1.0,
            ),
            bug_autofix_runner=Path(bug_autofix_runner).expanduser() if bug_autofix_runner else default_bug_autofix_runner,
            bug_autofix_repo_path=resolve_repo_path(os.getenv("BUG_AUTOFIX_REPO_PATH", str(REPO_ROOT))),
            bug_autofix_artifacts_dir=resolve_repo_path(
                os.getenv("BUG_AUTOFIX_ARTIFACTS_DIR", str(DEFAULT_BUG_AUTOFIX_ARTIFACTS_DIR))
            ),
            bug_autofix_timeout_seconds=max(int(os.getenv("BUG_AUTOFIX_TIMEOUT_SECONDS", "1800")), 30),
        )

    def ensure_directories(self) -> None:
        if self.uses_supabase:
            return
        self.uploads_dir.mkdir(parents=True, exist_ok=True)

    @property
    def uses_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)
