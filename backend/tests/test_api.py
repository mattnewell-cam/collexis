from __future__ import annotations

from pathlib import Path
import json

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.extraction import (
    TIMELINE_PLANNING_PROMPT,
    format_transcript,
    normalize_extraction,
    normalize_timeline_decision,
    process_document,
    summarize_job_intake,
)
from backend.app.main import create_app
from backend.app.repository import DocumentRepository
from backend.app.schemas import ExtractedDocument, ExtractedMessage, JobIntakeSummary, TimelineDecision


def build_settings(tmp_path: Path) -> Settings:
    data_dir = tmp_path / "data"
    return Settings(
        data_dir=data_dir,
        database_path=data_dir / "documents.sqlite3",
        uploads_dir=data_dir / "uploads",
        openai_api_key="test-key",
    )


def build_client(tmp_path: Path) -> tuple[TestClient, Settings]:
    settings = build_settings(tmp_path)
    app = create_app(settings)
    return TestClient(app), settings


def noop_processor(document_id: str, settings: Settings, processing_profile: str = "default") -> None:
    return None


def test_upload_pdf_creates_processing_document(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("invoice.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "processing"
    assert body["original_filename"] == "invoice.pdf"

    docs = DocumentRepository(settings).list_for_job("job-123")
    assert len(docs) == 1
    assert docs[0]["status"] == "processing"
    assert Path(docs[0]["storage_path"]).exists()


def test_upload_image_creates_processing_document(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("message.png", b"\x89PNG\r\n", "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "processing"
    assert body["mime_type"] == "image/png"

    docs = DocumentRepository(settings).list_for_job("job-123")
    assert len(docs) == 1
    assert docs[0]["status"] == "processing"
    assert Path(docs[0]["storage_path"]).exists()


def test_successful_extraction_populates_fields(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)

    def ready_processor(document_id: str, settings: Settings, processing_profile: str = "default") -> None:
        def fake_extractor(document: dict[str, object], _: Settings, profile: str) -> ExtractedDocument:
            assert profile == processing_profile
            return ExtractedDocument(
                title="WhatsApp chase from client",
                date="2026-03-12",
                description="Customer chased payment and said they would transfer it by Friday afternoon after checking with accounts.",
                messages=[
                    ExtractedMessage(
                        sender="Patricia",
                        datetime="2026-03-12 09:14",
                        type="whatsapp",
                        raw_message="I will send it on Friday once accounts confirm.",
                    )
                ],
            )

        def fake_planner(
            document: dict[str, object],
            normalized_document: dict[str, str | None],
            existing_timeline_items: list[dict[str, object]],
            _: Settings,
        ) -> TimelineDecision:
            return TimelineDecision(
                action="create_new",
                category="chase",
                subtype="whatsapp",
                sender=None,
                date=normalized_document["communication_date"],
                short_description="WhatsApp payment promise",
                details="Client said payment would be made after accounts approval.",
            )

        process_document(
            document_id,
            settings,
            extractor=fake_extractor,
            timeline_planner=fake_planner,
        )

    client.app.state.document_processor = ready_processor

    response = client.post(
        "/jobs/job-321/documents",
        files={"file": ("message.png", b"\x89PNG\r\n", "image/png")},
    )

    assert response.status_code == 200

    list_response = client.get("/jobs/job-321/documents")
    body = list_response.json()[0]
    assert body["status"] == "ready"
    assert body["title"] == "WhatsApp chase from client"
    assert body["communication_date"] == "2026-03-12"
    assert "sender: Patricia" in body["transcript"]
    assert "type: whatsapp" in body["transcript"]
    assert len(body["linked_timeline_item_ids"]) == 1

    timeline_items = DocumentRepository(settings).list_timeline_for_job("job-321")
    created = next(item for item in timeline_items if item["id"] == body["linked_timeline_item_ids"][0])
    assert created["category"] == "chase"
    assert created["subtype"] == "whatsapp"
    assert created["date"] == "2026-03-12"


def test_timeline_planner_can_link_existing_item(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)

    def linking_processor(document_id: str, settings: Settings, processing_profile: str = "default") -> None:
        def fake_extractor(document: dict[str, object], _: Settings, profile: str) -> ExtractedDocument:
            assert profile == processing_profile
            return ExtractedDocument(
                title="Second chase email PDF",
                date="2026-03-02",
                description="Copy of the second chase email already on file.",
                messages=[],
            )

        def fake_planner(
            document: dict[str, object],
            normalized_document: dict[str, str | None],
            existing_timeline_items: list[dict[str, object]],
            _: Settings,
        ) -> TimelineDecision:
            assert any(str(item["id"]) == "c1-4" for item in existing_timeline_items)
            return TimelineDecision(
                action="link_existing",
                existing_timeline_item_id="c1-4",
            )

        process_document(
            document_id,
            settings,
            extractor=fake_extractor,
            timeline_planner=fake_planner,
        )

    client.app.state.document_processor = linking_processor

    response = client.post(
        "/jobs/1/documents",
        files={"file": ("second-chase.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )

    assert response.status_code == 200

    stored = DocumentRepository(settings).list_for_job("1")[0]
    assert stored["status"] == "ready"
    assert stored["linked_timeline_item_ids"] == ["c1-4"]


def test_timeline_routes_support_crud(tmp_path: Path) -> None:
    client, _settings = build_client(tmp_path)

    create_response = client.post(
        "/jobs/job-900/timeline-items",
        json={
            "category": "conversation",
            "subtype": "phone",
            "sender": "you",
            "date": "2026-03-20",
            "short_description": "Called debtor",
            "details": "Discussed payment timing over the phone.",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["job_id"] == "job-900"
    assert created["linked_document_ids"] == []

    list_response = client.get("/jobs/job-900/timeline-items")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    update_response = client.patch(
        f"/timeline-items/{created['id']}",
        json={
            "short_description": "Debtor phone call",
            "details": "Discussed payment timing and next steps over the phone.",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["short_description"] == "Debtor phone call"

    delete_response = client.delete(f"/timeline-items/{created['id']}")
    assert delete_response.status_code == 200

    final_list_response = client.get("/jobs/job-900/timeline-items")
    assert final_list_response.status_code == 200
    assert final_list_response.json() == []


def test_can_link_existing_document_to_timeline_item(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    upload_response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("invoice.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    document_id = upload_response.json()["id"]

    timeline_response = client.post(
        "/jobs/job-123/timeline-items",
        json={
            "category": "conversation",
            "subtype": "email",
            "sender": "you",
            "date": "2026-03-20",
            "short_description": "Shared invoice",
            "details": "Sent the invoice copy to the debtor.",
        },
    )
    timeline_item_id = timeline_response.json()["id"]

    link_response = client.post(f"/timeline-items/{timeline_item_id}/documents/{document_id}")

    assert link_response.status_code == 200
    assert link_response.json()["linked_document_ids"] == [document_id]

    stored_document = DocumentRepository(settings).get(document_id)
    assert stored_document is not None
    assert stored_document["linked_timeline_item_ids"] == [timeline_item_id]


def test_upload_can_link_directly_to_timeline_item(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    timeline_response = client.post(
        "/jobs/job-123/timeline-items",
        json={
            "category": "conversation",
            "subtype": "sms",
            "sender": "collexis",
            "date": "2026-03-20",
            "short_description": "Received payment update",
            "details": "Customer said payment should clear on Friday.",
        },
    )
    timeline_item_id = timeline_response.json()["id"]

    upload_response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("message.png", b"\x89PNG\r\n", "image/png")},
        data={"timeline_item_id": timeline_item_id},
    )

    assert upload_response.status_code == 200
    document_id = upload_response.json()["id"]
    assert upload_response.json()["linked_timeline_item_ids"] == [timeline_item_id]

    stored_timeline_item = DocumentRepository(settings).get_timeline_item(timeline_item_id)
    assert stored_timeline_item is not None
    assert stored_timeline_item["linked_document_ids"] == [document_id]


def test_ambiguous_date_stores_null() -> None:
    normalized = normalize_extraction(
        ExtractedDocument(
            title="Unreadable screenshot",
            date=None,
            description="Payment discussion without a visible date on screen.",
            messages=[],
        ),
        original_filename="screen.png",
    )

    assert normalized["communication_date"] is None


def test_infers_date_from_message_datetime_when_top_level_date_missing() -> None:
    normalized = normalize_extraction(
        ExtractedDocument(
            title="Insurance update",
            date=None,
            description="Patricia says the insurer should release funds on Friday.",
            messages=[
                ExtractedMessage(
                    sender="Patricia Whitmore",
                    datetime="Mon 16 Mar 2026 08:43",
                    type="email",
                    raw_message="The insurer expects to release funds on Friday afternoon.",
                )
            ],
        ),
        original_filename="patricia-insurance-update.png",
    )

    assert normalized["communication_date"] == "2026-03-16"
    assert "datetime: 2026-03-16 08:43" in normalized["transcript"]


def test_multiday_conversation_uses_first_day() -> None:
    normalized = normalize_extraction(
        ExtractedDocument(
            title="Email chain",
            date="2026-02-01",
            description="Conversation carried on over several days.",
            messages=[
                ExtractedMessage(
                    sender="Accounts",
                    datetime="2026-02-01 10:00",
                    type="email",
                    raw_message="First email",
                ),
                ExtractedMessage(
                    sender="Client",
                    datetime="2026-02-03 12:00",
                    type="email",
                    raw_message="Reply two days later",
                ),
            ],
        ),
        original_filename="chain.pdf",
    )

    assert normalized["communication_date"] == "2026-02-01"


def test_transcript_format_uses_consistent_separator() -> None:
    transcript = format_transcript(
        [
            {
                "sender": "A",
                "datetime": "2026-02-01 10:00",
                "type": "email",
                "raw_message": "First message",
            },
            {
                "sender": "B",
                "datetime": "2026-02-01 11:00",
                "type": "sms",
                "raw_message": "Second message",
            },
        ]
    )

    assert "\n============\n" in transcript
    assert "raw_message:\nFirst message" in transcript
    assert "raw_message:\nSecond message" in transcript


def test_transcript_normalizes_date_only_datetime_to_fixed_shape() -> None:
    normalized = normalize_extraction(
        ExtractedDocument(
            title="Invoice copy",
            date="2026-03-18",
            due_date="2026-03-25",
            description="Invoice for burst pipe repair.",
            messages=[
                ExtractedMessage(
                    sender="Northgate Property Services Ltd",
                    datetime=None,
                    type="invoice",
                    raw_message="Invoice issue date 18 March 2026",
                )
            ],
        ),
        original_filename="northgate-burst-pipe-final.pdf",
    )

    assert normalized["communication_date"] == "2026-03-18"
    assert normalized["due_date"] == "2026-03-25"
    assert "datetime: 2026-03-18 00:00" in normalized["transcript"]


def test_due_date_is_used_for_due_date_timeline_items(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)

    def invoice_processor(document_id: str, settings: Settings, processing_profile: str = "default") -> None:
        def fake_extractor(document: dict[str, object], _: Settings, profile: str) -> ExtractedDocument:
            assert profile == processing_profile
            return ExtractedDocument(
                title="Invoice INV-2026-0505",
                date="2026-03-14",
                due_date="2026-03-21",
                description="Invoice for gutter replacement.",
                messages=[
                    ExtractedMessage(
                        sender="Northgate Property Services Ltd",
                        datetime=None,
                        type="invoice",
                        raw_message="Issue 14 March 2026, due 21 March 2026",
                    )
                ],
            )

        def fake_planner(
            document: dict[str, object],
            normalized_document: dict[str, str | None],
            existing_timeline_items: list[dict[str, object]],
            _: Settings,
        ) -> TimelineDecision:
            return TimelineDecision(
                action="create_new",
                category="due-date",
                date=None,
                short_description="Invoice due",
                details="Payment due soon.",
            )

        process_document(
            document_id,
            settings,
            extractor=fake_extractor,
            timeline_planner=fake_planner,
        )

    client.app.state.document_processor = invoice_processor

    response = client.post(
        "/jobs/job-555/documents",
        files={"file": ("invoice.png", b"\x89PNG\r\n", "image/png")},
    )

    assert response.status_code == 200
    stored = DocumentRepository(settings).list_for_job("job-555")[0]
    assert stored["communication_date"] == "2026-03-14"
    assert "datetime: 2026-03-14 00:00" in stored["transcript"]

    linked_id = stored["linked_timeline_item_ids"][0]
    timeline_item = DocumentRepository(settings).get_timeline_item(linked_id)
    assert timeline_item is not None
    assert timeline_item["date"] == "2026-03-21"


def test_prompt_limits_due_date_to_single_original_deadline() -> None:
    assert "There can be at most one 'due-date' item per job." in TIMELINE_PLANNING_PROMPT
    assert "A one-way email asking for payment" in TIMELINE_PLANNING_PROMPT
    assert "'chase' with subtype 'email'" in TIMELINE_PLANNING_PROMPT


def test_second_due_date_email_is_reclassified_as_chase() -> None:
    normalized = normalize_timeline_decision(
        TimelineDecision(
            action="create_new",
            category="due-date",
            date=None,
            short_description="Overdue invoice reminder",
            details="Please arrange payment today.",
        ),
        document={
            "created_at": "2026-03-15 09:30",
            "original_filename": "email-2026-03-15.png",
        },
        normalized_document={
            "title": "Overdue invoice reminder",
            "communication_date": "2026-03-15",
            "due_date": "2026-03-04",
            "description": "Email chasing payment for an overdue invoice.",
            "transcript": (
                "sender: Northgate Property Services Ltd\n"
                "datetime: 2026-03-15 09:30\n"
                "type: email\n"
                "raw_message:\n"
                "Please can you confirm when payment will be made for the overdue invoice."
            ),
        },
        existing_timeline_items=[
            {
                "id": "due-1",
                "category": "due-date",
                "date": "2026-03-04",
                "subtype": None,
                "sender": None,
                "short_description": "Invoice due 4 March 2026",
                "details": "Original invoice due date.",
            }
        ],
    )

    assert normalized["category"] == "chase"
    assert normalized["subtype"] == "email"
    assert normalized["sender"] == "you"
    assert normalized["date"] == "2026-03-15"


def test_link_existing_is_rejected_for_new_email_follow_up() -> None:
    normalized = normalize_timeline_decision(
        TimelineDecision(
            action="link_existing",
            existing_timeline_item_id="chase-sms-1",
        ),
        document={
            "created_at": "2026-03-15 08:15",
            "original_filename": "email-2026-03-15.png",
        },
        normalized_document={
            "title": "Overdue invoice follow-up",
            "communication_date": "2026-03-15",
            "due_date": "2026-03-04",
            "description": "Email chasing payment for the overdue invoice.",
            "transcript": (
                "sender: Northgate Property Services Ltd\n"
                "datetime: 2026-03-15 08:15\n"
                "type: email\n"
                "raw_message:\n"
                "Please make payment today or confirm a firm payment date."
            ),
        },
        existing_timeline_items=[
            {
                "id": "chase-sms-1",
                "category": "chase",
                "subtype": "sms",
                "sender": "you",
                "date": "2026-03-11",
                "short_description": "SMS reminder",
                "details": "Earlier SMS chase.",
            }
        ],
    )

    assert normalized["action"] == "create_new"
    assert normalized["category"] == "chase"
    assert normalized["subtype"] == "email"
    assert normalized["sender"] == "you"
    assert normalized["date"] == "2026-03-15"


def test_two_way_whatsapp_thread_is_normalized_to_conversation() -> None:
    normalized = normalize_timeline_decision(
        TimelineDecision(
            action="create_new",
            category="chase",
            subtype="whatsapp",
            short_description="Payment follow-up",
            details="Two-way WhatsApp exchange.",
        ),
        document={
            "created_at": "2026-03-06 10:00",
            "original_filename": "whatsapp-2026-03-06.png",
        },
        normalized_document={
            "title": "Invoice payment follow-up",
            "communication_date": "2026-03-06",
            "due_date": "2026-03-04",
            "description": "WhatsApp discussion about payment timing.",
            "transcript": (
                "sender: Northgate Property Services Ltd\n"
                "datetime: 2026-03-06 09:01\n"
                "type: whatsapp\n"
                "raw_message:\n"
                "Morning James, just checking you saw invoice INV-2026-0732.\n"
                "============\n"
                "sender: James Simpson\n"
                "datetime: 2026-03-06 09:05\n"
                "type: whatsapp\n"
                "raw_message:\n"
                "Yes, I have seen it and will confirm once payment clears."
            ),
        },
        existing_timeline_items=[],
    )

    assert normalized["category"] == "conversation"
    assert normalized["subtype"] == "whatsapp"


def test_one_way_sms_reminder_is_normalized_to_chase() -> None:
    normalized = normalize_timeline_decision(
        TimelineDecision(
            action="create_new",
            category="conversation",
            subtype="sms",
            short_description="Payment reminder",
            details="Reminder SMS sent.",
        ),
        document={
            "created_at": "2026-03-11 09:00",
            "original_filename": "sms-2026-03-11.png",
        },
        normalized_document={
            "title": "Payment reminder for invoice INV-2026-0732",
            "communication_date": "2026-03-11",
            "due_date": "2026-03-04",
            "description": "SMS reminder chasing payment for an overdue invoice.",
            "transcript": (
                "sender: Northgate Property Services Ltd\n"
                "datetime: 2026-03-11 09:00\n"
                "type: sms\n"
                "raw_message:\n"
                "Invoice INV-2026-0732 is overdue. Please confirm when payment will be made."
            ),
        },
        existing_timeline_items=[],
    )

    assert normalized["category"] == "chase"
    assert normalized["subtype"] == "sms"


def test_sms_chase_language_wins_over_dialogue_context() -> None:
    normalized = normalize_timeline_decision(
        TimelineDecision(
            action="create_new",
            category="conversation",
            subtype="sms",
            short_description="SMS chasing invoice payment",
            details="SMS chase with quoted prior context.",
        ),
        document={
            "created_at": "2026-03-11 09:00",
            "original_filename": "sms-2026-03-11.png",
        },
        normalized_document={
            "title": "SMS chasing invoice payment",
            "communication_date": "2026-03-11",
            "due_date": "2026-03-04",
            "description": "SMS chasing payment for an overdue invoice and asking for confirmation of when it will be cleared.",
            "transcript": (
                "sender: Northgate Property Services Ltd\n"
                "datetime: 2026-03-11 09:00\n"
                "type: sms\n"
                "raw_message:\n"
                "Invoice INV-2026-0732 is overdue. Please confirm when payment will be made.\n"
                "============\n"
                "sender: James Simpson\n"
                "datetime: 2026-03-06 09:05\n"
                "type: sms\n"
                "raw_message:\n"
                "I will confirm once the funds clear."
            ),
        },
        existing_timeline_items=[],
    )

    assert normalized["category"] == "chase"
    assert normalized["subtype"] == "sms"


def test_message_document_is_not_linked_to_due_date_item() -> None:
    normalized = normalize_timeline_decision(
        TimelineDecision(
            action="link_existing",
            existing_timeline_item_id="due-1",
        ),
        document={
            "created_at": "2026-03-06 09:00",
            "original_filename": "whatsapp-2026-03-06.png",
        },
        normalized_document={
            "title": "Payment status WhatsApp chat",
            "communication_date": "2026-03-06",
            "due_date": "2026-03-04",
            "description": "Two-way WhatsApp exchange about when payment will clear.",
            "transcript": (
                "sender: Northgate Property Services Ltd\n"
                "datetime: 2026-03-06 09:00\n"
                "type: whatsapp\n"
                "raw_message:\n"
                "Just checking you saw the invoice.\n"
                "============\n"
                "sender: James Simpson\n"
                "datetime: 2026-03-06 09:05\n"
                "type: whatsapp\n"
                "raw_message:\n"
                "Yes, I have and will confirm once paid."
            ),
        },
        existing_timeline_items=[
            {
                "id": "due-1",
                "category": "due-date",
                "subtype": None,
                "sender": None,
                "date": "2026-03-04",
                "short_description": "Invoice due",
                "details": "Original invoice deadline.",
            }
        ],
    )

    assert normalized["action"] == "create_new"
    assert normalized["category"] == "conversation"
    assert normalized["subtype"] == "whatsapp"


def test_business_sender_is_normalized_in_transcript() -> None:
    normalized = normalize_extraction(
        ExtractedDocument(
            title="Reminder email",
            date="2026-03-15",
            description="Reminder from the business.",
            messages=[
                ExtractedMessage(
                    sender="Accounts Team",
                    datetime="2026-03-15 10:12",
                    type="email",
                    raw_message="Please make payment today.",
                )
            ],
        ),
        original_filename="reminder.png",
    )

    assert "sender: Northgate Property Services Ltd" in normalized["transcript"]


def test_filename_date_fallback_is_used_when_message_dates_are_missing() -> None:
    normalized = normalize_extraction(
        ExtractedDocument(
            title="WhatsApp follow-up",
            date=None,
            description="Conversation without a visible dated header.",
            messages=[
                ExtractedMessage(
                    sender="",
                    datetime=None,
                    type="message",
                    raw_message="Please confirm when payment has been sent.",
                )
            ],
        ),
        original_filename="whatsapp-2026-03-06.png",
    )

    assert normalized["communication_date"] == "2026-03-06"


def test_conversation_sender_heuristics_assign_business_name() -> None:
    normalized = normalize_extraction(
        ExtractedDocument(
            title="WhatsApp payment follow-up",
            date=None,
            description="WhatsApp exchange",
            messages=[
                ExtractedMessage(
                    sender="James Simpson (Online)",
                    datetime=None,
                    type="message",
                    raw_message="Morning James, just checking you saw invoice INV-2026-0732 which fell due on Wednesday.",
                ),
                ExtractedMessage(
                    sender="",
                    datetime=None,
                    type="message",
                    raw_message="Morning, yes I have seen it. I am just waiting for some money to clear.",
                ),
            ],
        ),
        original_filename="whatsapp-2026-03-06.png",
    )

    assert "sender: Northgate Property Services Ltd" in normalized["transcript"]
    assert "sender: James Simpson" in normalized["transcript"]


def test_patch_updates_editable_fields(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    create_response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("invoice.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    document_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/documents/{document_id}",
        json={
            "title": "Updated title",
            "communication_date": "2026-03-15",
            "description": "Edited description",
            "transcript": "Edited transcript",
        },
    )

    assert patch_response.status_code == 200
    body = patch_response.json()
    assert body["title"] == "Updated title"
    assert body["communication_date"] == "2026-03-15"
    assert body["description"] == "Edited description"
    assert body["transcript"] == "Edited transcript"

    stored = DocumentRepository(settings).get(document_id)
    assert stored is not None
    assert stored["title"] == "Updated title"


def test_file_route_serves_uploaded_file(tmp_path: Path) -> None:
    client, _settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    create_response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("message.png", b"\x89PNG\r\nsample", "image/png")},
    )
    document_id = create_response.json()["id"]

    file_response = client.get(f"/documents/{document_id}/file")

    assert file_response.status_code == 200
    assert file_response.headers["content-type"] == "image/png"
    assert file_response.content == b"\x89PNG\r\nsample"


def test_job_intake_upload_passes_processing_profile(tmp_path: Path) -> None:
    client, _settings = build_client(tmp_path)
    seen_profiles: list[str] = []

    def recording_processor(document_id: str, settings: Settings, processing_profile: str = "default") -> None:
        seen_profiles.append(processing_profile)

    client.app.state.document_processor = recording_processor

    response = client.post(
        "/jobs/job-777/documents",
        files={"file": ("invoice.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"processing_profile": "job-intake"},
    )

    assert response.status_code == 200
    assert seen_profiles == ["job-intake"]


def test_intake_summary_route_returns_structured_summary(tmp_path: Path) -> None:
    client, _settings = build_client(tmp_path)
    client.app.state.job_intake_summarizer = lambda job_id, settings: JobIntakeSummary(
        job_description="Emergency burst pipe repair",
        job_detail="Burst pipe call-out with unpaid invoice and a payment promise.",
        due_date="2026-03-21",
        price=1420,
        amount_paid=0,
        emails=["p.whitmore@btinternet.com"],
        phones=["07712 334 891"],
        context_instructions="Debtor said payment should follow once accounts confirm.",
    )

    response = client.get("/jobs/job-321/intake-summary")

    assert response.status_code == 200
    assert response.json() == {
        "job_description": "Emergency burst pipe repair",
        "job_detail": "Burst pipe call-out with unpaid invoice and a payment promise.",
        "due_date": "2026-03-21",
        "price": 1420,
        "amount_paid": 0,
        "emails": ["p.whitmore@btinternet.com"],
        "phones": ["07712 334 891"],
        "context_instructions": "Debtor said payment should follow once accounts confirm.",
    }


def test_intake_summary_ignores_failed_documents(monkeypatch, tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    first_response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("invoice.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    second_response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("message.png", b"\x89PNG\r\nsample", "image/png")},
    )

    repository = DocumentRepository(settings)
    ready_document_id = first_response.json()["id"]
    failed_document_id = second_response.json()["id"]

    repository.update_fields(
        ready_document_id,
        status="ready",
        title="Invoice INV-001",
        communication_date="2026-03-14",
        description="Invoice for burst pipe repair.",
        transcript="sender: Patricia\nraw_message:\nInvoice attached",
    )
    repository.update_fields(
        failed_document_id,
        status="failed",
        extraction_error="Unreadable screenshot.",
    )

    captured_payloads: list[dict[str, object]] = []

    class FakeResponses:
        def parse(self, *, model, input, text_format):
            assert model == "gpt-5.4-mini"
            payload = json.loads(input[0]["content"][1]["text"])
            captured_payloads.append(payload)
            return type("FakeResponse", (), {
                "output_parsed": JobIntakeSummary(job_description="Invoice summary"),
            })()

    class FakeOpenAI:
        def __init__(self, api_key: str):
            self.api_key = api_key
            self.responses = FakeResponses()

    monkeypatch.setattr("backend.app.extraction.OpenAI", FakeOpenAI)

    summary = summarize_job_intake("job-123", settings)

    assert summary.job_description == "Invoice summary"
    assert len(captured_payloads) == 1
    assert [doc["id"] for doc in captured_payloads[0]["documents"]] == [ready_document_id]


def test_intake_summary_filters_business_contacts_and_trims_notes(monkeypatch, tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    create_response = client.post(
        "/jobs/job-777/documents",
        files={"file": ("invoice.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    document_id = create_response.json()["id"]
    DocumentRepository(settings).update_fields(
        document_id,
        status="ready",
        title="Invoice INV-777",
        communication_date="2026-03-14",
        description="Invoice for works.",
        transcript="sender: Northgate Property Services Ltd",
    )

    class FakeResponses:
        def parse(self, *, model, input, text_format):
            return type("FakeResponse", (), {
                "output_parsed": JobIntakeSummary(
                    job_description="Repair invoice",
                    job_detail="Detailed summary",
                    due_date="2026-03-21",
                    price=684,
                    amount_paid=0,
                    emails=["accounts@northgateps.co.uk", "james@example.com"],
                    phones=["0117 496 2184", "07700 900 111"],
                    context_instructions=(
                        "Call accounts@northgateps.co.uk on 0117 496 2184 if needed. "
                        "Debtor says payment is coming shortly and no dispute has been raised, "
                        "but keep pressing for a firm date and proof of transfer."
                    ),
                ),
            })()

    class FakeOpenAI:
        def __init__(self, api_key: str):
            self.api_key = api_key
            self.responses = FakeResponses()

    monkeypatch.setattr("backend.app.extraction.OpenAI", FakeOpenAI)

    summary = summarize_job_intake("job-777", settings)

    assert summary.emails == ["james@example.com"]
    assert summary.phones == ["07700 900 111"]
    assert "accounts@northgateps.co.uk" not in summary.context_instructions
    assert "0117 496 2184" not in summary.context_instructions
    assert len(summary.context_instructions.split()) <= 35


def test_delete_job_removes_documents_timeline_and_uploaded_files(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    client.app.state.document_processor = noop_processor

    upload_response = client.post(
        "/jobs/job-123/documents",
        files={"file": ("invoice.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    document_id = upload_response.json()["id"]

    repository = DocumentRepository(settings)
    created_timeline_item = repository.create_timeline_item(
        job_id="job-123",
        category="conversation",
        subtype="email",
        sender="you",
        date="2026-03-20",
        short_description="Sent payment reminder",
        details="Reminder email sent to the customer.",
    )
    repository.link_document_to_timeline_item(document_id, created_timeline_item["id"])

    stored_document = repository.get(document_id)
    assert stored_document is not None
    uploaded_file_path = Path(str(stored_document["storage_path"]))
    assert uploaded_file_path.exists()

    delete_response = client.delete("/jobs/job-123")

    assert delete_response.status_code == 200
    assert delete_response.json() == {
        "job_id": "job-123",
        "deleted_document_count": 1,
        "deleted_timeline_item_count": 1,
        "deleted_file_count": 1,
    }
    assert repository.list_for_job("job-123") == []
    assert repository.list_timeline_for_job("job-123") == []
    assert not uploaded_file_path.exists()
