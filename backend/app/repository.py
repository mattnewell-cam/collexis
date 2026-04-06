from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .config import Settings
from .database import connect


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def normalize_sms_channel(value: Any) -> Any:
    if value == "text":
        return "sms"
    return value


def normalize_sms_headline(value: Any, *, step_type: Any) -> Any:
    headline = str(value) if isinstance(value, str) else value
    if normalize_sms_channel(step_type) != "sms" or not isinstance(headline, str):
        return headline
    if headline.startswith("Text:"):
        return f"SMS:{headline[len('Text:'):]}"
    if headline.startswith("Text "):
        return f"SMS {headline[len('Text '):]}"
    return headline


def filename_stem(filename: str) -> str:
    return Path(filename).stem.strip() or "Untitled document"


def row_to_document(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "original_filename": row["original_filename"],
        "mime_type": row["mime_type"],
        "storage_path": row["storage_path"],
        "status": row["status"],
        "title": row["title"],
        "communication_date": row["communication_date"],
        "description": row["description"],
        "transcript": row["transcript"],
        "extraction_error": row["extraction_error"],
        "created_at": datetime.fromisoformat(row["created_at"]),
        "updated_at": datetime.fromisoformat(row["updated_at"]),
    }


def row_to_timeline_item(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "category": row["category"],
        "subtype": normalize_sms_channel(row["subtype"]),
        "sender": row["sender"],
        "recipient": row["recipient"] if "recipient" in row.keys() else None,
        "date": row["date"],
        "short_description": row["short_description"],
        "details": row["details"],
        "response_classification": row["response_classification"] if "response_classification" in row.keys() else None,
        "response_action": row["response_action"] if "response_action" in row.keys() else None,
        "stated_deadline": row["stated_deadline"] if "stated_deadline" in row.keys() else None,
        "computed_deadline": row["computed_deadline"] if "computed_deadline" in row.keys() else None,
        "created_at": datetime.fromisoformat(row["created_at"]),
        "updated_at": datetime.fromisoformat(row["updated_at"]),
    }


def row_to_outreach_plan_step(row: Any) -> dict[str, Any]:
    raw_recipient_emails = row["recipient_emails"] if "recipient_emails" in row.keys() else "[]"
    if isinstance(raw_recipient_emails, str):
        try:
            recipient_emails = [
                str(email).strip().lower()
                for email in json.loads(raw_recipient_emails)
                if str(email).strip()
            ]
        except json.JSONDecodeError:
            recipient_emails = []
    elif isinstance(raw_recipient_emails, list):
        recipient_emails = [str(email).strip().lower() for email in raw_recipient_emails if str(email).strip()]
    else:
        recipient_emails = []

    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "type": normalize_sms_channel(row["type"]),
        "sender": row["sender"],
        "headline": normalize_sms_headline(row["headline"], step_type=row["type"]),
        "scheduled_for": row["scheduled_for"],
        "recipient_emails": recipient_emails,
        "delivery_status": row["delivery_status"] if "delivery_status" in row.keys() else "pending",
        "processing_started_at": row["processing_started_at"] if "processing_started_at" in row.keys() else None,
        "sent_at": row["sent_at"] if "sent_at" in row.keys() else None,
        "failed_at": row["failed_at"] if "failed_at" in row.keys() else None,
        "attempt_count": int(row["attempt_count"]) if "attempt_count" in row.keys() and row["attempt_count"] is not None else 0,
        "last_error": row["last_error"] if "last_error" in row.keys() else None,
        "provider_message_id": row["provider_message_id"] if "provider_message_id" in row.keys() else None,
        "created_at": datetime.fromisoformat(row["created_at"]),
        "updated_at": datetime.fromisoformat(row["updated_at"]),
    }


def row_to_outreach_plan_draft(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "plan_step_id": row["plan_step_id"],
        "subject": row["subject"],
        "body": row["body"],
        "is_user_edited": bool(row["is_user_edited"]),
        "created_at": datetime.fromisoformat(row["created_at"]),
        "updated_at": datetime.fromisoformat(row["updated_at"]),
    }


