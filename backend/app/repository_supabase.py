from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
import logging
from time import perf_counter
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import httpx

from .config import Settings
from .logging_utils import log_event


logger = logging.getLogger(__name__)


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value)
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    return datetime.fromisoformat(text)


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
    stem = filename.rsplit(".", 1)[0].strip()
    return stem or "Untitled document"


def in_filter(values: list[str]) -> str:
    escaped = ['"' + value.replace('"', '\\"') + '"' for value in values]
    return "in.(" + ",".join(escaped) + ")"


def row_to_document(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "original_filename": row["original_filename"],
        "mime_type": row["mime_type"],
        "storage_path": row["storage_path"],
        "status": row["status"],
        "title": row["title"],
        "communication_date": row.get("communication_date"),
        "description": row.get("description") or "",
        "transcript": row.get("transcript") or "",
        "extraction_error": row.get("extraction_error"),
        "created_at": parse_datetime(row["created_at"]),
        "updated_at": parse_datetime(row["updated_at"]),
    }


def row_to_timeline_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "category": row["category"],
        "subtype": normalize_sms_channel(row.get("subtype")),
        "sender": row.get("sender"),
        "recipient": row.get("recipient"),
        "date": row["date"],
        "short_description": row["short_description"],
        "details": row.get("details") or "",
        "response_classification": row.get("response_classification"),
        "response_action": row.get("response_action"),
        "created_at": parse_datetime(row["created_at"]),
        "updated_at": parse_datetime(row["updated_at"]),
    }


def row_to_outreach_plan_step(row: dict[str, Any]) -> dict[str, Any]:
    raw_recipient_emails = row.get("recipient_emails") or []
    if isinstance(raw_recipient_emails, str):
        try:
            recipient_emails = [
                str(email).strip().lower()
                for email in json.loads(raw_recipient_emails)
                if str(email).strip()
            ]
        except json.JSONDecodeError:
            recipient_emails = []
    else:
        recipient_emails = [str(email).strip().lower() for email in raw_recipient_emails if str(email).strip()]

    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "type": normalize_sms_channel(row["type"]),
        "sender": row["sender"],
        "headline": normalize_sms_headline(row["headline"], step_type=row["type"]),
        "scheduled_for": row["scheduled_for"],
        "recipient_emails": recipient_emails,
        "delivery_status": row.get("delivery_status") or "pending",
        "processing_started_at": row.get("processing_started_at"),
        "sent_at": row.get("sent_at"),
        "failed_at": row.get("failed_at"),
        "attempt_count": int(row.get("attempt_count") or 0),
        "last_error": row.get("last_error"),
        "provider_message_id": row.get("provider_message_id"),
        "created_at": parse_datetime(row["created_at"]),
        "updated_at": parse_datetime(row["updated_at"]),
    }


def row_to_outreach_plan_draft(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "plan_step_id": row["plan_step_id"],
        "subject": row.get("subject"),
        "body": row["body"],
        "is_user_edited": bool(row["is_user_edited"]),
        "created_at": parse_datetime(row["created_at"]),
        "updated_at": parse_datetime(row["updated_at"]),
    }


