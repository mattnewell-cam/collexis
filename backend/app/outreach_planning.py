from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from time import perf_counter
from typing import Callable
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from openai import OpenAI

from .config import Settings
from .logging_utils import log_event
from .schemas import IncomingReplyContext, JobSnapshot, OutreachPlanDraft, OutreachPlanStepType


OUTREACH_PLANNING_MODEL = "gpt-5.4-mini"
OUTREACH_PLANNING_REASONING_EFFORT = "low"
try:
    OUTREACH_TIMEZONE = ZoneInfo("Europe/London")
except ZoneInfoNotFoundError:
    OUTREACH_TIMEZONE = None
WRITTEN_STEP_TYPES = {"email", "sms", "whatsapp", "letter-warning", "letter-of-claim"}
LEGAL_STEP_TYPES = {"letter-warning", "letter-of-claim", "initiate-legal-action"}
PRE_HANDOVER_PHASE = "pre-handover"
POST_HANDOVER_PHASE = "post-handover"
PAYMENT_SORT_CODE = "01 02 03"
PAYMENT_ACCOUNT_NUMBER = "123456"
COURT_FEE_BANDS: tuple[tuple[float, float], ...] = (
    (300.0, 35.0),
    (500.0, 50.0),
    (1000.0, 70.0),
    (1500.0, 80.0),
    (3000.0, 115.0),
    (5000.0, 205.0),
    (10000.0, 455.0),
)
WARNING_KEYWORDS = (
    "letter of action",
    "letter before action",
    "legal action",
    "final warning",
    "before legal action",
)
CLAIM_KEYWORDS = (
    "letter of claim",
    "letter before claim",
    "pre-action protocol",
)
INITIATED_KEYWORDS = (
    "county court claim",
    "claim filed",
    "claim issued",
    "issued proceedings",
    "legal action initiated",
    "court claim",
)
logger = logging.getLogger(__name__)

PRE_HANDOVER_OUTREACH_PLANNING_PROMPT = (
    "Design a debt-recovery outreach plan for this job. Return only the schema. "
    "Plan future communications only. Use the current job snapshot, past communications, "
    "and transcripted document summaries as full context. Do not ask for more information. "
    "If incoming_reply_context is provided, treat it as a debtor/client email reply that Collexis has just received in response to Collexis outreach. "
    "It is not an outbound message from Collexis to the debtor. "
    "Treat explicit instructions in context_instructions as high-priority operating constraints. "
    "If context_instructions says to use or avoid a channel, follow that instruction over the default cadence/mixing preference. "
    "Choose exact future datetimes in the provided Europe/London timezone. "
    "Keep headlines short, concrete, and operator-friendly. "
    "Prefer a judicious cadence: written outreach about every 1-2 days where contact methods exist, "
    "mix WhatsApp, SMS, and email where possible, heavily favor channels already active on the case, "
    "and if the debtor has engaged on WhatsApp, prefer WhatsApp over SMS and email, "
    "This is the pre-handover phase. Collexis is acting only as outsourced chase support. "
    "Tell the debtor to pay the original creditor or client business, not Collexis. "
    "Do not include warning letters, letters of claim, court-action steps, or a handover letter. "
    "Treat each planned step as assuming no response to any earlier planned step, because any reply would break this flow immediately and trigger replanning. "
    "If you use countdown phrasing like 48-hour, 72-hour, five-day, or one-week, it must match the actual scheduled dates in the plan. "
    "Before submitting your answer, do a final pass to verify every headline is consistent with the real timeline and handover date. "
    "and include at least two calls per week when phone contact is available. "
    "Do not schedule steps in the past. Do not include more than one written outreach on the same day. "
    "Do not schedule any step on or after the planned handover datetime. "
    "Use sender 'collexis' for generated outreach-plan steps."
)

