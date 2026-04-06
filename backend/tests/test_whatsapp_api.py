from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app


def build_settings(tmp_path: Path) -> Settings:
    data_dir = tmp_path / "data"
    return Settings(
        data_dir=data_dir,
        database_path=data_dir / "documents.sqlite3",
        uploads_dir=data_dir / "uploads",
        openai_api_key="test-key",
        brevo_api_key="brevo-test-key",
        collexis_from_email="hello@collexis.uk",
        collexis_from_name="Collexis",
        brevo_sandbox=True,
        scheduler_poll_interval_seconds=60,
        scheduler_claim_timeout_seconds=600,
    )


def test_send_whatsapp_endpoint_uses_backend_sender_and_records_timeline(monkeypatch, tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    app = create_app(settings)
    app.state.whatsapp_sender = lambda **_kwargs: [None]
    client = TestClient(app)

    monkeypatch.setattr("backend.app.main.playwright_whatsapp_configuration_error", lambda: None)

    class FakeRepository:
        def __init__(self, _settings: Settings):
            self.settings = _settings

        def create_timeline_item(self, **kwargs: object) -> dict[str, object]:
            return {
                "id": "comm-123",
                "job_id": kwargs["job_id"],
                "category": kwargs["category"],
                "subtype": kwargs["subtype"],
                "sender": kwargs["sender"],
                "recipient": kwargs["recipient"],
                "date": kwargs["date"],
                "short_description": kwargs["short_description"],
                "details": kwargs["details"],
                "response_classification": None,
                "response_action": None,
                "stated_deadline": None,
                "computed_deadline": None,
                "linked_document_ids": [],
                "created_at": "2026-04-06T12:00:00+00:00",
                "updated_at": "2026-04-06T12:00:00+00:00",
            }

    monkeypatch.setattr("backend.app.main.DocumentRepository", FakeRepository)

    response = client.post(
        "/jobs/job-123/send-whatsapp",
        json={
            "recipients": ["+447700900111"],
            "communication": {
                "category": "conversation",
                "subtype": "whatsapp",
                "sender": "collexis",
                "recipient": "debtor",
                "date": "2026-04-06",
                "short_description": "WhatsApp update",
                "details": "Please confirm when payment will be made.",
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["message_ids"] == [None]
    assert body["timeline_item"]["id"] == "comm-123"
    assert body["timeline_item"]["recipient"] == "debtor"
    assert body["timeline_item"]["details"].startswith("To: +447700900111")