@dataclass(slots=True)
class SQLiteDocumentRepository:
    settings: Settings

    def list_all(self) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT * FROM documents
                ORDER BY created_at DESC
                """
            ).fetchall()
        documents = [row_to_document(row) for row in rows]
        self._attach_timeline_links(documents)
        return documents

    def list_for_job(self, job_id: str) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT * FROM documents
                WHERE job_id = ?
                ORDER BY created_at DESC
                """,
                (job_id,),
            ).fetchall()
        documents = [row_to_document(row) for row in rows]
        self._attach_timeline_links(documents)
        return documents

    def get(self, document_id: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE id = ?",
                (document_id,),
            ).fetchone()
        if not row:
            return None
        document = row_to_document(row)
        document["linked_timeline_item_ids"] = self.list_linked_timeline_item_ids(document_id)
        return document

    def create(
        self,
        *,
        job_id: str,
        original_filename: str,
        mime_type: str,
        storage_path: str,
    ) -> dict[str, Any]:
        document_id = str(uuid4())
        now = utc_now()
        title = filename_stem(original_filename)
        with connect(self.settings) as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    id, job_id, original_filename, mime_type, storage_path, status,
                    title, communication_date, description, transcript,
                    extraction_error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document_id,
                    job_id,
                    original_filename,
                    mime_type,
                    storage_path,
                    "processing",
                    title,
                    None,
                    "",
                    "",
                    None,
                    now,
                    now,
                ),
            )
            conn.commit()
        document = self.get(document_id)
        if document is None:
            raise RuntimeError("Created document could not be loaded.")
        return document

    def build_storage_path(self, job_id: str, document_id: str, extension: str) -> str:
        return str(self.settings.uploads_dir / f"{document_id}{extension}")

    def write_file(self, storage_path: str, content: bytes, mime_type: str) -> None:
        del mime_type
        self.settings.ensure_directories()
        Path(storage_path).write_bytes(content)

    def read_file(self, storage_path: str) -> bytes:
        file_path = Path(storage_path)
        if not file_path.exists():
            raise FileNotFoundError(storage_path)
        return file_path.read_bytes()

    def delete_storage_path(self, storage_path: str) -> bool:
        file_path = Path(storage_path)
        if not file_path.exists():
            return False
        file_path.unlink()
        return True

    def update_fields(self, document_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            document = self.get(document_id)
            if document is None:
                raise KeyError(document_id)
            return document

        allowed = {
            "status",
            "storage_path",
            "title",
            "communication_date",
            "description",
            "transcript",
            "extraction_error",
        }
        invalid = set(fields) - allowed
        if invalid:
            raise ValueError(f"Unsupported fields: {', '.join(sorted(invalid))}")

        fields["updated_at"] = utc_now()
        assignments = ", ".join(f"{key} = ?" for key in fields)
        values = [fields[key] for key in fields]
        values.append(document_id)
        with connect(self.settings) as conn:
            cursor = conn.execute(
                f"UPDATE documents SET {assignments} WHERE id = ?",
                values,
            )
            conn.commit()
        if cursor.rowcount == 0:
            raise KeyError(document_id)
        document = self.get(document_id)
        if document is None:
            raise KeyError(document_id)
        return document

    def delete(self, document_id: str) -> dict[str, Any]:
        document = self.get(document_id)
        if document is None:
            raise KeyError(document_id)

        with connect(self.settings) as conn:
            cursor = conn.execute(
                "DELETE FROM documents WHERE id = ?",
                (document_id,),
            )
            conn.commit()

        if cursor.rowcount == 0:
            raise KeyError(document_id)
        return document

    def list_timeline_for_job(self, job_id: str) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT * FROM timeline_items
                WHERE job_id = ?
                ORDER BY date ASC, created_at ASC
                """,
                (job_id,),
            ).fetchall()
        timeline_items = [row_to_timeline_item(row) for row in rows]
        self._attach_document_links(timeline_items)
        return timeline_items

    def get_timeline_item(self, timeline_item_id: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM timeline_items WHERE id = ?",
                (timeline_item_id,),
            ).fetchone()
        if not row:
            return None
        timeline_item = row_to_timeline_item(row)
        timeline_item["linked_document_ids"] = self.list_linked_document_ids(timeline_item_id)
        return timeline_item

    def create_timeline_item(
        self,
        *,
        job_id: str,
        category: str,
        subtype: str | None,
        sender: str | None,
        date: str,
        short_description: str,
        details: str,
        recipient: str | None = None,
        response_classification: str | None = None,
        response_action: str | None = None,
        stated_deadline: str | None = None,
        computed_deadline: str | None = None,
        timeline_item_id: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
    ) -> dict[str, Any]:
        item_id = timeline_item_id or str(uuid4())
        now = created_at or utc_now()
        with connect(self.settings) as conn:
            conn.execute(
                """
                INSERT INTO timeline_items (
                    id, job_id, category, subtype, sender, recipient, date,
                    short_description, details,
                    response_classification, response_action,
                    stated_deadline, computed_deadline,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    job_id,
                    category,
                    normalize_sms_channel(subtype),
                    sender,
                    recipient,
                    date,
                    short_description,
                    details,
                    response_classification,
                    response_action,
                    stated_deadline,
                    computed_deadline,
                    now,
                    updated_at or now,
                ),
            )
            conn.commit()
        timeline_item = self.get_timeline_item(item_id)
        if timeline_item is None:
            raise RuntimeError("Created timeline item could not be loaded.")
        return timeline_item

    def update_timeline_item(self, timeline_item_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            timeline_item = self.get_timeline_item(timeline_item_id)
            if timeline_item is None:
                raise KeyError(timeline_item_id)
            return timeline_item

        allowed = {"category", "subtype", "sender", "recipient", "date", "short_description", "details", "response_classification", "response_action", "stated_deadline", "computed_deadline"}
        invalid = set(fields) - allowed
        if invalid:
            raise ValueError(f"Unsupported fields: {', '.join(sorted(invalid))}")

        if "subtype" in fields:
            fields["subtype"] = normalize_sms_channel(fields["subtype"])
        fields["updated_at"] = utc_now()
        assignments = ", ".join(f"{key} = ?" for key in fields)
        values = [fields[key] for key in fields]
        values.append(timeline_item_id)
        with connect(self.settings) as conn:
            cursor = conn.execute(
                f"UPDATE timeline_items SET {assignments} WHERE id = ?",
                values,
            )
            conn.commit()
        if cursor.rowcount == 0:
            raise KeyError(timeline_item_id)
        timeline_item = self.get_timeline_item(timeline_item_id)
        if timeline_item is None:
            raise KeyError(timeline_item_id)
        return timeline_item

    def delete_timeline_item(self, timeline_item_id: str) -> dict[str, Any]:
        timeline_item = self.get_timeline_item(timeline_item_id)
        if timeline_item is None:
            raise KeyError(timeline_item_id)

        with connect(self.settings) as conn:
            cursor = conn.execute(
                "DELETE FROM timeline_items WHERE id = ?",
                (timeline_item_id,),
            )
            conn.commit()

        if cursor.rowcount == 0:
            raise KeyError(timeline_item_id)
        return timeline_item

    def list_outreach_plan_steps(self, job_id: str) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT * FROM outreach_plan_steps
                WHERE job_id = ?
                ORDER BY scheduled_for ASC, created_at ASC
                """,
                (job_id,),
            ).fetchall()
        return [row_to_outreach_plan_step(row) for row in rows]

    def list_outreach_plan_drafts(self, job_id: str) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT * FROM outreach_plan_drafts
                WHERE job_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (job_id,),
            ).fetchall()
        return [row_to_outreach_plan_draft(row) for row in rows]

    def get_outreach_plan_step(self, step_id: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM outreach_plan_steps WHERE id = ?",
                (step_id,),
            ).fetchone()
        return row_to_outreach_plan_step(row) if row else None

    def get_outreach_plan_draft(self, draft_id: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM outreach_plan_drafts WHERE id = ?",
                (draft_id,),
            ).fetchone()
        return row_to_outreach_plan_draft(row) if row else None

    def get_outreach_plan_draft_by_step_id(self, plan_step_id: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM outreach_plan_drafts WHERE plan_step_id = ?",
                (plan_step_id,),
            ).fetchone()
        return row_to_outreach_plan_draft(row) if row else None

    def list_outreach_plan_steps_with_drafts(self, job_id: str) -> list[dict[str, Any]]:
        steps = self.list_outreach_plan_steps(job_id)
        drafts_by_step_id = {
            str(draft["plan_step_id"]): draft
            for draft in self.list_outreach_plan_drafts(job_id)
        }
        return [
            {
                **step,
                "draft": drafts_by_step_id.get(str(step["id"])),
            }
            for step in steps
        ]

    def replace_outreach_plan_steps(
        self,
        job_id: str,
        *,
        steps: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            conn.execute("DELETE FROM outreach_plan_drafts WHERE job_id = ?", (job_id,))
            conn.execute("DELETE FROM outreach_plan_steps WHERE job_id = ?", (job_id,))
            for step in steps:
                conn.execute(
                    """
                    INSERT INTO outreach_plan_steps (
                        id, job_id, type, sender, headline, scheduled_for,
                        recipient_emails, delivery_status, processing_started_at, sent_at, failed_at,
                        attempt_count, last_error, provider_message_id, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                      (
                          step["id"],
                          job_id,
                          normalize_sms_channel(step["type"]),
                          step["sender"],
                          step["headline"],
                          step["scheduled_for"],
                          json.dumps(step.get("recipient_emails") or []),
                          step.get("delivery_status") or "pending",
                          step.get("processing_started_at"),
                          step.get("sent_at"),
                          step.get("failed_at"),
                          int(step.get("attempt_count") or 0),
                          step.get("last_error"),
                          step.get("provider_message_id"),
                          step["created_at"],
                          step["updated_at"],
                    ),
                )
            conn.commit()
        return self.list_outreach_plan_steps(job_id)

    def create_outreach_plan_drafts(
        self,
        job_id: str,
        *,
        drafts: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not drafts:
            return []

        created_ids: list[str] = []
        now = utc_now()
        with connect(self.settings) as conn:
            for draft in drafts:
                draft_id = str(uuid4())
                created_ids.append(draft_id)
                conn.execute(
                    """
                    INSERT INTO outreach_plan_drafts (
                        id, job_id, plan_step_id, subject, body, is_user_edited, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        draft_id,
                        job_id,
                        draft["plan_step_id"],
                        draft.get("subject"),
                        draft["body"],
                        1 if draft.get("is_user_edited") else 0,
                        now,
                        now,
                    ),
                )
            conn.commit()

        created_by_id = {
            str(draft["id"]): draft
            for draft in (self.get_outreach_plan_draft(draft_id) for draft_id in created_ids)
            if draft is not None
        }
        return [created_by_id[draft_id] for draft_id in created_ids if draft_id in created_by_id]

    def update_outreach_plan_draft(self, draft_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            draft = self.get_outreach_plan_draft(draft_id)
            if draft is None:
                raise KeyError(draft_id)
            return draft

        allowed = {"subject", "body", "is_user_edited"}
        invalid = set(fields) - allowed
        if invalid:
            raise ValueError(f"Unsupported fields: {', '.join(sorted(invalid))}")

        if "is_user_edited" in fields:
            fields["is_user_edited"] = 1 if fields["is_user_edited"] else 0
        fields["updated_at"] = utc_now()
        assignments = ", ".join(f"{key} = ?" for key in fields)
        values = [fields[key] for key in fields]
        values.append(draft_id)
        with connect(self.settings) as conn:
            cursor = conn.execute(
                f"UPDATE outreach_plan_drafts SET {assignments} WHERE id = ?",
                values,
            )
            conn.commit()
        if cursor.rowcount == 0:
            raise KeyError(draft_id)
        draft = self.get_outreach_plan_draft(draft_id)
        if draft is None:
            raise KeyError(draft_id)
        return draft

    def list_pending_outreach_plan_email_steps(self) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT * FROM outreach_plan_steps
                WHERE type = 'email' AND delivery_status = 'pending'
                ORDER BY scheduled_for ASC, created_at ASC
                """
            ).fetchall()
        return [row_to_outreach_plan_step(row) for row in rows]

    def release_stale_outreach_plan_email_claims(self, stale_before: str) -> int:
        with connect(self.settings) as conn:
            cursor = conn.execute(
                """
                UPDATE outreach_plan_steps
                SET delivery_status = 'pending',
                    processing_started_at = NULL,
                    updated_at = ?
                WHERE type = 'email'
                  AND delivery_status = 'sending'
                  AND processing_started_at IS NOT NULL
                  AND processing_started_at < ?
                """,
                (utc_now(), stale_before),
            )
            conn.commit()
        return int(cursor.rowcount or 0)

    def claim_outreach_plan_email_step(self, step_id: str, claimed_at: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            cursor = conn.execute(
                """
                UPDATE outreach_plan_steps
                SET delivery_status = 'sending',
                    processing_started_at = ?,
                    failed_at = NULL,
                    updated_at = ?,
                    attempt_count = attempt_count + 1
                WHERE id = ? AND type = 'email' AND delivery_status = 'pending'
                """,
                (claimed_at, claimed_at, step_id),
            )
            conn.commit()
        if not cursor.rowcount:
            return None
        return self.get_outreach_plan_step(step_id)

    def increment_claimed_outreach_plan_email_step_attempt(self, step_id: str, attempt_count: int, claimed_at: str) -> dict[str, Any]:
        with connect(self.settings) as conn:
            cursor = conn.execute(
                """
                UPDATE outreach_plan_steps
                SET attempt_count = ?, processing_started_at = ?, updated_at = ?
                WHERE id = ? AND delivery_status = 'sending'
                """,
                (attempt_count, claimed_at, claimed_at, step_id),
            )
            conn.commit()
        if not cursor.rowcount:
            raise KeyError(step_id)
        step = self.get_outreach_plan_step(step_id)
        if step is None:
            raise KeyError(step_id)
        return step

    def set_outreach_plan_step_recipient_emails(self, step_id: str, recipient_emails: list[str]) -> dict[str, Any]:
        normalized = [email.strip().lower() for email in recipient_emails if email.strip()]
        with connect(self.settings) as conn:
            cursor = conn.execute(
                """
                UPDATE outreach_plan_steps
                SET recipient_emails = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(normalized), utc_now(), step_id),
            )
            conn.commit()
        if not cursor.rowcount:
            raise KeyError(step_id)
        step = self.get_outreach_plan_step(step_id)
        if step is None:
            raise KeyError(step_id)
        return step

    def mark_outreach_plan_step_sent(self, step_id: str, *, sent_at: str, provider_message_id: str | None) -> dict[str, Any]:
        with connect(self.settings) as conn:
            cursor = conn.execute(
                """
                UPDATE outreach_plan_steps
                SET delivery_status = 'sent',
                    sent_at = ?,
                    processing_started_at = NULL,
                    failed_at = NULL,
                    last_error = NULL,
                    provider_message_id = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (sent_at, provider_message_id, sent_at, step_id),
            )
            conn.commit()
        if not cursor.rowcount:
            raise KeyError(step_id)
        step = self.get_outreach_plan_step(step_id)
        if step is None:
            raise KeyError(step_id)
        return step

    def mark_outreach_plan_step_failed(self, step_id: str, *, failed_at: str, error_message: str) -> dict[str, Any]:
        with connect(self.settings) as conn:
            cursor = conn.execute(
                """
                UPDATE outreach_plan_steps
                SET delivery_status = 'failed',
                    failed_at = ?,
                    processing_started_at = NULL,
                    last_error = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (failed_at, error_message, failed_at, step_id),
            )
            conn.commit()
        if not cursor.rowcount:
            raise KeyError(step_id)
        step = self.get_outreach_plan_step(step_id)
        if step is None:
            raise KeyError(step_id)
        return step

    def delete_job(self, job_id: str) -> dict[str, int | str]:
        documents = self.list_for_job(job_id)
        unique_file_paths = []
        seen_paths: set[str] = set()

        for document in documents:
            storage_path = str(document["storage_path"])
            if storage_path and storage_path not in seen_paths:
                seen_paths.add(storage_path)
                unique_file_paths.append(Path(storage_path))

        with connect(self.settings) as conn:
            document_count = int(
                conn.execute(
                    "SELECT COUNT(*) FROM documents WHERE job_id = ?",
                    (job_id,),
                ).fetchone()[0]
            )
            timeline_item_count = int(
                conn.execute(
                    "SELECT COUNT(*) FROM timeline_items WHERE job_id = ?",
                    (job_id,),
                ).fetchone()[0]
            )
            conn.execute("DELETE FROM outreach_plan_drafts WHERE job_id = ?", (job_id,))
            conn.execute("DELETE FROM outreach_plan_steps WHERE job_id = ?", (job_id,))
            conn.execute("DELETE FROM documents WHERE job_id = ?", (job_id,))
            conn.execute("DELETE FROM timeline_items WHERE job_id = ?", (job_id,))
            conn.commit()

        deleted_file_count = 0
        for file_path in unique_file_paths:
            if not file_path.exists():
                continue
            try:
                file_path.unlink()
                deleted_file_count += 1
            except OSError:
                continue

        return {
            "job_id": job_id,
            "deleted_document_count": document_count,
            "deleted_timeline_item_count": timeline_item_count,
            "deleted_file_count": deleted_file_count,
        }

    def link_document_to_timeline_item(self, document_id: str, timeline_item_id: str) -> None:
        now = utc_now()
        with connect(self.settings) as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO document_timeline_items (document_id, timeline_item_id, created_at)
                VALUES (?, ?, ?)
                """,
                (document_id, timeline_item_id, now),
            )
            conn.commit()

    def list_linked_timeline_item_ids(self, document_id: str) -> list[str]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT timeline_item_id
                FROM document_timeline_items
                WHERE document_id = ?
                ORDER BY created_at ASC
                """,
                (document_id,),
            ).fetchall()
        return [str(row["timeline_item_id"]) for row in rows]

    def list_linked_document_ids(self, timeline_item_id: str) -> list[str]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT document_id
                FROM document_timeline_items
                WHERE timeline_item_id = ?
                ORDER BY created_at ASC
                """,
                (timeline_item_id,),
            ).fetchall()
        return [str(row["document_id"]) for row in rows]

    def _attach_timeline_links(self, documents: list[dict[str, Any]]) -> None:
        if not documents:
            return
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT document_id, timeline_item_id
                FROM document_timeline_items
                WHERE document_id IN ({placeholders})
                ORDER BY created_at ASC
                """.format(placeholders=", ".join("?" for _ in documents)),
                [str(document["id"]) for document in documents],
            ).fetchall()
        links_by_document_id: dict[str, list[str]] = {str(document["id"]): [] for document in documents}
        for row in rows:
            links_by_document_id[str(row["document_id"])].append(str(row["timeline_item_id"]))
        for document in documents:
            document["linked_timeline_item_ids"] = links_by_document_id.get(str(document["id"]), [])

    def _attach_document_links(self, timeline_items: list[dict[str, Any]]) -> None:
        if not timeline_items:
            return
        with connect(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT timeline_item_id, document_id
                FROM document_timeline_items
                WHERE timeline_item_id IN ({placeholders})
                ORDER BY created_at ASC
                """.format(placeholders=", ".join("?" for _ in timeline_items)),
                [str(item["id"]) for item in timeline_items],
            ).fetchall()
        links_by_timeline_item_id: dict[str, list[str]] = {str(item["id"]): [] for item in timeline_items}
        for row in rows:
            links_by_timeline_item_id[str(row["timeline_item_id"])].append(str(row["document_id"]))
        for timeline_item in timeline_items:
            timeline_item["linked_document_ids"] = links_by_timeline_item_id.get(str(timeline_item["id"]), [])


class DocumentRepository:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._impl = self._build_impl(settings)

    @staticmethod
    def _build_impl(settings: Settings) -> Any:
        if settings.uses_supabase:
            from .repository_supabase import SupabaseDocumentRepository

            return SupabaseDocumentRepository(settings)
        return SQLiteDocumentRepository(settings)

    def __getattr__(self, item: str) -> Any:
        return getattr(self._impl, item)