@dataclass(slots=True)
class SupabaseDocumentRepository:
    settings: Settings
    _rest_base_url: str = field(init=False)
    _storage_base_url: str = field(init=False)
    _headers: dict[str, str] = field(init=False)
    _has_outreach_delivery_state: bool = field(init=False)

    def __post_init__(self) -> None:
        if not self.settings.supabase_url or not self.settings.supabase_service_role_key:
            raise RuntimeError("Supabase backend storage is not configured.")
        self._rest_base_url = self.settings.supabase_url.rstrip("/") + "/rest/v1"
        self._storage_base_url = self.settings.supabase_url.rstrip("/") + "/storage/v1"
        self._headers = {
            "apikey": self.settings.supabase_service_role_key,
            "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
        }
        self._has_outreach_delivery_state = self._detect_outreach_delivery_state_support()

    def _detect_outreach_delivery_state_support(self) -> bool:
        target = f"{self._rest_base_url}/outreach_plan_steps"
        started_at = perf_counter()
        log_event(
            logger,
            logging.INFO,
            "supabase.rest.request.started",
            table="outreach_plan_steps",
            method="GET",
            target=target,
            operation="repository.detect_outreach_delivery_state",
        )
        try:
            response = httpx.get(
                target,
                params={"select": "delivery_status", "limit": "1"},
                headers=self._headers,
                timeout=30.0,
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "supabase.rest.request.failed",
                table="outreach_plan_steps",
                method="GET",
                target=target,
                operation="repository.detect_outreach_delivery_state",
                duration_ms=int((perf_counter() - started_at) * 1000),
                error=exc,
            )
            raise
        log_event(
            logger,
            logging.INFO if response.status_code < 400 else logging.WARNING,
            "supabase.rest.request.completed",
            table="outreach_plan_steps",
            method="GET",
            target=target,
            operation="repository.detect_outreach_delivery_state",
            duration_ms=int((perf_counter() - started_at) * 1000),
            status=response.status_code,
        )
        if response.status_code < 400:
            return True
        payload = response.json() if response.content else {}
        if response.status_code == 400 and "delivery_status" in str(payload.get("message") or ""):
            return False
        response.raise_for_status()
        return True

    def _apply_delivery_state_compatibility(self, step: dict[str, Any]) -> dict[str, Any]:
        if self._has_outreach_delivery_state:
            return step
        created_at = parse_datetime(step["created_at"])
        updated_at = parse_datetime(step["updated_at"])
        if updated_at != created_at:
            step["delivery_status"] = "sent"
            step["sent_at"] = updated_at.isoformat()
        else:
            step["delivery_status"] = "pending"
            step["sent_at"] = None
        step["processing_started_at"] = None
        step["failed_at"] = None
        step["attempt_count"] = 0
        step["last_error"] = None
        step["provider_message_id"] = None
        return step

    def supports_outreach_delivery_state(self) -> bool:
        return self._has_outreach_delivery_state

    def _rest_request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        json_body: Any = None,
        return_representation: bool = True,
        object_response: bool = False,
    ) -> Any:
        headers = dict(self._headers)
        if return_representation:
            headers["Prefer"] = "return=representation"
        if object_response:
            headers["Accept"] = "application/vnd.pgrst.object+json"
        target = f"{self._rest_base_url}/{table}"
        started_at = perf_counter()
        log_event(
            logger,
            logging.INFO,
            "supabase.rest.request.started",
            table=table,
            method=method.upper(),
            target=target,
            object_response=object_response,
            return_representation=return_representation,
            param_keys=sorted((params or {}).keys()),
        )
        try:
            response = httpx.request(
                method,
                target,
                params=params,
                json=json_body,
                headers=headers,
                timeout=60.0,
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "supabase.rest.request.failed",
                table=table,
                method=method.upper(),
                target=target,
                object_response=object_response,
                return_representation=return_representation,
                param_keys=sorted((params or {}).keys()),
                duration_ms=int((perf_counter() - started_at) * 1000),
                error=exc,
            )
            raise
        log_event(
            logger,
            logging.INFO if response.status_code < 400 else logging.WARNING,
            "supabase.rest.request.completed",
            table=table,
            method=method.upper(),
            target=target,
            object_response=object_response,
            return_representation=return_representation,
            param_keys=sorted((params or {}).keys()),
            duration_ms=int((perf_counter() - started_at) * 1000),
            status=response.status_code,
        )
        if object_response and response.status_code == 406:
            return None
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    def _storage_request(
        self,
        method: str,
        storage_path: str,
        *,
        content: bytes | None = None,
        mime_type: str | None = None,
    ) -> httpx.Response:
        headers = dict(self._headers)
        if mime_type:
            headers["Content-Type"] = mime_type
        if method.upper() in {"POST", "PUT"}:
            headers["x-upsert"] = "true"
        target = f"{self._storage_base_url}/object/{self.settings.supabase_documents_bucket}/{quote(storage_path, safe='/')}"
        started_at = perf_counter()
        log_event(
            logger,
            logging.INFO,
            "supabase.storage.request.started",
            method=method.upper(),
            target=target,
            storage_path=storage_path,
            mime_type=mime_type,
            content_length=len(content) if content is not None else 0,
        )
        try:
            response = httpx.request(
                method,
                target,
                content=content,
                headers=headers,
                timeout=120.0,
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "supabase.storage.request.failed",
                method=method.upper(),
                target=target,
                storage_path=storage_path,
                duration_ms=int((perf_counter() - started_at) * 1000),
                error=exc,
            )
            raise
        log_event(
            logger,
            logging.INFO if response.status_code < 400 else logging.WARNING,
            "supabase.storage.request.completed",
            method=method.upper(),
            target=target,
            storage_path=storage_path,
            duration_ms=int((perf_counter() - started_at) * 1000),
            status=response.status_code,
        )
        return response

    def build_storage_path(self, job_id: str, document_id: str, extension: str) -> str:
        return f"jobs/{job_id}/{document_id}{extension}"

    def write_file(self, storage_path: str, content: bytes, mime_type: str) -> None:
        response = self._storage_request("POST", storage_path, content=content, mime_type=mime_type)
        response.raise_for_status()

    def read_file(self, storage_path: str) -> bytes:
        target = f"{self._storage_base_url}/object/authenticated/{self.settings.supabase_documents_bucket}/{quote(storage_path, safe='/')}"
        started_at = perf_counter()
        log_event(
            logger,
            logging.INFO,
            "supabase.storage.request.started",
            method="GET",
            target=target,
            storage_path=storage_path,
        )
        try:
            response = httpx.get(
                target,
                headers=self._headers,
                timeout=120.0,
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "supabase.storage.request.failed",
                method="GET",
                target=target,
                storage_path=storage_path,
                duration_ms=int((perf_counter() - started_at) * 1000),
                error=exc,
            )
            raise
        log_event(
            logger,
            logging.INFO if response.status_code < 400 else logging.WARNING,
            "supabase.storage.request.completed",
            method="GET",
            target=target,
            storage_path=storage_path,
            duration_ms=int((perf_counter() - started_at) * 1000),
            status=response.status_code,
        )
        if response.status_code == 404:
            raise FileNotFoundError(storage_path)
        response.raise_for_status()
        return response.content

    def delete_storage_path(self, storage_path: str) -> bool:
        response = self._storage_request("DELETE", storage_path)
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return True

    def list_all(self) -> list[dict[str, Any]]:
        rows = self._rest_request("GET", "documents", params={"select": "*"})
        documents = [row_to_document(row) for row in rows or []]
        documents.sort(key=lambda item: item["created_at"], reverse=True)
        self._attach_timeline_links(documents)
        return documents

    def list_for_job(self, job_id: str) -> list[dict[str, Any]]:
        rows = self._rest_request(
            "GET",
            "documents",
            params={"select": "*", "job_id": f"eq.{job_id}"},
        )
        documents = [row_to_document(row) for row in rows or []]
        documents.sort(key=lambda item: item["created_at"], reverse=True)
        self._attach_timeline_links(documents)
        return documents

    def get(self, document_id: str) -> dict[str, Any] | None:
        row = self._rest_request(
            "GET",
            "documents",
            params={"select": "*", "id": f"eq.{document_id}"},
            object_response=True,
        )
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
        payload = {
            "id": document_id,
            "job_id": job_id,
            "original_filename": original_filename,
            "mime_type": mime_type,
            "storage_path": storage_path,
            "status": "processing",
            "title": filename_stem(original_filename),
            "communication_date": None,
            "description": "",
            "transcript": "",
            "extraction_error": None,
            "created_at": now,
            "updated_at": now,
        }
        rows = self._rest_request("POST", "documents", json_body=payload)
        document = row_to_document((rows or [payload])[0])
        document["linked_timeline_item_ids"] = []
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
        rows = self._rest_request(
            "PATCH",
            "documents",
            params={"id": f"eq.{document_id}"},
            json_body=fields,
        )
        if not rows:
            raise KeyError(document_id)
        document = self.get(document_id)
        if document is None:
            raise KeyError(document_id)
        return document

    def delete(self, document_id: str) -> dict[str, Any]:
        document = self.get(document_id)
        if document is None:
            raise KeyError(document_id)
        self._rest_request("DELETE", "documents", params={"id": f"eq.{document_id}"})
        storage_path = str(document["storage_path"])
        if storage_path:
            try:
                self.delete_storage_path(storage_path)
            except httpx.HTTPError:
                pass
        return document

    def list_timeline_for_job(self, job_id: str) -> list[dict[str, Any]]:
        rows = self._rest_request(
            "GET",
            "timeline_items",
            params={"select": "*", "job_id": f"eq.{job_id}"},
        )
        timeline_items = [row_to_timeline_item(row) for row in rows or []]
        timeline_items.sort(key=lambda item: (item["date"], item["created_at"]))
        self._attach_document_links(timeline_items)
        return timeline_items

    def get_timeline_item(self, timeline_item_id: str) -> dict[str, Any] | None:
        row = self._rest_request(
            "GET",
            "timeline_items",
            params={"select": "*", "id": f"eq.{timeline_item_id}"},
            object_response=True,
        )
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
        timeline_item_id: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
    ) -> dict[str, Any]:
        item_id = timeline_item_id or str(uuid4())
        now = created_at or utc_now()
        payload = {
            "id": item_id,
            "job_id": job_id,
            "category": category,
            "subtype": normalize_sms_channel(subtype),
            "sender": sender,
            "recipient": recipient,
            "date": date,
            "short_description": short_description,
            "details": details,
            "response_classification": response_classification,
            "response_action": response_action,
            "created_at": now,
            "updated_at": updated_at or now,
        }
        rows = self._rest_request("POST", "timeline_items", json_body=payload)
        timeline_item = row_to_timeline_item((rows or [payload])[0])
        timeline_item["linked_document_ids"] = []
        return timeline_item

    def update_timeline_item(self, timeline_item_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            timeline_item = self.get_timeline_item(timeline_item_id)
            if timeline_item is None:
                raise KeyError(timeline_item_id)
            return timeline_item

        allowed = {"category", "subtype", "sender", "recipient", "date", "short_description", "details", "response_classification", "response_action"}
        invalid = set(fields) - allowed
        if invalid:
            raise ValueError(f"Unsupported fields: {', '.join(sorted(invalid))}")

        if "subtype" in fields:
            fields["subtype"] = normalize_sms_channel(fields["subtype"])
        fields["updated_at"] = utc_now()
        rows = self._rest_request(
            "PATCH",
            "timeline_items",
            params={"id": f"eq.{timeline_item_id}"},
            json_body=fields,
        )
        if not rows:
            raise KeyError(timeline_item_id)
        timeline_item = self.get_timeline_item(timeline_item_id)
        if timeline_item is None:
            raise KeyError(timeline_item_id)
        return timeline_item

    def delete_timeline_item(self, timeline_item_id: str) -> dict[str, Any]:
        timeline_item = self.get_timeline_item(timeline_item_id)
        if timeline_item is None:
            raise KeyError(timeline_item_id)
        self._rest_request("DELETE", "timeline_items", params={"id": f"eq.{timeline_item_id}"})
        return timeline_item

    def list_outreach_plan_steps(self, job_id: str) -> list[dict[str, Any]]:
        rows = self._rest_request(
            "GET",
            "outreach_plan_steps",
            params={"select": "*", "job_id": f"eq.{job_id}"},
        )
        steps = [self._apply_delivery_state_compatibility(row_to_outreach_plan_step(row)) for row in rows or []]
        steps.sort(key=lambda item: (item["scheduled_for"], item["created_at"]))
        return steps

    def list_outreach_plan_drafts(self, job_id: str) -> list[dict[str, Any]]:
        rows = self._rest_request(
            "GET",
            "outreach_plan_drafts",
            params={"select": "*", "job_id": f"eq.{job_id}"},
        )
        drafts = [row_to_outreach_plan_draft(row) for row in rows or []]
        drafts.sort(key=lambda item: (item["updated_at"], item["created_at"]), reverse=True)
        return drafts

    def get_outreach_plan_step(self, step_id: str) -> dict[str, Any] | None:
        row = self._rest_request(
            "GET",
            "outreach_plan_steps",
            params={"select": "*", "id": f"eq.{step_id}"},
            object_response=True,
        )
        return self._apply_delivery_state_compatibility(row_to_outreach_plan_step(row)) if row else None

    def get_outreach_plan_draft(self, draft_id: str) -> dict[str, Any] | None:
        row = self._rest_request(
            "GET",
            "outreach_plan_drafts",
            params={"select": "*", "id": f"eq.{draft_id}"},
            object_response=True,
        )
        return row_to_outreach_plan_draft(row) if row else None

    def get_outreach_plan_draft_by_step_id(self, plan_step_id: str) -> dict[str, Any] | None:
        row = self._rest_request(
            "GET",
            "outreach_plan_drafts",
            params={"select": "*", "plan_step_id": f"eq.{plan_step_id}"},
            object_response=True,
        )
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
        self._rest_request("DELETE", "outreach_plan_drafts", params={"job_id": f"eq.{job_id}"}, return_representation=False)
        self._rest_request("DELETE", "outreach_plan_steps", params={"job_id": f"eq.{job_id}"}, return_representation=False)
        if steps:
            payload = []
            for step in steps:
                row = {
                    "id": step["id"],
                    "job_id": job_id,
                    "type": normalize_sms_channel(step["type"]),
                    "sender": step["sender"],
                    "headline": step["headline"],
                    "scheduled_for": step["scheduled_for"],
                    "created_at": step["created_at"],
                    "updated_at": step["updated_at"],
                }
                if self._has_outreach_delivery_state:
                    row.update(
                        {
                            "recipient_emails": step.get("recipient_emails") or [],
                            "delivery_status": step.get("delivery_status") or "pending",
                            "processing_started_at": step.get("processing_started_at"),
                            "sent_at": step.get("sent_at"),
                            "failed_at": step.get("failed_at"),
                            "attempt_count": int(step.get("attempt_count") or 0),
                            "last_error": step.get("last_error"),
                            "provider_message_id": step.get("provider_message_id"),
                        }
                    )
                payload.append(row)
            self._rest_request("POST", "outreach_plan_steps", json_body=payload)
        return self.list_outreach_plan_steps(job_id)

    def create_outreach_plan_drafts(
        self,
        job_id: str,
        *,
        drafts: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not drafts:
            return []

        now = utc_now()
        payload = []
        created_ids: list[str] = []
        for draft in drafts:
            draft_id = str(uuid4())
            created_ids.append(draft_id)
            payload.append(
                {
                    "id": draft_id,
                    "job_id": job_id,
                    "plan_step_id": draft["plan_step_id"],
                    "subject": draft.get("subject"),
                    "body": draft["body"],
                    "is_user_edited": bool(draft.get("is_user_edited")),
                    "created_at": now,
                    "updated_at": now,
                }
            )

        self._rest_request("POST", "outreach_plan_drafts", json_body=payload)
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
            fields["is_user_edited"] = bool(fields["is_user_edited"])
        fields["updated_at"] = utc_now()
        rows = self._rest_request(
            "PATCH",
            "outreach_plan_drafts",
            params={"id": f"eq.{draft_id}"},
            json_body=fields,
        )
        if not rows:
            raise KeyError(draft_id)
        draft = self.get_outreach_plan_draft(draft_id)
        if draft is None:
            raise KeyError(draft_id)
        return draft

    def list_pending_outreach_plan_email_steps(self) -> list[dict[str, Any]]:
        params = {"select": "*", "type": "eq.email"}
        if self._has_outreach_delivery_state:
            params["delivery_status"] = "eq.pending"
        rows = self._rest_request("GET", "outreach_plan_steps", params=params)
        steps = [self._apply_delivery_state_compatibility(row_to_outreach_plan_step(row)) for row in rows or []]
        if not self._has_outreach_delivery_state:
            steps = [step for step in steps if str(step.get("delivery_status")) == "pending"]
        steps.sort(key=lambda item: (item["scheduled_for"], item["created_at"]))
        return steps

    def release_stale_outreach_plan_email_claims(self, stale_before: str) -> int:
        if not self._has_outreach_delivery_state:
            return 0
        stale_before_dt = parse_datetime(stale_before)
        rows = self._rest_request(
            "GET",
            "outreach_plan_steps",
            params={"select": "*", "type": "eq.email", "delivery_status": "eq.sending"},
        )
        stale_steps = [
            row_to_outreach_plan_step(row)
            for row in rows or []
            if row.get("processing_started_at")
            and parse_datetime(row["processing_started_at"]) < stale_before_dt
        ]
        released_count = 0
        for step in stale_steps:
            updated_rows = self._rest_request(
                "PATCH",
                "outreach_plan_steps",
                params={"id": f"eq.{step['id']}", "delivery_status": "eq.sending"},
                json_body={
                    "delivery_status": "pending",
                    "processing_started_at": None,
                    "updated_at": utc_now(),
                },
            )
            released_count += len(updated_rows or [])
        return released_count

    def claim_outreach_plan_email_step(self, step_id: str, claimed_at: str) -> dict[str, Any] | None:
        if not self._has_outreach_delivery_state:
            step = self.get_outreach_plan_step(step_id)
            if step is None or str(step.get("type")) != "email" or str(step.get("delivery_status")) != "pending":
                return None
            return step
        rows = self._rest_request(
            "PATCH",
            "outreach_plan_steps",
            params={"id": f"eq.{step_id}", "type": "eq.email", "delivery_status": "eq.pending"},
            json_body={
                "delivery_status": "sending",
                "processing_started_at": claimed_at,
                "failed_at": None,
                "updated_at": claimed_at,
                "attempt_count": 1,
            },
        )
        if not rows:
            return None
        claimed = self._apply_delivery_state_compatibility(row_to_outreach_plan_step(rows[0]))
        # Preserve incremental attempts across retries.
        current_attempts = int(claimed.get("attempt_count") or 0)
        if current_attempts <= 1:
            return claimed
        return claimed

    def increment_claimed_outreach_plan_email_step_attempt(self, step_id: str, attempt_count: int, claimed_at: str) -> dict[str, Any]:
        if not self._has_outreach_delivery_state:
            step = self.get_outreach_plan_step(step_id)
            if step is None:
                raise KeyError(step_id)
            return step
        rows = self._rest_request(
            "PATCH",
            "outreach_plan_steps",
            params={"id": f"eq.{step_id}", "delivery_status": "eq.sending"},
            json_body={
                "attempt_count": attempt_count,
                "processing_started_at": claimed_at,
                "updated_at": claimed_at,
            },
        )
        if not rows:
            raise KeyError(step_id)
        return self._apply_delivery_state_compatibility(row_to_outreach_plan_step(rows[0]))

    def set_outreach_plan_step_recipient_emails(self, step_id: str, recipient_emails: list[str]) -> dict[str, Any]:
        normalized_emails = [email.strip().lower() for email in recipient_emails if email.strip()]
        if not self._has_outreach_delivery_state:
            step = self.get_outreach_plan_step(step_id)
            if step is None:
                raise KeyError(step_id)
            step["recipient_emails"] = normalized_emails
            return step
        rows = self._rest_request(
            "PATCH",
            "outreach_plan_steps",
            params={"id": f"eq.{step_id}"},
            json_body={
                "recipient_emails": normalized_emails,
                "updated_at": utc_now(),
            },
        )
        if not rows:
            raise KeyError(step_id)
        return self._apply_delivery_state_compatibility(row_to_outreach_plan_step(rows[0]))

    def mark_outreach_plan_step_sent(self, step_id: str, *, sent_at: str, provider_message_id: str | None) -> dict[str, Any]:
        if not self._has_outreach_delivery_state:
            rows = self._rest_request(
                "PATCH",
                "outreach_plan_steps",
                params={"id": f"eq.{step_id}"},
                json_body={"updated_at": sent_at},
            )
            if not rows:
                raise KeyError(step_id)
            return self._apply_delivery_state_compatibility(row_to_outreach_plan_step(rows[0]))
        rows = self._rest_request(
            "PATCH",
            "outreach_plan_steps",
            params={"id": f"eq.{step_id}"},
            json_body={
                "delivery_status": "sent",
                "sent_at": sent_at,
                "processing_started_at": None,
                "failed_at": None,
                "last_error": None,
                "provider_message_id": provider_message_id,
                "updated_at": sent_at,
            },
        )
        if not rows:
            raise KeyError(step_id)
        return self._apply_delivery_state_compatibility(row_to_outreach_plan_step(rows[0]))

    def mark_outreach_plan_step_failed(self, step_id: str, *, failed_at: str, error_message: str) -> dict[str, Any]:
        if not self._has_outreach_delivery_state:
            step = self.get_outreach_plan_step(step_id)
            if step is None:
                raise KeyError(step_id)
            return step
        rows = self._rest_request(
            "PATCH",
            "outreach_plan_steps",
            params={"id": f"eq.{step_id}"},
            json_body={
                "delivery_status": "failed",
                "failed_at": failed_at,
                "processing_started_at": None,
                "last_error": error_message,
                "updated_at": failed_at,
            },
        )
        if not rows:
            raise KeyError(step_id)
        return self._apply_delivery_state_compatibility(row_to_outreach_plan_step(rows[0]))

    def delete_job(self, job_id: str) -> dict[str, int | str]:
        documents = self.list_for_job(job_id)
        timeline_items = self.list_timeline_for_job(job_id)
        unique_storage_paths = sorted({str(document["storage_path"]) for document in documents if str(document["storage_path"])})

        self._rest_request("DELETE", "outreach_plan_drafts", params={"job_id": f"eq.{job_id}"}, return_representation=False)
        self._rest_request("DELETE", "outreach_plan_steps", params={"job_id": f"eq.{job_id}"}, return_representation=False)
        self._rest_request("DELETE", "documents", params={"job_id": f"eq.{job_id}"}, return_representation=False)
        self._rest_request("DELETE", "timeline_items", params={"job_id": f"eq.{job_id}"}, return_representation=False)

        deleted_file_count = 0
        for storage_path in unique_storage_paths:
            try:
                if self.delete_storage_path(storage_path):
                    deleted_file_count += 1
            except httpx.HTTPError:
                continue

        return {
            "job_id": job_id,
            "deleted_document_count": len(documents),
            "deleted_timeline_item_count": len(timeline_items),
            "deleted_file_count": deleted_file_count,
        }

    def link_document_to_timeline_item(self, document_id: str, timeline_item_id: str) -> None:
        existing = set(self.list_linked_timeline_item_ids(document_id))
        if timeline_item_id in existing:
            return
        payload = {
            "document_id": document_id,
            "timeline_item_id": timeline_item_id,
            "created_at": utc_now(),
        }
        self._rest_request("POST", "document_timeline_items", json_body=payload)

    def list_linked_timeline_item_ids(self, document_id: str) -> list[str]:
        rows = self._rest_request(
            "GET",
            "document_timeline_items",
            params={"select": "timeline_item_id,created_at", "document_id": f"eq.{document_id}"},
        )
        rows = rows or []
        rows.sort(key=lambda row: parse_datetime(row["created_at"]))
        return [str(row["timeline_item_id"]) for row in rows]

    def list_linked_document_ids(self, timeline_item_id: str) -> list[str]:
        rows = self._rest_request(
            "GET",
            "document_timeline_items",
            params={"select": "document_id,created_at", "timeline_item_id": f"eq.{timeline_item_id}"},
        )
        rows = rows or []
        rows.sort(key=lambda row: parse_datetime(row["created_at"]))
        return [str(row["document_id"]) for row in rows]

    def _attach_timeline_links(self, documents: list[dict[str, Any]]) -> None:
        if not documents:
            return
        rows = self._rest_request(
            "GET",
            "document_timeline_items",
            params={
                "select": "document_id,timeline_item_id,created_at",
                "document_id": in_filter([str(document["id"]) for document in documents]),
            },
        )
        links_by_document_id: dict[str, list[str]] = {str(document["id"]): [] for document in documents}
        for row in sorted(rows or [], key=lambda item: parse_datetime(item["created_at"])):
            links_by_document_id[str(row["document_id"])].append(str(row["timeline_item_id"]))
        for document in documents:
            document["linked_timeline_item_ids"] = links_by_document_id.get(str(document["id"]), [])

    def _attach_document_links(self, timeline_items: list[dict[str, Any]]) -> None:
        if not timeline_items:
            return
        rows = self._rest_request(
            "GET",
            "document_timeline_items",
            params={
                "select": "timeline_item_id,document_id,created_at",
                "timeline_item_id": in_filter([str(item["id"]) for item in timeline_items]),
            },
        )
        links_by_timeline_item_id: dict[str, list[str]] = {str(item["id"]): [] for item in timeline_items}
        for row in sorted(rows or [], key=lambda item: parse_datetime(item["created_at"])):
            links_by_timeline_item_id[str(row["timeline_item_id"])].append(str(row["document_id"]))
        for timeline_item in timeline_items:
            timeline_item["linked_document_ids"] = links_by_timeline_item_id.get(str(timeline_item["id"]), [])
