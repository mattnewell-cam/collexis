from __future__ import annotations

from backend.app.config import DEFAULT_DATA_DIR, REPO_ROOT, Settings


def test_settings_from_env_uses_runtime_backend_data_by_default(monkeypatch) -> None:
    monkeypatch.delenv("COLLEXIS_DATA_DIR", raising=False)

    settings = Settings.from_env()

    assert settings.data_dir == (REPO_ROOT / DEFAULT_DATA_DIR).resolve()
    assert settings.database_path == settings.data_dir / "documents.sqlite3"
    assert settings.uploads_dir == settings.data_dir / "uploads"


def test_settings_from_env_resolves_relative_data_dir_from_repo_root(monkeypatch) -> None:
    monkeypatch.setenv("COLLEXIS_DATA_DIR", "runtime/backend-data/sandboxes/test-run")

    settings = Settings.from_env()

    assert settings.data_dir == (REPO_ROOT / "runtime/backend-data/sandboxes/test-run").resolve()