POST_HANDOVER_OUTREACH_PLANNING_PROMPT = (
    "Design a debt-recovery outreach plan for this job. Return only the schema. "
    "Plan future communications only. Use the current job snapshot, past communications, "
    "and transcripted document summaries as full context. Do not ask for more information. "
    "If incoming_reply_context is provided, treat it as a debtor/client email reply that Collexis has just received in response to Collexis outreach. "
    "It is not an outbound message from Collexis to the debtor. "
    "Treat explicit instructions in context_instructions as high-priority operating constraints. "
    "If context_instructions says to use or avoid a channel, follow that instruction over the default cadence/mixing preference. "
    "Choose exact future datetimes in the provided Europe/London timezone. "
    "Keep headlines short, concrete, and operator-friendly. "
    "This is the post-handover phase. Collexis is now acting as the debt collector. "
    "Debtor-facing communications should demand direct payment to Collexis using the supplied payment instructions, not payment to the original creditor. "
    "Warn that court fees will be added if court action becomes necessary, but do not state that court fees are already due unless the supplied context says so. "
    "Prefer a judicious cadence: written outreach about every 1-2 days where contact methods exist, "
    "mix WhatsApp, SMS, and email where possible, heavily favor channels already active on the case, "
    "and if the debtor has engaged on WhatsApp, prefer WhatsApp over SMS and email, "
    "Treat each planned step as assuming no response to any earlier planned step, because any reply would break this flow immediately and trigger replanning. "
    "If you use countdown phrasing like 48-hour, 72-hour, five-day, or one-week, it must match the actual scheduled dates in the plan. "
    "Before submitting your answer, do a final pass to verify every headline is consistent with the real timeline, handover date, and legal-action date. "
    "Include at least two calls per week when phone contact is available. "
    "After roughly two weeks from handover with no resolution, legal escalation may begin. "
    "Do not schedule steps in the past. Do not include more than one written outreach on the same day. "
    "Use sender 'collexis' for generated outreach-plan steps."
)
OUTREACH_PLANNING_PROMPT = f"{PRE_HANDOVER_OUTREACH_PLANNING_PROMPT} {POST_HANDOVER_OUTREACH_PLANNING_PROMPT}"


def limit_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).strip()


def clean_text(value: object) -> str:
    return str(value or "").strip()


def outstanding_balance(job_snapshot: JobSnapshot) -> float:
    price = float(job_snapshot.price or 0.0)
    amount_paid = float(job_snapshot.amount_paid or 0.0)
    return max(price - amount_paid, 0.0)


def court_fee_amount(balance: float) -> float | None:
    if balance <= 0:
        return None
    for upper_bound, fee in COURT_FEE_BANDS:
        if balance <= upper_bound:
            return fee
    return None


def court_fee_band_label(balance: float) -> str:
    if balance <= 0:
        return ""
    lower_bound = 0.0
    for upper_bound, _fee in COURT_FEE_BANDS:
        if balance <= upper_bound:
            if lower_bound == 0.0:
                return f"Up to GBP {upper_bound:,.0f}"
            return f"GBP {lower_bound + 0.01:,.2f} to GBP {upper_bound:,.0f}"
        lower_bound = upper_bound
    return "Above GBP 10,000"


def last_sunday(year: int, month: int) -> date:
    if month == 12:
        candidate = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        candidate = date(year, month + 1, 1) - timedelta(days=1)
    while candidate.weekday() != 6:
        candidate -= timedelta(days=1)
    return candidate


def london_timezone_for(value: date | datetime):
    if OUTREACH_TIMEZONE is not None:
        return OUTREACH_TIMEZONE

    candidate_date = value.date() if isinstance(value, datetime) else value
    dst_starts = last_sunday(candidate_date.year, 3)
    dst_ends = last_sunday(candidate_date.year, 10)
    offset_hours = 1 if dst_starts <= candidate_date < dst_ends else 0
    return timezone(timedelta(hours=offset_hours), name="Europe/London")


def parse_plan_datetime(value: str, *, fallback_hour: int = 10, fallback_minute: int = 0) -> datetime | None:
    candidate = value.strip()
    if not candidate:
        return None

    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        parsed = None

    if parsed is None:
        for format_string in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                parsed = datetime.strptime(candidate, format_string)
                break
            except ValueError:
                continue

    if parsed is None:
        return None

    if parsed.tzinfo is None:
        if "T" not in candidate and " " not in candidate:
            parsed = datetime.combine(
                parsed.date(),
                time(fallback_hour, fallback_minute),
                london_timezone_for(parsed),
            )
        else:
            parsed = parsed.replace(tzinfo=london_timezone_for(parsed))

    if OUTREACH_TIMEZONE is not None:
        parsed = parsed.astimezone(OUTREACH_TIMEZONE)
    return parsed.replace(second=0, microsecond=0)


