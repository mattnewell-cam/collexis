"""Classify debtor responses and determine the appropriate follow-up action.

Uses gpt-5.4-nano for fast, cheap classification of inbound debtor replies.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, time
from time import perf_counter
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from openai import OpenAI

from .config import Settings
from .logging_utils import log_event
from .schemas import (
    DebtorResponseAction,
    DebtorResponseActionResult,
    DebtorResponseClassification,
    DebtorResponseClassificationResult,
    IncomingReplyContext,
    JobSnapshot,
)

CLASSIFICATION_MODEL = "gpt-5.4-nano"

try:
    _TZ = ZoneInfo("Europe/London")
except ZoneInfoNotFoundError:
    _TZ = None

logger = logging.getLogger(__name__)

CLASSIFICATION_PROMPT = """\
You are a debt-recovery assistant. Classify the debtor's response into exactly one category.

Categories:
- refused-or-disputed: The debtor refuses to pay, denies the debt, disputes the amount, \
says they don't owe anything, threatens counter-action, or is hostile/aggressive about not paying.
- agreed-with-deadline: The debtor agrees to pay and states a specific date or timeframe \
(e.g. "I'll pay by Friday", "will transfer on 15th", "paying end of month").
- agreed-without-deadline: The debtor agrees to pay or shows willingness but gives no \
specific date (e.g. "I'll sort it out", "will pay soon", "okay I'll do it").
- cant-afford: The debtor indicates genuine financial difficulty — can't afford the full \
amount, asks about instalments, mentions hardship, job loss, benefits, etc.
- claims-paid: The debtor says they have already paid, transferred, or settled the debt.
- unclear: The response doesn't clearly fit any category, is off-topic, or is too ambiguous.

If the debtor both disputes AND refuses, classify as refused-or-disputed.
If the debtor agrees but also mentions difficulty affording it, classify as cant-afford.
If the debtor says "I'll pay when I can" with no date, classify as agreed-without-deadline.

