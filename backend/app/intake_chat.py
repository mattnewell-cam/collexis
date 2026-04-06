from __future__ import annotations

import json
import logging
from time import perf_counter
from typing import Literal

from openai import OpenAI
from pydantic import BaseModel, Field

from .config import Settings
from .logging_utils import log_event
from .schemas import JobSnapshot

logger = logging.getLogger(__name__)

INTAKE_CHAT_MODEL = "gpt-5.4-mini"
INTAKE_CHAT_REASONING_EFFORT = "low"

IntakeField = Literal[
    "preferred_channels",
    "debtor_relationship",
    "tone_preference",
    "known_vulnerabilities",
    "promise_to_pay_tolerance",
    "handover_willingness",
    "legal_threat_appetite",
    "dispute_status",
    "previous_chase_attempts",
    "debtor_type",
]

INTAKE_FIELDS: list[IntakeField] = [
    "debtor_type",
    "debtor_relationship",
    "dispute_status",
    "previous_chase_attempts",
    "tone_preference",
    "preferred_channels",
    "known_vulnerabilities",
    "promise_to_pay_tolerance",
    "handover_willingness",
    "legal_threat_appetite",
]

FIELD_DESCRIPTIONS: dict[IntakeField, str] = {
    "preferred_channels": "Whether there are any communication channels they'd like to prioritise or avoid (email, phone, SMS, WhatsApp, letter).",
    "debtor_relationship": "The client's relationship with the debtor — long-term customer, referral, personal acquaintance, one-off/stranger.",
    "tone_preference": "What tone the client wants: warm/reminder-only, formal/professional, or stern/escalatory.",
    "known_vulnerabilities": "Any known vulnerabilities about the debtor (financial difficulty, health issues, etc.) that might affect the approach or trigger regulatory obligations.",
    "promise_to_pay_tolerance": "Whether the client is willing to accept 'I'll pay by X date', and if so, the latest date they'd be willing to wait.",
    "handover_willingness": "If no response is received, how long the client is willing to wait before formal handover — which involves a debtor surcharge, skip tracing, and escalation towards legal threats.",
    "legal_threat_appetite": "Whether the client is open to legal threats/action, or wants to avoid them entirely.",
    "dispute_status": "Whether the debtor is disputing the debt (quality of work, amount owed, etc.), which fundamentally changes the approach.",
    "previous_chase_attempts": "Whether the client has already attempted to chase the debt themselves before coming to Collexis, and how (calls, emails, in-person, etc.).",
    "debtor_type": "Whether the debtor is a business (B2B) or an individual (B2C), as this changes tone, legal framework, and appropriate channels.",
}

FieldStatus = Literal["known", "not_yet_known", "skipped"]


class IntakeChatRequest(BaseModel):
    job_snapshot: JobSnapshot
    messages: list[dict[str, str]] = Field(default_factory=list)
    field_statuses: dict[str, FieldStatus] = Field(default_factory=dict)


class IntakeFieldAssessment(BaseModel):
    field: str
    status: Literal["known", "not_yet_known", "skipped"]
    value_summary: str = ""


class IntakeChatResponse(BaseModel):
    field_statuses: dict[str, FieldStatus]
    field_summaries: dict[str, str]
    current_field: str | None = None
    assistant_message: str
    all_complete: bool
    context_summary: str


class IntakeAnalysis(BaseModel):
    field_assessments: list[IntakeFieldAssessment]
    next_question: str
    next_field: str | None = None
    all_complete: bool
    context_summary: str