def isoformat_local(value: datetime) -> str:
    if OUTREACH_TIMEZONE is not None:
        value = value.astimezone(OUTREACH_TIMEZONE)
    return value.replace(second=0, microsecond=0).isoformat()


def combine_local(date_value: datetime, *, hour: int, minute: int) -> datetime:
    return datetime.combine(date_value.date(), time(hour, minute), london_timezone_for(date_value))


def clamp_future(value: datetime, now_local: datetime) -> datetime:
    minimum = now_local + timedelta(hours=2)
    if value < minimum:
        return minimum.replace(second=0, microsecond=0)
    return value.replace(second=0, microsecond=0)


def date_gap_days(earlier: datetime, later: datetime) -> int:
    return (later.date() - earlier.date()).days


def resolve_planned_handover_at(job_snapshot: JobSnapshot, now_local: datetime) -> datetime:
    planned = parse_plan_datetime(clean_text(job_snapshot.planned_handover_at))
    if planned is not None:
        return planned
    days = max(int(job_snapshot.handover_days or 14), 0)
    return (now_local + timedelta(days=days)).replace(second=0, microsecond=0)


def phase_for(now_local: datetime, planned_handover_at: datetime) -> str:
    return POST_HANDOVER_PHASE if now_local >= planned_handover_at else PRE_HANDOVER_PHASE


def build_debt_recovery_context(job_snapshot: JobSnapshot, planned_handover_at: datetime, phase: str) -> dict[str, object]:
    balance = outstanding_balance(job_snapshot)
    fee = court_fee_amount(balance)
    return {
        "phase": phase,
        "planned_handover_at": isoformat_local(planned_handover_at),
        "outstanding_balance": round(balance, 2),
        "court_fee_amount": fee,
        "court_fee_band_label": court_fee_band_label(balance),
        "payment_sort_code": PAYMENT_SORT_CODE,
        "payment_account_number": PAYMENT_ACCOUNT_NUMBER,
    }


def detect_default_sender(timeline_items: list[dict[str, object]]) -> str:
    return "collexis"


def timeline_matches_keywords(item: dict[str, object], keywords: tuple[str, ...]) -> bool:
    haystack = f"{clean_text(item.get('short_description'))} {clean_text(item.get('details'))}".lower()
    return any(keyword in haystack for keyword in keywords)


def latest_timeline_date(
    timeline_items: list[dict[str, object]],
    predicate: Callable[[dict[str, object]], bool],
    *,
    default_hour: int = 9,
    default_minute: int = 0,
) -> datetime | None:
    candidates = [
        parse_plan_datetime(clean_text(item.get("date")), fallback_hour=default_hour, fallback_minute=default_minute)
        for item in timeline_items
        if predicate(item)
    ]
    resolved = [candidate for candidate in candidates if candidate is not None]
    return max(resolved) if resolved else None


def detect_legal_state(timeline_items: list[dict[str, object]]) -> dict[str, datetime | None]:

    initiated_date = latest_timeline_date(
        timeline_items,
        lambda item: timeline_matches_keywords(item, INITIATED_KEYWORDS),
    )
    claim_date = latest_timeline_date(
        timeline_items,
        lambda item: timeline_matches_keywords(item, CLAIM_KEYWORDS),
    )
    if initiated_date is not None and claim_date is None:
        claim_date = initiated_date - timedelta(days=30)

    warning_date = latest_timeline_date(
        timeline_items,
        lambda item: str(item.get("category")) == "letter" and timeline_matches_keywords(item, WARNING_KEYWORDS),
    )
    if claim_date is not None and warning_date is None:
        warning_date = claim_date - timedelta(days=7)

    return {
        "warning_date": warning_date,
        "claim_date": claim_date,
        "initiated_date": initiated_date,
    }


