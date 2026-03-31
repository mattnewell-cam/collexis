from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.repository import DocumentRepository


def main() -> None:
    manifest_path = Path("public/sample-documents/manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    settings = Settings.from_env()
    repository = DocumentRepository(settings)

    sample_filenames = {
        Path(item["path"]).name
        for category_items in manifest["categories"].values()
        for item in category_items
    }
    sample_filenames.update(manifest.get("legacySampleFilenames", []))

    for document in repository.list_all():
        if document["original_filename"] not in sample_filenames:
            continue
        storage_path = Path(str(document["storage_path"]))
        try:
            repository.delete(str(document["id"]))
        except KeyError:
            continue
        if storage_path.exists():
            storage_path.unlink()

    app = create_app(settings)
    client = TestClient(app)

    for category_items in manifest["categories"].values():
        for item in category_items:
            file_path = Path("public") / item["path"].lstrip("/")
            mime_type = "application/pdf" if file_path.suffix.lower() == ".pdf" else "image/png"
            with file_path.open("rb") as file_handle:
                response = client.post(
                    f"/jobs/{item['jobId']}/documents",
                    files={"file": (file_path.name, file_handle, mime_type)},
                )
            response.raise_for_status()
            body = response.json()
            print(f"Seeded {file_path.name} -> job {item['jobId']} [{body['status']}]")


if __name__ == "__main__":
    main()
