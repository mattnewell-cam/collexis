from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.database import connect, init_db
from backend.app.main import create_app
from backend.app.outreach_drafting import ensure_outreach_plan_drafts
from backend.app.outreach_planning import generate_outreach_plan
from backend.app.repository import DocumentRepository
from backend.app.scheduled_outreach import process_due_outreach_once
from backend.app.schemas import (
    JobSnapshot,
    OutreachPlanDraft,
    OutreachPlanDraftStep,
    OutreachPlanGeneratedCommunicationDraft,
    OutreachPlanGeneratedCommunicationDraftBatch,
)


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


def build_client(tmp_path: Path) -> tuple[TestClient, Settings]:
    settings = build_settings(tmp_path)
    app = create_app(settings)
    return TestClient(app), settings


def build_job_snapshot(**overrides: object) -> JobSnapshot:
    payload = {
        "id": "job-123",
        "name": "Patricia Whitmore",
        "address": "14 Elmfield Road",
        "job_description": "Emergency burst pipe repair",
        "job_detail": "Outstanding invoice for emergency plumbing works.",
        "due_date": "2026-02-01",
        "price": 1420.0,
        "amount_paid": 0.0,
        "days_overdue": 58,
        "status": "Stern chase",
        "emails": ["p.whitmore@btinternet.com"],
        "phones": ["07712334891"],
        "context_instructions": "Prefers contact by phone in the morning.",
        "handover_days": 14,
        "planned_handover_at": None,
    }
    payload.update(overrides)
    return JobSnapshot.model_validate(payload)


def build_draft(*steps: OutreachPlanDraftStep) -> OutreachPlanDraft:
    return OutreachPlanDraft(steps=list(steps))


def build_generated_draft_batch(*drafts: OutreachPlanGeneratedCommunicationDraft) -> OutreachPlanGeneratedCommunicationDraftBatch:
    return OutreachPlanGeneratedCommunicationDraftBatch(drafts=list(drafts))


def test_repository_can_replace_and_list_outreach_plan_steps(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    app = create_app(settings)
    repository = DocumentRepository(settings)

    first = repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-1",
                "job_id": "job-123",
                "type": "email",
                "sender": "you",
                "headline": "Email follow-up",
                "scheduled_for": "2026-04-01T11:00:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ],
    )

    assert len(first) == 1
    assert first[0]["headline"] == "Email follow-up"

    second = repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-2",
                "job_id": "job-123",
                "type": "call",
                "sender": "you",
                "headline": "Call for payment update",
                "scheduled_for": "2026-04-02T09:30:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ],
    )

    assert len(second) == 1
    assert second[0]["id"] == "step-2"
    assert repository.list_outreach_plan_steps("job-123")[0]["type"] == "call"
    assert app is not None


def test_repository_can_store_whatsapp_outreach_plan_steps(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    init_db(settings)
    repository = DocumentRepository(settings)

    stored = repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-whatsapp",
                "job_id": "job-123",
                "type": "whatsapp",
                "sender": "collexis",
                "headline": "WhatsApp follow-up",
                "scheduled_for": "2026-04-01T10:15:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ],
    )

    assert [step["type"] for step in stored] == ["whatsapp"]


def test_replace_outreach_plan_steps_clears_stale_drafts(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    init_db(settings)
    repository = DocumentRepository(settings)
    repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-1",
                "job_id": "job-123",
                "type": "email",
                "sender": "collexis",
                "headline": "Email follow-up",
                "scheduled_for": "2026-04-01T11:00:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ],
    )
    repository.create_outreach_plan_drafts(
        "job-123",
        drafts=[
            {
                "plan_step_id": "step-1",
                "subject": "Initial subject",
                "body": "Initial body",
            }
        ],
    )

    repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-2",
                "job_id": "job-123",
                "type": "call",
                "sender": "collexis",
                "headline": "Call follow-up",
                "scheduled_for": "2026-04-02T09:30:00+01:00",
                "created_at": "2026-03-30T11:00:00+01:00",
                "updated_at": "2026-03-30T11:00:00+01:00",
            }
        ],
    )

    assert repository.list_outreach_plan_drafts("job-123") == []