def build_legal_schedule(
    now_local: datetime,
    timeline_items: list[dict[str, object]],
    *,
    planned_handover_at: datetime,
) -> list[tuple[OutreachPlanStepType, datetime]]:
    legal_state = detect_legal_state(timeline_items)
    warning_date = legal_state["warning_date"]
    claim_date = legal_state["claim_date"]
    initiated_date = legal_state["initiated_date"]

    schedule: list[tuple[OutreachPlanStepType, datetime]] = []
    if initiated_date is not None:
        return schedule

    if claim_date is not None:
        schedule.append(
            (
                "initiate-legal-action",
                combine_local(max(now_local + timedelta(days=1), claim_date + timedelta(days=30)), hour=9, minute=0),
            )
        )
        return schedule

    if warning_date is not None:
        claim_dt = combine_local(max(now_local + timedelta(days=1), warning_date + timedelta(days=7)), hour=9, minute=0)
        schedule.append(("letter-of-claim", claim_dt))
        schedule.append(("initiate-legal-action", combine_local(claim_dt + timedelta(days=30), hour=9, minute=0)))
        return schedule

    warning_dt = combine_local(max(now_local + timedelta(days=1), planned_handover_at + timedelta(days=14)), hour=9, minute=0)
    claim_dt = combine_local(warning_dt + timedelta(days=7), hour=9, minute=0)
    schedule.append(("letter-warning", warning_dt))
    schedule.append(("letter-of-claim", claim_dt))
    schedule.append(("initiate-legal-action", combine_local(claim_dt + timedelta(days=30), hour=9, minute=0)))
    return schedule


def build_generation_payload(
    *,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
    documents: list[dict[str, object]],
    incoming_reply_context: IncomingReplyContext | None,
    now_local: datetime,
    planned_handover_at: datetime,
    phase: str,
) -> dict[str, object]:
    debt_context = build_debt_recovery_context(job_snapshot, planned_handover_at, phase)
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
            "handover_days": job_snapshot.handover_days,
            "planned_handover_at": isoformat_local(planned_handover_at),
        },
        "debt_recovery_context": debt_context,
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
        "incoming_reply_context": (
            {
                "from_email": incoming_reply_context.from_email.strip(),
                "from_name": (incoming_reply_context.from_name or "").strip() or None,
                "received_at": incoming_reply_context.received_at,
                "subject": incoming_reply_context.subject.strip(),
                "body": incoming_reply_context.body.strip(),
                "direction_note": "Inbound reply received by Collexis from the debtor/client in response to Collexis outreach.",
            }
            if incoming_reply_context is not None
            else None
        ),
    }


def draft_outreach_plan(
    *,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
    documents: list[dict[str, object]],
    incoming_reply_context: IncomingReplyContext | None,
    settings: Settings,
    now_local: datetime,
    planned_handover_at: datetime,
    phase: str,
) -> OutreachPlanDraft:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=settings.openai_api_key)
    started_at = perf_counter()
    log_event(
        logger,
        logging.INFO,
        "openai.responses.parse.started",
        provider="openai",
        operation="outreach_plan.draft",
        model=OUTREACH_PLANNING_MODEL,
        reasoning_effort=OUTREACH_PLANNING_REASONING_EFFORT,
        phase=phase,
        timeline_item_count=len(timeline_items),
        ready_document_count=len(documents),
        has_incoming_reply=incoming_reply_context is not None,
    )
    try:
        response = client.responses.parse(
            model=OUTREACH_PLANNING_MODEL,
            reasoning={"effort": OUTREACH_PLANNING_REASONING_EFFORT},
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": PRE_HANDOVER_OUTREACH_PLANNING_PROMPT if phase == PRE_HANDOVER_PHASE else POST_HANDOVER_OUTREACH_PLANNING_PROMPT},
                        {
                            "type": "input_text",
                            "text": json.dumps(
                                build_generation_payload(
                                    job_snapshot=job_snapshot,
                                    timeline_items=timeline_items,
                                    documents=documents,
                                    incoming_reply_context=incoming_reply_context,
                                    now_local=now_local,
                                    planned_handover_at=planned_handover_at,
                                    phase=phase,
                                ),
                                ensure_ascii=True,
                            ),
                        },
                    ],
                }
            ],
            text_format=OutreachPlanDraft,
        )
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "openai.responses.parse.failed",
            provider="openai",
            operation="outreach_plan.draft",
            model=OUTREACH_PLANNING_MODEL,
            reasoning_effort=OUTREACH_PLANNING_REASONING_EFFORT,
            phase=phase,
            duration_ms=int((perf_counter() - started_at) * 1000),
            error=exc,
        )
        raise
    log_event(
        logger,
        logging.INFO,
        "openai.responses.parse.completed",
        provider="openai",
        operation="outreach_plan.draft",
        model=OUTREACH_PLANNING_MODEL,
        reasoning_effort=OUTREACH_PLANNING_REASONING_EFFORT,
        phase=phase,
        duration_ms=int((perf_counter() - started_at) * 1000),
        output_step_count=len(response.output_parsed.steps),
    )
    return response.output_parsed


