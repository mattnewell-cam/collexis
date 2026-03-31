from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Callable

from openai import OpenAI

from .config import Settings
from .outreach_planning import clean_text, isoformat_local, london_timezone_for, parse_plan_datetime
from .schemas import (
    JobSnapshot,
    OutreachPlanGeneratedCommunicationDraftBatch,
    OutreachPlanStepType,
)


OUTREACH_DRAFTING_MODEL = "gpt-5.4-mini"
DRAFT_WINDOW_DAYS = 7
ELIGIBLE_DRAFT_STEP_TYPES: set[OutreachPlanStepType] = {
    "email",
    "sms",
    "whatsapp",
    "call",
    "letter-warning",
    "letter-of-claim",
}

OUTREACH_DRAFTING_PROMPT = (
    "Draft the outbound communications for the requested outreach-plan steps. Return only the schema. "
    "Use the latest job snapshot, the full past communications timeline, ready document summaries/transcripts, "
    "the full outreach plan, and any already-drafted earlier communications as context. "
    "Treat explicit instructions in context_instructions as binding for tone, channel use, and channel avoidance. "
    "These drafts are being written for Collexis to send, not for the original business to send directly. "
    "Write in Collexis' voice, and refer to the client business or invoice issuer by name where that helps. "
    "Do not impersonate the original business, copy its signature block, or present Collexis as if it were the original sender. "
    "Draft only the requested target steps. Assume no response to any earlier planned step; if a reply were received, this flow would stop and be replanned. "
    "Do not invent facts, promises, concessions, legal claims, payment arrangements, or attachments not grounded in the provided context and plan. "
    "Keep tone and legal wording consistent with the case history and the planned legal timeline. "
    "Do not imply that a legal step, letter, claim, or deadline is happening sooner than the actual scheduled plan allows. "
    "For email steps, provide a subject and a full email body. "
    "For SMS and WhatsApp steps, provide only the sendable message body and leave subject blank. Keep them concise, natural, and channel-appropriate, without email-style sign-offs. "
    "For call steps, provide only a short practical call script with no heading label. "
    "For warning-letter and letter-of-claim steps, provide the full formal letter text and leave subject blank. "
    "Before submitting, do a final pass to make sure the wording matches the actual scheduled dates and legal stage."
)


def is_draftable_step_type(step_type: str) -> bool:
    return step_type in ELIGIBLE_DRAFT_STEP_TYPES


def normalize_draft_subject(step_type: str, subject: object) -> str | None:
    cleaned = clean_text(subject)
    if step_type != "email":
        return None
    return cleaned or None


def normalize_draft_body(body: object) -> str:
    return clean_text(body)


def build_drafting_payload(
    *,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
    documents: list[dict[str, object]],
    plan_steps: list[dict[str, object]],
    existing_drafts: list[dict[str, object]],
    target_steps: list[dict[str, object]],
    now_local: datetime,
) -> dict[str, object]:
    steps_by_id = {str(step["id"]): step for step in plan_steps}

    return {
        "timezone": "Europe/London",
        "current_datetime": isoformat_local(now_local),
        "job_snapshot": {
            "id": job_snapshot.id,
            "name": job_snapshot.name,
            "address": job_snapshot.address,
            "job_description": job_snapshot.job_description,
            "job_detail": job_snapshot.job_detail,
            "due_date": job_snapshot.due_date,
            "price": job_snapshot.price,
            "amount_paid": job_snapshot.amount_paid,
            "days_overdue": job_snapshot.days_overdue,
            "status": job_snapshot.status,
            "emails": job_snapshot.emails,
            "phones": job_snapshot.phones,
            "context_instructions": job_snapshot.context_instructions,
        },
        "past_communications": [
            {
                "id": str(item.get("id")),
                "category": str(item.get("category")),
                "subtype": item.get("subtype"),
                "sender": item.get("sender"),
                "date": clean_text(item.get("date")),
                "short_description": clean_text(item.get("short_description")),
                "details": clean_text(item.get("details")),
            }
            for item in timeline_items
        ],
        "documents": [
            {
                "id": str(document.get("id")),
                "title": clean_text(document.get("title")),
                "communication_date": document.get("communication_date"),
                "description": clean_text(document.get("description")),
                "transcript": clean_text(document.get("transcript")),
            }
            for document in documents
            if str(document.get("status")) == "ready"
        ],
        "full_outreach_plan": [
            {
                "id": str(step.get("id")),
                "type": str(step.get("type")),
                "headline": clean_text(step.get("headline")),
                "scheduled_for": clean_text(step.get("scheduled_for")),
            }
            for step in plan_steps
        ],
        "existing_drafts": [
            {
                "id": str(draft.get("id")),
                "plan_step_id": str(draft.get("plan_step_id")),
                "type": str(steps_by_id.get(str(draft.get("plan_step_id")), {}).get("type", "")),
                "headline": clean_text(steps_by_id.get(str(draft.get("plan_step_id")), {}).get("headline")),
                "scheduled_for": clean_text(steps_by_id.get(str(draft.get("plan_step_id")), {}).get("scheduled_for")),
                "subject": clean_text(draft.get("subject")) or None,
                "body": clean_text(draft.get("body")),
                "is_user_edited": bool(draft.get("is_user_edited")),
            }
            for draft in existing_drafts
        ],
        "target_steps": [
            {
                "plan_step_id": str(step.get("id")),
                "type": str(step.get("type")),
                "headline": clean_text(step.get("headline")),
                "scheduled_for": clean_text(step.get("scheduled_for")),
            }
            for step in target_steps
        ],
    }