SYSTEM_PROMPT = """\
You are a friendly intake assistant for Collexis, a debt recovery service. Your job is to \
gather important context from the client (the person owed money) before generating an outreach plan.

You must assess the following fields and decide for each whether they are "known" (enough info \
to act on), "not_yet_known" (need to ask), or "skipped" (user chose to skip). Do NOT ask about \
fields that are already "known" or "skipped".

Fields to assess:
{field_descriptions}

Rules:
- Ask ONE question at a time. Be concise and conversational. Do not be stiff or robotic.
- If existing job data already tells you the answer to a field, mark it "known" without asking.
- When the user answers, extract the relevant info and mark the field "known".
- When a field is marked "skipped" in the input, keep it as "skipped".
- Prioritise the most important fields first (dispute status and debtor type are usually most important).
- For handover_willingness, mention that handover involves a debtor surcharge, skip tracing, \
and escalation towards legal threats so the client understands the implications.
- When all fields are known or skipped, set all_complete=true.
- In context_summary, write a concise paragraph summarising all known answers. This will be \
stored as context for the outreach planner. Only include fields with actual answers (not skipped ones). \
Write it in third person from the perspective of the Collexis operator. Keep it factual and brief.
- If the user's answer to a question is vague or unclear, you may mark it as "known" with what \
you understood, rather than asking again. Don't be pedantic.
- Be warm but efficient. This is a professional debt recovery context.
"""


def build_system_prompt() -> str:
    field_desc_text = "\n".join(
        f"- {field}: {desc}" for field, desc in FIELD_DESCRIPTIONS.items()
    )
    return SYSTEM_PROMPT.format(field_descriptions=field_desc_text)


def run_intake_chat(
    *,
    job_snapshot: JobSnapshot,
    messages: list[dict[str, str]],
    field_statuses: dict[str, FieldStatus],
    settings: Settings,
) -> IntakeChatResponse:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=settings.openai_api_key)

    job_context = {
        "debtor_name": job_snapshot.name,
        "address": job_snapshot.address,
        "job_description": job_snapshot.job_description,
        "job_detail": job_snapshot.job_detail,
        "price": job_snapshot.price,
        "amount_paid": job_snapshot.amount_paid,
        "days_overdue": job_snapshot.days_overdue,
        "emails": job_snapshot.emails,
        "phones": job_snapshot.phones,
        "existing_context_instructions": job_snapshot.context_instructions,
    }

    chat_messages: list[dict[str, object]] = [
        {
            "role": "developer",
            "content": build_system_prompt(),
        },
        {
            "role": "user",
            "content": json.dumps({
                "job_context": job_context,
                "current_field_statuses": field_statuses,
                "conversation_so_far": messages,
            }, ensure_ascii=True),
        },
    ]

    started_at = perf_counter()
    log_event(
        logger,
        logging.INFO,
        "openai.responses.parse.started",
        provider="openai",
        operation="intake_chat",
        model=INTAKE_CHAT_MODEL,
        reasoning_effort=INTAKE_CHAT_REASONING_EFFORT,
        job_id=job_snapshot.id,
        message_count=len(messages),
    )
    try:
        response = client.responses.parse(
            model=INTAKE_CHAT_MODEL,
            reasoning={"effort": INTAKE_CHAT_REASONING_EFFORT},
            input=chat_messages,
            text_format=IntakeAnalysis,
        )
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "openai.responses.parse.failed",
            provider="openai",
            operation="intake_chat",
            model=INTAKE_CHAT_MODEL,
            duration_ms=int((perf_counter() - started_at) * 1000),
            error=exc,
        )
        raise

    duration_ms = int((perf_counter() - started_at) * 1000)
    analysis: IntakeAnalysis = response.output_parsed
    log_event(
        logger,
        logging.INFO,
        "openai.responses.parse.completed",
        provider="openai",
        operation="intake_chat",
        model=INTAKE_CHAT_MODEL,
        duration_ms=duration_ms,
        job_id=job_snapshot.id,
        all_complete=analysis.all_complete,
        next_field=analysis.next_field,
    )

    result_statuses: dict[str, FieldStatus] = {}
    result_summaries: dict[str, str] = {}
    for assessment in analysis.field_assessments:
        result_statuses[assessment.field] = assessment.status
        if assessment.value_summary:
            result_summaries[assessment.field] = assessment.value_summary

    # Preserve any skipped statuses from input that the model might have changed
    for field, status in field_statuses.items():
        if status == "skipped":
            result_statuses[field] = "skipped"

    return IntakeChatResponse(
        field_statuses=result_statuses,
        field_summaries=result_summaries,
        current_field=analysis.next_field,
        assistant_message=analysis.next_question,
        all_complete=analysis.all_complete,
        context_summary=analysis.context_summary,
    )