def get_written_channel_order(
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
) -> list[OutreachPlanStepType]:
    channel_activity = {
        "whatsapp": {"count": 0, "latest": None},
        "sms": {"count": 0, "latest": None},
        "email": {"count": 0, "latest": None},
    }
    for item in timeline_items:
        subtype = clean_text(item.get("subtype"))
        if subtype not in channel_activity:
            continue
        channel_activity[subtype]["count"] += 1
        parsed_date = parse_plan_datetime(clean_text(item.get("date")))
        latest = channel_activity[subtype]["latest"]
        if parsed_date is not None and (latest is None or parsed_date > latest):
            channel_activity[subtype]["latest"] = parsed_date

    available: list[OutreachPlanStepType] = []
    if job_snapshot.phones:
        available.append("whatsapp")
        available.append("sms")
    if job_snapshot.emails:
        available.append("email")

    channel_priority = {"whatsapp": 0, "sms": 1, "email": 2}

    def sort_key(step_type: OutreachPlanStepType) -> tuple[int, float, int]:
        activity = channel_activity[step_type]
        latest = activity["latest"]
        latest_timestamp = latest.timestamp() if latest is not None else float("-inf")
        return (-int(activity["count"]), -latest_timestamp, channel_priority[step_type])

    return sorted(available, key=sort_key)


def default_time_for_step(
    step_type: OutreachPlanStepType,
    *,
    prefers_morning: bool,
) -> tuple[int, int]:
    if step_type == "call":
        return (9, 30) if prefers_morning else (14, 0)
    if step_type in {"letter-warning", "letter-of-claim", "initiate-legal-action"}:
        return (9, 0)
    if step_type in {"sms", "whatsapp"}:
        return (10, 15)
    return (11, 0)


def default_headline(step_type: OutreachPlanStepType) -> str:
    if step_type == "email":
        return "Email follow-up on overdue balance"
    if step_type == "sms":
        return "SMS reminder on overdue balance"
    if step_type == "whatsapp":
        return "WhatsApp follow-up on overdue balance"
    if step_type == "call":
        return "Call to request payment update"
    if step_type == "letter-warning":
        return "Final warning before legal action"
    if step_type == "letter-of-claim":
        return "Formal letter of claim"
    return "Initiate legal action"


def normalize_model_steps(
    draft: OutreachPlanDraft,
    *,
    now_local: datetime,
    default_sender: str,
    prefers_morning: bool,
) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []

    for step in draft.steps:
        scheduled_for = parse_plan_datetime(
            step.scheduled_for,
            fallback_hour=default_time_for_step(step.type, prefers_morning=prefers_morning)[0],
            fallback_minute=default_time_for_step(step.type, prefers_morning=prefers_morning)[1],
        )
        if scheduled_for is None:
            continue

        normalized.append(
            {
                "type": step.type,
                "sender": step.sender or default_sender,
                "headline": limit_words(step.headline.strip() or default_headline(step.type), 8),
                "scheduled_for": clamp_future(scheduled_for, now_local),
            }
        )

    normalized.sort(key=lambda item: item["scheduled_for"])
    return normalized


def filter_steps_for_available_channels(
    steps: list[dict[str, object]],
    *,
    job_snapshot: JobSnapshot,
) -> list[dict[str, object]]:
    unavailable_step_types: set[OutreachPlanStepType] = set()
    if not job_snapshot.phones:
        unavailable_step_types.update({"call", "sms", "whatsapp"})
    if not job_snapshot.emails:
        unavailable_step_types.add("email")

    return [step for step in steps if step["type"] not in unavailable_step_types]


def find_matching_model_step(
    steps: list[dict[str, object]],
    step_type: OutreachPlanStepType,
) -> dict[str, object] | None:
    candidates = [step for step in steps if step["type"] == step_type]
    return min(candidates, key=lambda item: item["scheduled_for"]) if candidates else None


def append_unique_step(
    steps: list[dict[str, object]],
    *,
    step_type: OutreachPlanStepType,
    sender: str,
    headline: str,
    scheduled_for: datetime,
) -> None:
    for existing in steps:
        if existing["type"] == step_type and abs((existing["scheduled_for"] - scheduled_for).total_seconds()) < 60:
            return
    steps.append(
        {
            "type": step_type,
            "sender": sender,
            "headline": limit_words(headline, 8),
            "scheduled_for": scheduled_for.replace(second=0, microsecond=0),
        }
    )