def test_init_db_migrates_outreach_plan_table_to_allow_whatsapp(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    settings.ensure_directories()
    with connect(settings) as conn:
        conn.executescript(
            """
            CREATE TABLE outreach_plan_steps (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('email', 'text', 'call', 'letter-warning', 'letter-of-claim', 'initiate-legal-action')),
                sender TEXT NOT NULL CHECK (sender IN ('you', 'collexis')),
                headline TEXT NOT NULL,
                scheduled_for TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX idx_outreach_plan_steps_job_scheduled
            ON outreach_plan_steps (job_id, scheduled_for ASC, created_at ASC);

            INSERT INTO outreach_plan_steps (
                id, job_id, type, sender, headline, scheduled_for, created_at, updated_at
            ) VALUES (
                'legacy-step', 'job-123', 'email', 'collexis', 'Legacy email', '2026-04-01T11:00:00+01:00', '2026-03-30T10:00:00+01:00', '2026-03-30T10:00:00+01:00'
            );
            """
        )
        conn.commit()

    init_db(settings)

    repository = DocumentRepository(settings)
    legacy = repository.list_outreach_plan_steps("job-123")
    assert [step["id"] for step in legacy] == ["legacy-step"]

    stored = repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "migrated-whatsapp-step",
                "job_id": "job-123",
                "type": "whatsapp",
                "sender": "collexis",
                "headline": "WhatsApp follow-up",
                "scheduled_for": "2026-04-01T10:15:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ],
    )

    assert [step["type"] for step in stored] == ["whatsapp"]