def draft_outreach_communications(
    *,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
    documents: list[dict[str, object]],
    plan_steps: list[dict[str, object]],
    existing_drafts: list[dict[str, object]],
    target_steps: list[dict[str, object]],
    settings: Settings,
    now_local: datetime,
) -> OutreachPlanGeneratedCommunicationDraftBatch:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.parse(
        model=OUTREACH_DRAFTING_MODEL,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": OUTREACH_DRAFTING_PROMPT},
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            build_drafting_payload(
                                job_snapshot=job_snapshot,
                                timeline_items=timeline_items,
                                documents=documents,
                                plan_steps=plan_steps,
                                existing_drafts=existing_drafts,
                                target_steps=target_steps,
                                now_local=now_local,
                            ),
                            ensure_ascii=True,
                        ),
                    },
                ],
            }
        ],
        text_format=OutreachPlanGeneratedCommunicationDraftBatch,
    )
    return response.output_parsed


def ensure_outreach_plan_drafts(
    *,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
    documents: list[dict[str, object]],
    plan_steps: list[dict[str, object]],
    existing_drafts: list[dict[str, object]],
    settings: Settings,
    now: datetime | None = None,
    drafter: Callable[..., OutreachPlanGeneratedCommunicationDraftBatch] | None = None,
) -> list[dict[str, object]]:
    resolved_now = now or datetime.now(london_timezone_for(datetime.now()))
    if resolved_now.tzinfo is None:
        resolved_now = resolved_now.replace(tzinfo=london_timezone_for(resolved_now))
    now_local = resolved_now.astimezone(london_timezone_for(resolved_now)).replace(second=0, microsecond=0)
    window_end = now_local + timedelta(days=DRAFT_WINDOW_DAYS)
    existing_draft_step_ids = {str(draft["plan_step_id"]) for draft in existing_drafts}

    target_steps: list[dict[str, object]] = []
    for step in plan_steps:
        step_id = str(step.get("id"))
        if step_id in existing_draft_step_ids:
            continue
        step_type = str(step.get("type"))
        if not is_draftable_step_type(step_type):
            continue
        scheduled_for = parse_plan_datetime(clean_text(step.get("scheduled_for")))
        if scheduled_for is None:
            continue
        if not (now_local < scheduled_for <= window_end):
            continue
        target_steps.append(step)

    if not target_steps:
        return []

    draft_batch = (drafter or draft_outreach_communications)(
        job_snapshot=job_snapshot,
        timeline_items=timeline_items,
        documents=documents,
        plan_steps=plan_steps,
        existing_drafts=existing_drafts,
        target_steps=target_steps,
        settings=settings,
        now_local=now_local,
    )

    target_steps_by_id = {str(step["id"]): step for step in target_steps}
    created_drafts: list[dict[str, object]] = []
    seen_step_ids: set[str] = set()

    for draft in draft_batch.drafts:
        plan_step_id = clean_text(draft.plan_step_id)
        if not plan_step_id or plan_step_id in seen_step_ids:
            continue
        step = target_steps_by_id.get(plan_step_id)
        if step is None:
            continue
        body = normalize_draft_body(draft.body)
        if not body:
            continue
        seen_step_ids.add(plan_step_id)
        created_drafts.append(
            {
                "plan_step_id": plan_step_id,
                "subject": normalize_draft_subject(str(step["type"]), draft.subject),
                "body": body,
                "is_user_edited": False,
            }
        )

    return created_drafts