Return valid JSON matching this schema:
{
  "classification": "<one of the categories above>",
  "stated_deadline": "<ISO date if the debtor named a specific date, otherwise null>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence explaining your classification>"
}
"""


def _now_london() -> datetime:
    if _TZ is not None:
        return datetime.now(_TZ)
    return datetime.now()


def classify_debtor_response(
    *,
    reply_body: str,
    reply_subject: str = "",
    settings: Settings,
    classifier: Callable[..., DebtorResponseClassificationResult] | None = None,
) -> DebtorResponseClassificationResult:
    """Call gpt-5.4-nano to classify a debtor reply."""
    if classifier is not None:
        return classifier(reply_body=reply_body, reply_subject=reply_subject, settings=settings)

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=settings.openai_api_key)
    user_content = f"Subject: {reply_subject}\n\n{reply_body}" if reply_subject.strip() else reply_body

    started_at = perf_counter()
    log_event(logger, logging.INFO, "response_classification.started", model=CLASSIFICATION_MODEL)

    try:
        response = client.responses.parse(
            model=CLASSIFICATION_MODEL,
            input=[
                {"role": "system", "content": CLASSIFICATION_PROMPT},
                {"role": "user", "content": user_content},
            ],
            text_format=DebtorResponseClassificationResult,
        )
    except Exception as exc:
        log_event(
            logger, logging.ERROR, "response_classification.failed",
            model=CLASSIFICATION_MODEL,
            duration_ms=int((perf_counter() - started_at) * 1000),
            error=exc,
        )
        raise

    result = response.output_parsed
    log_event(
        logger, logging.INFO, "response_classification.completed",
        model=CLASSIFICATION_MODEL,
        classification=result.classification,
        confidence=result.confidence,
        duration_ms=int((perf_counter() - started_at) * 1000),
    )
    return result


def _compute_working_day_deadline(from_date: date, working_days: int = 3) -> date:
    """Compute a deadline N working days from from_date.

    If 3 working days lands on a Sunday, use 2 working days instead.
    """
    candidate = from_date
    days_added = 0
    while days_added < working_days:
        candidate += timedelta(days=1)
        # Skip Saturday (5) and Sunday (6)
        if candidate.weekday() < 5:
            days_added += 1

    # If the 3-day deadline falls on a Sunday, step back to 2 working days
    if working_days == 3 and candidate.weekday() == 6:
        return _compute_working_day_deadline(from_date, working_days=2)

    return candidate


def _has_missed_deadlines(timeline_items: list[dict[str, object]]) -> bool:
    """Check if the debtor has previously agreed to pay by a date and missed it."""
    missed_keywords = (
        "missed deadline",
        "deadline passed",
        "failed to pay",
        "payment not received",
        "broken promise",
        "did not pay",
        "didn't pay",
    )
    for item in timeline_items:
        details = str(item.get("details", "")).lower()
        short_desc = str(item.get("short_description", "")).lower()
        haystack = f"{short_desc} {details}"
        if any(kw in haystack for kw in missed_keywords):
            return True
    return False


def determine_response_action(
    *,
    classification_result: DebtorResponseClassificationResult,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
) -> DebtorResponseActionResult:
    """Given a classification, determine what action to take.

    Decision tree:
    - refused-or-disputed → suggest-handover (notify user, they confirm or cancel)
    - agreed-with-deadline → pause-until-deadline, UNLESS missed deadlines before → offer-payment-plan
    - agreed-without-deadline → set-deadline (respond with 3 working day deadline)
    - cant-afford → offer-payment-plan
    - claims-paid → await-payment-confirmation
    - unclear → replan (fall back to standard replanning)
    """
    cls = classification_result.classification
    now = _now_london()
    today = now.date()
    missed = _has_missed_deadlines(timeline_items)

    action: DebtorResponseAction
    computed_deadline: str | None = None
    user_message: str

    if cls == "refused-or-disputed":
        action = "suggest-handover"
        user_message = (
            "The debtor has refused to pay or is disputing the debt. "
            "We recommend proceeding to full handover and legal escalation. "
            "Please confirm or cancel."
        )

    elif cls == "agreed-with-deadline":
        if missed:
            action = "offer-payment-plan"
            user_message = (
                "The debtor has agreed to pay by a date, but they've missed deadlines before. "
                "We recommend offering a payment plan instead of waiting."
            )
        else:
            action = "pause-until-deadline"
            user_message = (
                f"The debtor has agreed to pay by {classification_result.stated_deadline or 'the stated date'}. "
                "Outreach will pause until then."
            )

    elif cls == "agreed-without-deadline":
        deadline = _compute_working_day_deadline(today)
        computed_deadline = deadline.isoformat()
        action = "set-deadline"
        user_message = (
            f"The debtor agreed to pay but didn't commit to a date. "
            f"We'll respond with a {deadline.strftime('%A %d %B')} deadline."
        )

    elif cls == "cant-afford":
        action = "offer-payment-plan"
        user_message = (
            "The debtor indicates they can't afford to pay in full. "
            "We recommend offering a payment plan."
        )

    elif cls == "claims-paid":
        action = "await-payment-confirmation"
        user_message = (
            "The debtor claims they've already paid. "
            "Please confirm whether payment has been received."
        )

    else:
        action = "replan"
        user_message = "The debtor's response is unclear. The outreach plan will be regenerated."

    return DebtorResponseActionResult(
        classification=cls,
        action=action,
        stated_deadline=classification_result.stated_deadline,
        computed_deadline=computed_deadline,
        has_missed_deadlines=missed,
        confidence=classification_result.confidence,
        reasoning=classification_result.reasoning,
        user_message=user_message,
    )


def offer_payment_plan(
    *,
    job_snapshot: JobSnapshot,
    outstanding_balance: float,
    default_term_months: int = 3,
    max_term_months: int = 12,
) -> dict[str, object]:
    """Generate a payment plan offer for the debtor.

    Default term: 3 months. Allow negotiation to 6, or up to 12 if they insist.

    # TODO: Implement full payment plan generation — calculate monthly amounts,
    # generate the offer communication, and track the plan in the database.
    # For now returns a stub with the parameters.
    """
    monthly_amount = round(outstanding_balance / default_term_months, 2)
    return {
        "outstanding_balance": outstanding_balance,
        "default_term_months": default_term_months,
        "max_term_months": max_term_months,
        "monthly_amount": monthly_amount,
        "status": "stub",
    }