def ensure_legal_steps(
    steps: list[dict[str, object]],
    *,
    schedule: list[tuple[OutreachPlanStepType, datetime]],
    default_sender: str,
) -> None:
    for step_type, scheduled_for in schedule:
        model_step = find_matching_model_step(steps, step_type)
        model_sender = clean_text(model_step.get("sender")) if model_step else ""
        model_headline = clean_text(model_step.get("headline")) if model_step else ""
        append_unique_step(
            steps,
            step_type=step_type,
            sender=model_sender or default_sender,
            headline=model_headline or default_headline(step_type),
            scheduled_for=scheduled_for,
        )


def ensure_written_cadence(
    steps: list[dict[str, object]],
    *,
    now_local: datetime,
    horizon_end: datetime,
    written_channel_order: list[OutreachPlanStepType],
    default_sender: str,
    prefers_morning: bool,
) -> None:
    if not written_channel_order:
        return

    written_steps = sorted(
        [step for step in steps if step["type"] in WRITTEN_STEP_TYPES],
        key=lambda item: item["scheduled_for"],
    )
    anchors = [now_local] + [step["scheduled_for"] for step in written_steps] + [horizon_end]
    channel_index = 0

    for earlier, later in zip(anchors, anchors[1:]):
        gap_days = date_gap_days(earlier, later)
        while gap_days > 2:
            next_date = earlier + timedelta(days=2)
            step_type = written_channel_order[channel_index % len(written_channel_order)]
            hour, minute = default_time_for_step(step_type, prefers_morning=prefers_morning)
            append_unique_step(
                steps,
                step_type=step_type,
                sender=default_sender,
                headline=default_headline(step_type),
                scheduled_for=combine_local(next_date, hour=hour, minute=minute),
            )
            earlier = combine_local(next_date, hour=hour, minute=minute)
            gap_days = date_gap_days(earlier, later)
            channel_index += 1


def ensure_call_cadence(
    steps: list[dict[str, object]],
    *,
    now_local: datetime,
    horizon_end: datetime,
    default_sender: str,
    prefers_morning: bool,
) -> None:
    target = combine_local(now_local + timedelta(days=1), hour=default_time_for_step("call", prefers_morning=prefers_morning)[0], minute=default_time_for_step("call", prefers_morning=prefers_morning)[1])

    while target < horizon_end:
        has_nearby_call = any(
            step["type"] == "call" and abs((step["scheduled_for"] - target).total_seconds()) <= 24 * 60 * 60
            for step in steps
        )
        if not has_nearby_call:
            append_unique_step(
                steps,
                step_type="call",
                sender=default_sender,
                headline=default_headline("call"),
                scheduled_for=target,
            )
        target += timedelta(days=3)


def normalize_written_days(
    steps: list[dict[str, object]],
    *,
    prefers_morning: bool,
) -> list[dict[str, object]]:
    sorted_steps = sorted(steps, key=lambda item: item["scheduled_for"])
    used_written_days: set[datetime.date] = set()
    normalized: list[dict[str, object]] = []

    for step in sorted_steps:
        current = dict(step)
        if current["type"] in WRITTEN_STEP_TYPES:
            hour, minute = default_time_for_step(current["type"], prefers_morning=prefers_morning)
            while current["scheduled_for"].date() in used_written_days:
                current["scheduled_for"] = combine_local(current["scheduled_for"] + timedelta(days=1), hour=hour, minute=minute)
            used_written_days.add(current["scheduled_for"].date())
        normalized.append(current)

    normalized.sort(key=lambda item: item["scheduled_for"])
    return normalized


