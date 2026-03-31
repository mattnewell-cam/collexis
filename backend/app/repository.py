from __future__ import annotations

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
        "date": row["date"],
        "short_description": row["short_description"],
        "details": row["details"],
        "created_at": datetime.fromisoformat(row["created_at"]),
        "updated_at": datetime.fromisoformat(row["updated_at"]),
    }


def row_to_outreach_plan_step(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "type": normalize_sms_channel(row["type"]),
        "sender": row["sender"],
        "headline": normalize_sms_headline(row["headline"], step_type=row["type"]),
        "scheduled_for": row["scheduled_for"],
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
class DocumentRepository:
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
                    id, job_id, category, subtype, sender, date,
                    short_description, details, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    job_id,
                    category,
                    normalize_sms_channel(subtype),
                    sender,
                    date,
                    short_description,
                    details,
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

        allowed = {"category", "subtype", "sender", "date", "short_description", "details"}
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

    def get_outreach_plan_draft(self, draft_id: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM outreach_plan_drafts WHERE id = ?",
                (draft_id,),
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
            conn.execute("DELETE FROM outreach_plan_steps WHERE job_id = ?", (job_id,))
            for step in steps:
                conn.execute(
                    """
                    INSERT INTO outreach_plan_steps (
                        id, job_id, type, sender, headline, scheduled_for, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                      (
                          step["id"],
                          job_id,
                          normalize_sms_channel(step["type"]),
                          step["sender"],
                          step["headline"],
                          step["scheduled_for"],
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