def test_init_db_migrates_text_channels_to_sms(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    settings.ensure_directories()
    with connect(settings) as conn:
        conn.executescript(
            """
            CREATE TABLE timeline_items (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                category TEXT NOT NULL CHECK (category IN ('due-date', 'collexis-handover', 'chase', 'conversation', 'letter', 'other')),
                subtype TEXT NULL CHECK (subtype IN ('email', 'text', 'whatsapp', 'facebook', 'voicemail', 'home-visit', 'phone', 'in-person')),
                sender TEXT NULL CHECK (sender IN ('you', 'collexis')),
                date TEXT NOT NULL,
                short_description TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX idx_timeline_items_job_date
            ON timeline_items (job_id, date ASC, created_at ASC);

            CREATE TABLE outreach_plan_steps (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('email', 'text', 'whatsapp', 'call', 'letter-warning', 'letter-of-claim', 'initiate-legal-action')),
                sender TEXT NOT NULL CHECK (sender IN ('you', 'collexis')),
                headline TEXT NOT NULL,
                scheduled_for TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX idx_outreach_plan_steps_job_scheduled
            ON outreach_plan_steps (job_id, scheduled_for ASC, created_at ASC);

            INSERT INTO timeline_items (
                id, job_id, category, subtype, sender, date, short_description, details, created_at, updated_at
            ) VALUES (
                'legacy-sms', 'job-123', 'chase', 'text', 'you', '2026-03-11', 'SMS reminder', 'Legacy SMS chase.', '2026-03-30T10:00:00+01:00', '2026-03-30T10:00:00+01:00'
            );

            INSERT INTO timeline_items (
                id, job_id, category, subtype, sender, date, short_description, details, created_at, updated_at
            ) VALUES (
                'legacy-handover', 'job-123', 'collexis-handover', NULL, 'collexis', '2026-03-12', 'Legacy handover', 'Legacy handover marker.', '2026-03-30T10:00:00+01:00', '2026-03-30T10:00:00+01:00'
            );

            INSERT INTO outreach_plan_steps (
                id, job_id, type, sender, headline, scheduled_for, created_at, updated_at
            ) VALUES (
                'legacy-plan-sms', 'job-123', 'text', 'collexis', 'Legacy SMS reminder', '2026-04-01T10:15:00+01:00', '2026-03-30T10:00:00+01:00', '2026-03-30T10:00:00+01:00'
            );
            """
        )
        conn.commit()

    init_db(settings)

    repository = DocumentRepository(settings)
    timeline_items = repository.list_timeline_for_job("job-123")
    plan_steps = repository.list_outreach_plan_steps("job-123")

    assert timeline_items[0]["subtype"] == "sms"
    assert any(item["category"] == "handover-letter" for item in timeline_items)
    assert plan_steps[0]["type"] == "sms"


def test_repository_can_create_update_and_join_outreach_plan_drafts(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    init_db(settings)
    repository = DocumentRepository(settings)
    repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-1",
                "job_id": "job-123",
                "type": "email",
                "sender": "collexis",
                "headline": "Email follow-up",
                "scheduled_for": "2026-04-01T11:00:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ],
    )

    created = repository.create_outreach_plan_drafts(
        "job-123",
        drafts=[
            {
                "plan_step_id": "step-1",
                "subject": "Payment reminder",
                "body": "Please arrange payment.",
            }
        ],
    )

    assert len(created) == 1
    assert created[0]["subject"] == "Payment reminder"
    assert created[0]["is_user_edited"] is False

    updated = repository.update_outreach_plan_draft(
        str(created[0]["id"]),
        subject="Updated reminder",
        body="Please arrange payment today.",
        is_user_edited=True,
    )
    assert updated["subject"] == "Updated reminder"
    assert updated["is_user_edited"] is True

    enriched = repository.list_outreach_plan_steps_with_drafts("job-123")
    assert enriched[0]["draft"]["body"] == "Please arrange payment today."


def test_generate_outreach_plan_enforces_legal_offsets_and_cadence() -> None:
    now = datetime.fromisoformat("2026-03-30T08:00:00+01:00")
    job_snapshot = build_job_snapshot(planned_handover_at="2026-03-10T09:00:00+00:00")
    timeline_items = [
        {
            "id": "handover",
            "category": "handover-letter",
            "subtype": None,
            "sender": "collexis",
            "date": "2026-03-10",
            "short_description": "Case handed to Collexis",
            "details": "",
        }
    ]
    documents = [
        {
            "id": "doc-1",
            "status": "ready",
            "title": "Email chain",
            "communication_date": "2026-03-11",
            "description": "Latest debtor replies.",
            "transcript": "sender: Patricia",
        }
    ]

    plan = generate_outreach_plan(
        job_snapshot=job_snapshot,
        timeline_items=timeline_items,
        documents=documents,
        settings=build_settings(Path.cwd()),
        now=now,
        drafter=lambda **_kwargs: build_draft(
            OutreachPlanDraftStep(
                type="sms",
                sender="collexis",
                headline="Check if insurer has responded",
                scheduled_for="2026-04-01T10:15:00+01:00",
            ),
            OutreachPlanDraftStep(
                type="call",
                sender="collexis",
                headline="Morning call for payment update",
                scheduled_for="2026-04-02T09:30:00+01:00",
            ),
        ),
    )

    assert any(step["type"] == "call" for step in plan)
    assert any(step["type"] == "email" for step in plan)
    assert any(step["type"] == "sms" for step in plan)

    warning_step = next(step for step in plan if step["type"] == "letter-warning")
    claim_step = next(step for step in plan if step["type"] == "letter-of-claim")
    initiate_step = next(step for step in plan if step["type"] == "initiate-legal-action")
    assert warning_step["scheduled_for"].startswith("2026-03-31T09:00")
    assert claim_step["scheduled_for"].startswith("2026-04-07T09:00")
    assert initiate_step["scheduled_for"].startswith("2026-05-07T09:00")


def test_generate_outreach_plan_keeps_pre_handover_steps_before_boundary() -> None:
    handover_at = "2026-04-05T09:00:00+01:00"
    plan = generate_outreach_plan(
        job_snapshot=build_job_snapshot(planned_handover_at=handover_at),
        timeline_items=[],
        documents=[],
        settings=build_settings(Path.cwd()),
        now=datetime.fromisoformat("2026-03-30T08:00:00+01:00"),
        drafter=lambda **_kwargs: build_draft(
            OutreachPlanDraftStep(
                type="email",
                sender="collexis",
                headline="Email reminder to settle",
                scheduled_for="2026-04-01T11:00:00+01:00",
            ),
            OutreachPlanDraftStep(
                type="letter-warning",
                sender="collexis",
                headline="Final warning before legal action",
                scheduled_for="2026-04-06T09:00:00+01:00",
            ),
        ),
    )

    assert all(step["type"] != "letter-warning" for step in plan)
    assert all(step["type"] != "letter-of-claim" for step in plan)
    assert all(step["type"] != "initiate-legal-action" for step in plan)
    assert all(step["scheduled_for"] < handover_at for step in plan)


def test_generate_outreach_plan_skips_calls_without_phone() -> None:
    plan = generate_outreach_plan(
        job_snapshot=build_job_snapshot(phones=[]),
        timeline_items=[],
        documents=[],
        settings=build_settings(Path.cwd()),
        now=datetime.fromisoformat("2026-03-30T08:00:00+01:00"),
        drafter=lambda **_kwargs: build_draft(
            OutreachPlanDraftStep(
                type="email",
                sender="you",
                headline="Email reminder",
                scheduled_for="2026-03-31T11:00:00+01:00",
            )
        ),
    )

    assert all(step["type"] != "call" for step in plan)


def test_generate_outreach_plan_prefers_sms_when_email_missing() -> None:
    plan = generate_outreach_plan(
        job_snapshot=build_job_snapshot(emails=[]),
        timeline_items=[
            {
                "id": "old-sms",
                "category": "chase",
                "subtype": "sms",
                "sender": "you",
                "date": "2026-03-25",
                "short_description": "SMS sent",
                "details": "",
            }
        ],
        documents=[],
        settings=build_settings(Path.cwd()),
        now=datetime.fromisoformat("2026-03-30T08:00:00+01:00"),
        drafter=lambda **_kwargs: build_draft(),
    )

    assert any(step["type"] == "sms" for step in plan)
    assert all(step["type"] != "email" for step in plan)


def test_outreach_planning_prompt_marks_context_instructions_as_high_priority() -> None:
    from backend.app.outreach_planning import OUTREACH_PLANNING_PROMPT

    assert "Treat explicit instructions in context_instructions as high-priority operating constraints." in OUTREACH_PLANNING_PROMPT
    assert "If context_instructions says to use or avoid a channel, follow that instruction over the default cadence/mixing preference." in OUTREACH_PLANNING_PROMPT
    assert "treat it as a debtor/client email reply that Collexis has just received in response to Collexis outreach" in OUTREACH_PLANNING_PROMPT
    assert "It is not an outbound message from Collexis to the debtor." in OUTREACH_PLANNING_PROMPT


def test_generate_outreach_plan_uses_existing_warning_before_claim() -> None:
    plan = generate_outreach_plan(
        job_snapshot=build_job_snapshot(status="Letter of Action sent", planned_handover_at="2026-03-10T09:00:00+00:00"),
        timeline_items=[
            {
                "id": "warning",
                "category": "letter",
                "subtype": None,
                "sender": "you",
                "date": "2026-03-10",
                "short_description": "Letter of Action posted",
                "details": "Final warning before legal action.",
            }
        ],
        documents=[],
        settings=build_settings(Path.cwd()),
        now=datetime.fromisoformat("2026-03-30T08:00:00+01:00"),
        drafter=lambda **_kwargs: build_draft(),
    )

    assert all(step["type"] != "letter-warning" for step in plan)
    claim_step = next(step for step in plan if step["type"] == "letter-of-claim")
    assert claim_step["scheduled_for"].startswith("2026-03-31T09:00")


def test_generate_outreach_plan_favors_active_written_channel() -> None:
    plan = generate_outreach_plan(
        job_snapshot=build_job_snapshot(),
        timeline_items=[
            {
                "id": "sms-1",
                "category": "chase",
                "subtype": "sms",
                "sender": "you",
                "date": "2026-03-20",
                "short_description": "SMS reminder",
                "details": "",
            },
            {
                "id": "sms-2",
                "category": "chase",
                "subtype": "sms",
                "sender": "you",
                "date": "2026-03-24",
                "short_description": "SMS reminder",
                "details": "",
            },
            {
                "id": "email-1",
                "category": "chase",
                "subtype": "email",
                "sender": "you",
                "date": "2026-03-18",
                "short_description": "Email reminder",
                "details": "",
            },
        ],
        documents=[],
        settings=build_settings(Path.cwd()),
        now=datetime.fromisoformat("2026-03-30T08:00:00+01:00"),
        drafter=lambda **_kwargs: build_draft(),
    )

    earliest_written = next(step for step in plan if step["type"] in {"email", "sms"})
    assert earliest_written["type"] == "sms"


def test_generate_outreach_plan_prefers_whatsapp_when_case_activity_is_whatsapp() -> None:
    plan = generate_outreach_plan(
        job_snapshot=build_job_snapshot(),
        timeline_items=[
            {
                "id": "whatsapp-1",
                "category": "conversation",
                "subtype": "whatsapp",
                "sender": None,
                "date": "2026-03-27",
                "short_description": "WhatsApp reply from debtor",
                "details": "Debtor replied on WhatsApp and said payment should land this week.",
            },
            {
                "id": "email-1",
                "category": "chase",
                "subtype": "email",
                "sender": "collexis",
                "date": "2026-03-18",
                "short_description": "Email reminder",
                "details": "",
            },
            {
                "id": "sms-1",
                "category": "chase",
                "subtype": "sms",
                "sender": "collexis",
                "date": "2026-03-16",
                "short_description": "SMS reminder",
                "details": "",
            },
        ],
        documents=[],
        settings=build_settings(Path.cwd()),
        now=datetime.fromisoformat("2026-03-30T08:00:00+01:00"),
        drafter=lambda **_kwargs: build_draft(),
    )

    earliest_written = next(step for step in plan if step["type"] in {"email", "sms", "whatsapp"})
    assert earliest_written["type"] == "whatsapp"
    assert any(step["type"] == "whatsapp" for step in plan)


def test_ensure_outreach_plan_drafts_only_creates_missing_next_week_drafts() -> None:
    now = datetime.fromisoformat("2026-03-30T08:00:00+01:00")
    plan_steps = [
        {
            "id": "step-email",
            "job_id": "job-123",
            "type": "email",
            "sender": "collexis",
            "headline": "Email follow-up",
            "scheduled_for": "2026-03-31T11:00:00+01:00",
            "created_at": "2026-03-30T10:00:00+01:00",
            "updated_at": "2026-03-30T10:00:00+01:00",
        },
        {
            "id": "step-call",
            "job_id": "job-123",
            "type": "call",
            "sender": "collexis",
            "headline": "Call follow-up",
            "scheduled_for": "2026-04-02T09:30:00+01:00",
            "created_at": "2026-03-30T10:00:00+01:00",
            "updated_at": "2026-03-30T10:00:00+01:00",
        },
        {
            "id": "step-legal",
            "job_id": "job-123",
            "type": "initiate-legal-action",
            "sender": "collexis",
            "headline": "Initiate legal action",
            "scheduled_for": "2026-04-03T09:00:00+01:00",
            "created_at": "2026-03-30T10:00:00+01:00",
            "updated_at": "2026-03-30T10:00:00+01:00",
        },
        {
            "id": "step-far",
            "job_id": "job-123",
            "type": "sms",
            "sender": "collexis",
            "headline": "Far-future SMS",
            "scheduled_for": "2026-04-10T10:15:00+01:00",
            "created_at": "2026-03-30T10:00:00+01:00",
            "updated_at": "2026-03-30T10:00:00+01:00",
        },
    ]
    existing_drafts = [
        {
            "id": "draft-existing",
            "job_id": "job-123",
            "plan_step_id": "step-call",
            "subject": None,
            "body": "Existing call script",
            "is_user_edited": True,
            "created_at": datetime.fromisoformat("2026-03-30T10:00:00+01:00"),
            "updated_at": datetime.fromisoformat("2026-03-30T10:00:00+01:00"),
        }
    ]
    captured: dict[str, object] = {}

    created = ensure_outreach_plan_drafts(
        job_snapshot=build_job_snapshot(),
        timeline_items=[],
        documents=[],
        plan_steps=plan_steps,
        existing_drafts=existing_drafts,
        settings=build_settings(Path.cwd()),
        now=now,
        drafter=lambda **kwargs: (
            captured.update({"target_steps": kwargs["target_steps"]})
            or build_generated_draft_batch(
                OutreachPlanGeneratedCommunicationDraft(
                    plan_step_id="step-email",
                    subject="Payment reminder",
                    body="Please arrange payment today.",
                ),
            )
        ),
    )

    assert [step["id"] for step in captured["target_steps"]] == ["step-email"]
    assert created == [
        {
            "plan_step_id": "step-email",
            "subject": "Payment reminder",
            "body": "Please arrange payment today.",
            "is_user_edited": False,
        }
    ]


def test_outreach_plan_api_uses_latest_job_snapshot_and_ready_documents_only(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    repository = DocumentRepository(settings)
    ready_document = repository.create(
        job_id="job-123",
        original_filename="ready.pdf",
        mime_type="application/pdf",
        storage_path=str(settings.uploads_dir / "ready.pdf"),
    )
    repository.update_fields(
        ready_document["id"],
        status="ready",
        title="Ready doc",
        communication_date="2026-03-20",
        description="Ready description",
        transcript="Ready transcript",
    )
    failed_document = repository.create(
        job_id="job-123",
        original_filename="failed.pdf",
        mime_type="application/pdf",
        storage_path=str(settings.uploads_dir / "failed.pdf"),
    )
    repository.update_fields(
        failed_document["id"],
        status="failed",
        title="Failed doc",
        communication_date="2026-03-21",
        description="Failed description",
        transcript="Failed transcript",
        extraction_error="boom",
    )

    captured: dict[str, object] = {}

    def fake_generator(**kwargs: object) -> list[dict[str, object]]:
        captured["job_snapshot"] = kwargs["job_snapshot"]
        captured["documents"] = kwargs["documents"]
        return [
            {
                "id": "generated-1",
                "job_id": "job-123",
                "type": "email",
                "sender": "collexis",
                "headline": "Email follow-up",
                "scheduled_for": "2026-04-01T11:00:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ]

    client.app.state.outreach_plan_generator = fake_generator

    response = client.post(
        "/jobs/job-123/outreach-plan/generate",
        json={
            "job_snapshot": {
                "id": "job-123",
                "name": "Updated Name",
                "address": "14 Elmfield Road",
                "job_description": "Burst pipe repair",
                "job_detail": "Updated detail",
                "due_date": "2026-02-01",
                "price": 1420,
                "amount_paid": 0,
                "days_overdue": 58,
                "status": "Stern chase",
                "emails": ["p.whitmore@btinternet.com"],
                "phones": ["07712334891"],
                "context_instructions": "Morning calls preferred.",
            }
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body[0]["headline"] == "Email follow-up"
    assert body[0]["draft"] is None
    assert captured["job_snapshot"].name == "Updated Name"
    assert [document["id"] for document in captured["documents"] if document["status"] == "ready"] == [ready_document["id"]]


def test_outreach_plan_api_regenerate_replaces_existing_steps(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)

    first_batch = [
        {
            "id": "generated-1",
            "job_id": "job-123",
            "type": "email",
            "sender": "you",
            "headline": "First email",
            "scheduled_for": "2026-04-01T11:00:00+01:00",
            "created_at": "2026-03-30T10:00:00+01:00",
            "updated_at": "2026-03-30T10:00:00+01:00",
        }
    ]
    second_batch = [
        {
            "id": "generated-2",
            "job_id": "job-123",
            "type": "call",
            "sender": "you",
            "headline": "Second plan call",
            "scheduled_for": "2026-04-02T09:30:00+01:00",
            "created_at": "2026-03-30T11:00:00+01:00",
            "updated_at": "2026-03-30T11:00:00+01:00",
        }
    ]
    batches = iter([first_batch, second_batch])
    client.app.state.outreach_plan_generator = lambda **_kwargs: next(batches)
    client.app.state.outreach_plan_draft_ensurer = lambda **_kwargs: []

    payload = {"job_snapshot": build_job_snapshot().model_dump(mode="json")}
    first_response = client.post("/jobs/job-123/outreach-plan/generate", json=payload)
    second_response = client.post("/jobs/job-123/outreach-plan/generate", json=payload)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    listed = client.get("/jobs/job-123/outreach-plan")
    assert listed.status_code == 200
    assert [step["id"] for step in listed.json()] == ["generated-2"]
    assert listed.json()[0]["type"] == "call"


def test_outreach_plan_generate_api_returns_plan_without_creating_drafts(tmp_path: Path) -> None:
    client, _settings = build_client(tmp_path)
    client.app.state.outreach_plan_generator = lambda **_kwargs: [
        {
            "id": "generated-1",
            "job_id": "job-123",
            "type": "email",
            "sender": "collexis",
            "headline": "Email follow-up",
            "scheduled_for": "2026-04-01T11:00:00+01:00",
            "created_at": "2026-03-30T10:00:00+01:00",
            "updated_at": "2026-03-30T10:00:00+01:00",
        }
    ]

    response = client.post(
        "/jobs/job-123/outreach-plan/generate",
        json={"job_snapshot": build_job_snapshot().model_dump(mode="json")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body[0]["draft"] is None


def test_inbound_email_reply_api_records_reply_and_replans(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    captured: dict[str, object] = {}

    def fake_generator(**kwargs: object) -> list[dict[str, object]]:
        captured["incoming_reply_context"] = kwargs["incoming_reply_context"]
        captured["timeline_items"] = kwargs["timeline_items"]
        return [
            {
                "id": "generated-1",
                "job_id": "job-123",
                "type": "email",
                "sender": "collexis",
                "headline": "Reply to debtor email",
                "scheduled_for": "2026-04-01T11:00:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ]

    client.app.state.outreach_plan_generator = fake_generator
    client.app.state.outreach_plan_draft_ensurer = lambda **_kwargs: []

    response = client.post(
        "/jobs/job-123/inbound-email-replies",
        json={
            "job_snapshot": build_job_snapshot().model_dump(mode="json"),
            "reply": {
                "from_email": "p.whitmore@btinternet.com",
                "from_name": "Patricia Whitmore",
                "received_at": "2026-03-30T08:45:00+01:00",
                "subject": "Re: Invoice #001",
                "body": "I am waiting on the insurer and will update you on Friday.",
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["timeline_item"]["category"] == "conversation"
    assert body["timeline_item"]["subtype"] == "email"
    assert body["timeline_item"]["sender"] is None
    assert body["timeline_item"]["short_description"] == "Email reply from Patricia Whitmore"
    assert "Subject: Re: Invoice #001" in body["timeline_item"]["details"]
    assert body["plan_steps"][0]["headline"] == "Reply to debtor email"

    incoming_reply = captured["incoming_reply_context"]
    assert incoming_reply.subject == "Re: Invoice #001"
    assert incoming_reply.body == "I am waiting on the insurer and will update you on Friday."

    timeline_items = captured["timeline_items"]
    assert timeline_items[-1]["short_description"] == "Email reply from Patricia Whitmore"
    assert timeline_items[-1]["sender"] is None

    repository = DocumentRepository(settings)
    stored_timeline = repository.list_timeline_for_job("job-123")
    assert any(item["short_description"] == "Email reply from Patricia Whitmore" for item in stored_timeline)


def test_inbound_email_job_inference_api_uses_configured_inferer(tmp_path: Path) -> None:
    client, _settings = build_client(tmp_path)

    client.app.state.inbound_email_job_inferer = lambda **_kwargs: {
        "job_id": "job-123",
        "confidence": 0.91,
        "rationale": "The sender email and invoice wording match Patricia Whitmore.",
    }

    response = client.post(
        "/jobs/infer-inbound-email-job",
        json={
            "reply": {
                "from_email": "p.whitmore@btinternet.com",
                "from_name": "Patricia Whitmore",
                "subject": "Re: Invoice #001",
                "body": "I am waiting on the insurer.",
            },
            "job_candidates": [
                build_job_snapshot().model_dump(mode="json"),
                build_job_snapshot(
                    id="job-456",
                    name="Maya Holt",
                    emails=["accounts@holtcommercial.co.uk"],
                    address="2 Foundry Yard",
                ).model_dump(mode="json"),
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == "job-123"
    assert body["confidence"] == 0.91


def test_outreach_plan_drafts_ensure_api_adds_missing_drafts_without_replacing_existing(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    repository = DocumentRepository(settings)
    repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-1",
                "job_id": "job-123",
                "type": "email",
                "sender": "collexis",
                "headline": "Email follow-up",
                "scheduled_for": "2026-04-01T11:00:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            },
            {
                "id": "step-2",
                "job_id": "job-123",
                "type": "call",
                "sender": "collexis",
                "headline": "Call follow-up",
                "scheduled_for": "2026-04-02T09:30:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            },
        ],
    )
    existing = repository.create_outreach_plan_drafts(
        "job-123",
        drafts=[
            {
                "plan_step_id": "step-1",
                "subject": "Existing subject",
                "body": "Existing email body",
                "is_user_edited": True,
            }
        ],
    )
    client.app.state.outreach_plan_draft_ensurer = lambda **_kwargs: [
        {
            "plan_step_id": "step-2",
            "subject": None,
            "body": "Call script",
            "is_user_edited": False,
        }
    ]

    response = client.post(
        "/jobs/job-123/outreach-plan/drafts/ensure",
        json={"job_snapshot": build_job_snapshot().model_dump(mode="json")},
    )

    assert response.status_code == 200
    body = response.json()
    step_1 = next(step for step in body if step["id"] == "step-1")
    step_2 = next(step for step in body if step["id"] == "step-2")
    assert step_1["draft"]["id"] == str(existing[0]["id"])
    assert step_1["draft"]["is_user_edited"] is True
    assert step_2["draft"]["body"] == "Call script"


def test_outreach_plan_draft_patch_marks_draft_as_user_edited(tmp_path: Path) -> None:
    client, settings = build_client(tmp_path)
    repository = DocumentRepository(settings)
    repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-1",
                "job_id": "job-123",
                "type": "email",
                "sender": "collexis",
                "headline": "Email follow-up",
                "scheduled_for": "2026-04-01T11:00:00+01:00",
                "created_at": "2026-03-30T10:00:00+01:00",
                "updated_at": "2026-03-30T10:00:00+01:00",
            }
        ],
    )
    created = repository.create_outreach_plan_drafts(
        "job-123",
        drafts=[
            {
                "plan_step_id": "step-1",
                "subject": "Initial subject",
                "body": "Initial body",
            }
        ],
    )

    response = client.patch(
        f"/outreach-plan-drafts/{created[0]['id']}",
        json={
            "subject": "Updated subject",
            "body": "Updated body",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == "Updated subject"
    assert body["body"] == "Updated body"
    assert body["is_user_edited"] is True


def test_process_due_outreach_sends_due_email_and_marks_step_sent(tmp_path: Path, monkeypatch) -> None:
    settings = build_settings(tmp_path)
    init_db(settings)
    repository = DocumentRepository(settings)
    repository.replace_outreach_plan_steps(
        "job-123",
        steps=[
            {
                "id": "step-email",
                "job_id": "job-123",
                "type": "email",
                "sender": "collexis",
                "headline": "Email follow-up",
                "scheduled_for": "2026-03-30T09:00:00+01:00",
                "recipient_emails": ["p.whitmore@btinternet.com"],
                "created_at": "2026-03-29T10:00:00+01:00",
                "updated_at": "2026-03-29T10:00:00+01:00",
            }
        ],
    )
    repository.create_outreach_plan_drafts(
        "job-123",
        drafts=[
            {
                "plan_step_id": "step-email",
                "subject": "Invoice reminder",
                "body": "Please arrange payment today.",
            }
        ],
    )

    captured: dict[str, object] = {}

    def fake_send_brevo_email(*, settings: Settings, recipients: list[dict[str, str]], subject: str, text_content: str) -> dict[str, str | None]:
        captured["settings"] = settings
        captured["recipients"] = recipients
        captured["subject"] = subject
        captured["text_content"] = text_content
        return {"message_id": "brevo-message-1"}

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            frozen = datetime.fromisoformat("2026-03-30T10:05:00+01:00")
            if tz is None:
                return frozen.replace(tzinfo=None)
            return frozen.astimezone(tz)

        @classmethod
        def utcnow(cls):
            return datetime.fromisoformat("2026-03-30T09:05:00+00:00").replace(tzinfo=None)

    monkeypatch.setattr("backend.app.scheduled_outreach.send_brevo_email", fake_send_brevo_email)
    monkeypatch.setattr("backend.app.scheduled_outreach.datetime", FrozenDateTime)

    processed_count = process_due_outreach_once(
        settings=settings,
        draft_ensurer=lambda **_kwargs: [],
    )

    assert processed_count == 1
    assert captured["recipients"] == [{"email": "p.whitmore@btinternet.com"}]
    assert captured["subject"] == "Invoice reminder"
    assert captured["text_content"] == "Please arrange payment today."

    stored_step = repository.get_outreach_plan_step("step-email")
    assert stored_step is not None
    assert stored_step["delivery_status"] == "sent"
    assert stored_step["provider_message_id"] == "brevo-message-1"

    timeline_items = repository.list_timeline_for_job("job-123")
    assert timeline_items[-1]["short_description"] == "Invoice reminder"
    assert "Please arrange payment today." in timeline_items[-1]["details"]