def finalize_steps(
    steps: list[dict[str, object]],
    *,
    job_id: str,
) -> list[dict[str, object]]:
    finalized: list[dict[str, object]] = []
    for step in sorted(steps, key=lambda item: item["scheduled_for"]):
        timestamp = isoformat_local(step["scheduled_for"])
        finalized.append(
            {
                "id": str(uuid4()),
                "job_id": job_id,
                "type": step["type"],
                "sender": step["sender"],
                "headline": limit_words(clean_text(step["headline"]) or default_headline(step["type"]), 8),
                "scheduled_for": timestamp,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )
    return finalized


def generate_outreach_plan(
    *,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
    documents: list[dict[str, object]],
    incoming_reply_context: IncomingReplyContext | None = None,
    settings: Settings,
    now: datetime | None = None,
    drafter: Callable[..., OutreachPlanDraft] | None = None,
) -> list[dict[str, object]]:
    log_event(
        logger,
        logging.INFO,
        "outreach_plan.generate.started",
        job_id=job_snapshot.id,
        timeline_item_count=len(timeline_items),
        ready_document_count=len(documents),
        has_incoming_reply=incoming_reply_context is not None,
    )
    resolved_now = now or datetime.now(london_timezone_for(datetime.now()))
    if OUTREACH_TIMEZONE is not None:
        resolved_now = resolved_now.astimezone(OUTREACH_TIMEZONE)
    now_local = resolved_now.replace(second=0, microsecond=0)
    default_sender = detect_default_sender(timeline_items)
    prefers_morning = "morning" in job_snapshot.context_instructions.lower()
    planned_handover_at = resolve_planned_handover_at(job_snapshot, now_local)
    phase = phase_for(now_local, planned_handover_at)
    legal_schedule = build_legal_schedule(now_local, timeline_items, planned_handover_at=planned_handover_at) if phase == POST_HANDOVER_PHASE else []
    log_event(
        logger,
        logging.INFO,
        "outreach_plan.generate.phase_resolved",
        job_id=job_snapshot.id,
        phase=phase,
        planned_handover_at=isoformat_local(planned_handover_at),
        legal_step_target_count=len(legal_schedule),
        prefers_morning=prefers_morning,
    )
    draft = (drafter or draft_outreach_plan)(
        job_snapshot=job_snapshot,
        timeline_items=timeline_items,
        documents=documents,
        incoming_reply_context=incoming_reply_context,
        settings=settings,
        now_local=now_local,
        planned_handover_at=planned_handover_at,
        phase=phase,
    )

    steps = normalize_model_steps(
        draft,
        now_local=now_local,
        default_sender=default_sender,
        prefers_morning=prefers_morning,
    )
    steps = filter_steps_for_available_channels(steps, job_snapshot=job_snapshot)
    log_event(
        logger,
        logging.INFO,
        "outreach_plan.generate.model_steps_normalized",
        job_id=job_snapshot.id,
        phase=phase,
        model_step_count=len(draft.steps),
        normalized_step_count=len(steps),
    )
    if phase == PRE_HANDOVER_PHASE:
        steps = [
            step for step in steps
            if step["type"] not in LEGAL_STEP_TYPES and step["scheduled_for"] < planned_handover_at
        ]
    else:
        steps = [step for step in steps if step["type"] not in LEGAL_STEP_TYPES]
        ensure_legal_steps(steps, schedule=legal_schedule, default_sender=default_sender)

    latest_step = max((step["scheduled_for"] for step in steps), default=(planned_handover_at if phase == PRE_HANDOVER_PHASE else now_local + timedelta(days=14)))
    if phase == PRE_HANDOVER_PHASE:
        horizon_end = planned_handover_at
    else:
        horizon_end = latest_step if latest_step > now_local else max(now_local + timedelta(days=14), planned_handover_at + timedelta(days=14))

    ensure_written_cadence(
        steps,
        now_local=now_local,
        horizon_end=horizon_end,
        written_channel_order=get_written_channel_order(job_snapshot, timeline_items),
        default_sender=default_sender,
        prefers_morning=prefers_morning,
    )
    if job_snapshot.phones:
        ensure_call_cadence(
            steps,
            now_local=now_local,
            horizon_end=horizon_end,
            default_sender=default_sender,
            prefers_morning=prefers_morning,
        )

    normalized = normalize_written_days(steps, prefers_morning=prefers_morning)
    normalized = [step for step in normalized if step["scheduled_for"] > now_local]
    if phase == PRE_HANDOVER_PHASE:
        normalized = [step for step in normalized if step["scheduled_for"] < planned_handover_at]
    finalized = finalize_steps(normalized, job_id=job_snapshot.id)
    step_counts = dict(Counter(str(step["type"]) for step in finalized))
    log_event(
        logger,
        logging.INFO,
        "outreach_plan.generate.completed",
        job_id=job_snapshot.id,
        phase=phase,
        final_step_count=len(finalized),
        step_counts=step_counts,
    )
    return finalized
