"""Classify debtor responses and determine the appropriate follow-up action.

Uses gpt-5.4-nano for fast, cheap classification of inbound debtor replies.
The decision tree is stage-aware (friendly → post-handover → post-LoA) and
accounts for prior debtor behaviour (missed deadlines, repeated promises).
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
    DebtRecoveryPhase,
    IncomingReplyContext,
    JobSnapshot,
)

CLASSIFICATION_MODEL = "gpt-5.4-nano"

try:
    _TZ = ZoneInfo("Europe/London")
except ZoneInfoNotFoundError:
    _TZ = None

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Classification prompt — split dispute vs refusal
# ---------------------------------------------------------------------------

CLASSIFICATION_PROMPT = """\
You are a debt-recovery assistant. Classify the debtor's response into exactly one category.

Categories:
- dispute: The debtor disputes the debt — claims the work was poor, denies the agreement, \
says the amount is wrong, or provides reasons why they believe they don't owe the money. \
They may or may not have valid grounds, but they are making a substantive claim.
- refusal: The debtor flatly refuses to pay with no reasonable grounds — aggressive refusal, \
"I won't pay", "take me to court", hostile/threatening, or simply stonewalling.
- agreed-with-deadline: The debtor agrees to pay and states a specific date or timeframe \
(e.g. "I'll pay by Friday", "will transfer on 15th", "paying end of month"). \
Treat "shortly", "today", "tomorrow" as agreed-with-deadline (1 day).
- agreed-without-deadline: The debtor agrees to pay or shows willingness but gives no \
specific date (e.g. "I'll sort it out", "will pay soon", "okay I'll do it").
- cant-afford: The debtor indicates genuine financial difficulty — can't afford the full \
amount, asks about instalments, mentions hardship, job loss, benefits, etc.
- claims-paid: The debtor says they have already paid, transferred, or settled the debt.
- unclear: The response doesn't clearly fit any category, is off-topic, or is too ambiguous.

Disambiguation:
- If the debtor both disputes AND refuses aggressively, classify as refusal.
- If the debtor disputes AND says they can't afford it, classify as cant-afford.
- If the debtor agrees but also mentions difficulty affording it, classify as cant-afford.
- If the debtor says "I'll pay when I can" with no date, classify as agreed-without-deadline.
- "Shortly", "today", "tomorrow" = agreed-with-deadline with a 1-day deadline.

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    """Check if the debtor has previously agreed to pay by a date and missed it.

    Uses structured deadline data stored on timeline items rather than keyword
    matching.  A deadline is "missed" when:
      1. The item has a response_classification of agreed-with-deadline, AND
      2. It carries a stated_deadline or computed_deadline that is in the past,
         AND
      3. No subsequent item is classified as claims-paid.
    """
    today = _now_london().date()
    promise_classifications = {"agreed-with-deadline"}

    for idx, item in enumerate(timeline_items):
        rc = item.get("response_classification", "")
        if rc not in promise_classifications:
            continue

        # Check if a deadline was recorded and has passed
        deadline_str = item.get("stated_deadline") or item.get("computed_deadline")
        if not deadline_str:
            continue
        try:
            deadline_date = date.fromisoformat(str(deadline_str))
        except (ValueError, TypeError):
            continue
        if deadline_date >= today:
            continue  # deadline hasn't passed yet

        # Deadline is in the past — check if a later item says they paid
        subsequent_paid = any(
            subsequent.get("response_classification") == "claims-paid"
            for subsequent in timeline_items[idx + 1:]
        )
        if not subsequent_paid:
            return True

    return False


def _count_prior_promises(timeline_items: list[dict[str, object]]) -> int:
    """Count how many times the debtor has previously promised to pay (with or without deadline).

    A prior promise is any timeline item classified as agreed-with-deadline or
    agreed-without-deadline.
    """
    promise_classifications = {"agreed-with-deadline", "agreed-without-deadline"}
    count = 0
    for item in timeline_items:
        rc = item.get("response_classification", "")
        if rc in promise_classifications:
            count += 1
    return count


_LOA_KEYWORDS = (
    "letter of action",
    "letter before action",
    "letter of claim",
    "letter before claim",
    "pre-action protocol",
    "warning letter",
    "final warning before legal",
)

_LOA_CATEGORIES = {"letter-warning", "letter-of-claim"}


def detect_phase(
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
) -> DebtRecoveryPhase:
    """Detect the current recovery phase from timeline and job state.

    - friendly: pre-handover, acting as outsourced chase support
    - post-handover: past handover date but no formal legal letter sent yet
    - post-loa: a letter of action/claim has been sent
    """
    # Check if any legal letter has been sent
    for item in timeline_items:
        cat = str(item.get("category", "")).lower()
        desc = str(item.get("short_description", "")).lower()
        details = str(item.get("details", "")).lower()
        step_type = str(item.get("type", "")).lower()
        haystack = f"{cat} {desc} {details}"

        if step_type in _LOA_CATEGORIES:
            return "post-loa"
        if any(kw in haystack for kw in _LOA_KEYWORDS):
            return "post-loa"

    # Check if past handover date
    now = _now_london()
    planned = job_snapshot.planned_handover_at
    if planned:
        try:
            handover_dt = datetime.fromisoformat(planned)
            # Make both aware or both naive for comparison
            if handover_dt.tzinfo is None and now.tzinfo is not None:
                handover_dt = handover_dt.replace(tzinfo=now.tzinfo)
            elif handover_dt.tzinfo is not None and now.tzinfo is None:
                handover_dt = handover_dt.replace(tzinfo=None)
            if now >= handover_dt:
                return "post-handover"
        except (ValueError, TypeError):
            pass

    return "friendly"


def _days_until_deadline(stated_deadline: str | None) -> int | None:
    """Parse a stated ISO deadline and return days from today, or None."""
    if not stated_deadline:
        return None
    try:
        deadline_date = date.fromisoformat(stated_deadline)
        today = _now_london().date()
        return (deadline_date - today).days
    except (ValueError, TypeError):
        return None


def _max_wait_days(job_snapshot: JobSnapshot) -> int:
    """Return the user-defined max wait in days (defaults to handover_days)."""
    return max(int(job_snapshot.handover_days or 14), 1)


# ---------------------------------------------------------------------------
# Negotiation guidance
# ---------------------------------------------------------------------------

NEGOTIATION_GUIDANCE = (
    "Negotiate: understand why the debtor can't pay in full, explain legal consequences, "
    "and explore options — payment plan, extended timeline, or (as a last resort) a discount. "
    "Fight hard to maximise (a) recovered amount and (b) speed, in that priority order. "
    "Full payment in 3 weeks beats a 3-month plan. A 3-month plan beats full payment in 3 months. "
    "Max discount: 30% with 12-month timeline. If that fails, escalate to legal. "
    "Do not broadcast willingness to discount — only offer if the debtor genuinely cannot pay."
)


# ---------------------------------------------------------------------------
# Decision tree — stage-aware
# ---------------------------------------------------------------------------

def determine_response_action(
    *,
    classification_result: DebtorResponseClassificationResult,
    job_snapshot: JobSnapshot,
    timeline_items: list[dict[str, object]],
    phase: DebtRecoveryPhase | None = None,
) -> DebtorResponseActionResult:
    """Given a classification and phase, determine what action to take.

    The decision tree varies by phase (friendly → post-handover → post-LoA)
    and accounts for prior debtor behaviour. The AI drafter has leeway to
    deviate from these defaults where the facts clearly demand it — guidance
    notes are included in the result to inform that flexibility.
    """
    cls = classification_result.classification
    now = _now_london()
    today = now.date()

    # Detect phase if not provided
    if phase is None:
        phase = detect_phase(job_snapshot, timeline_items)

    missed = _has_missed_deadlines(timeline_items)
    prior_promises = _count_prior_promises(timeline_items)
    is_first = prior_promises == 0
    days_to_deadline = _days_until_deadline(classification_result.stated_deadline)
    max_wait = _max_wait_days(job_snapshot)

    action: DebtorResponseAction
    computed_deadline: str | None = None
    user_message: str
    guidance: str = ""

    # ----- claims-paid -----
    if cls == "claims-paid":
        if phase == "friendly":
            action = "await-payment-confirmation"
            user_message = (
                "The debtor claims they've already paid. "
                "Please confirm whether payment has been received."
            )
        else:
            action = "auto-check-payment"
            user_message = (
                "The debtor claims they've already paid. "
                "Payment records will be checked automatically."
            )

    # ----- agreed-with-deadline -----
    elif cls == "agreed-with-deadline":
        action, user_message, computed_deadline, guidance = _handle_agreed_with_deadline(
            phase=phase,
            is_first=is_first,
            missed=missed,
            days_to_deadline=days_to_deadline,
            max_wait=max_wait,
            stated_deadline=classification_result.stated_deadline,
            today=today,
        )

    # ----- agreed-without-deadline -----
    elif cls == "agreed-without-deadline":
        action, user_message, computed_deadline, guidance = _handle_agreed_without_deadline(
            phase=phase,
            is_first=is_first,
            today=today,
        )

    # ----- cant-afford -----
    elif cls == "cant-afford":
        if phase == "friendly":
            action = "suggest-handover"
            user_message = (
                "The debtor can't afford to pay in full. "
                "We recommend handover so we can negotiate directly. "
                "Please confirm or cancel."
            )
            guidance = (
                "On handover, begin negotiation. " + NEGOTIATION_GUIDANCE +
                " Adjust tone to their past behaviour."
            )
        elif phase == "post-handover":
            action = "negotiate"
            user_message = (
                "The debtor can't afford to pay in full. "
                "We'll negotiate payment terms directly."
            )
            guidance = NEGOTIATION_GUIDANCE + " Adjust tone to their past behaviour."
        else:  # post-loa
            action = "negotiate"
            user_message = (
                "The debtor can't afford to pay in full. "
                "We'll negotiate payment terms and state the legal timeline."
            )
            guidance = (
                NEGOTIATION_GUIDANCE +
                " State the timeline for claim filing clearly. "
                "Adjust tone to their past behaviour."
            )

    # ----- dispute -----
    elif cls == "dispute":
        if phase == "post-loa":
            action = "demand-evidence"
            user_message = (
                "The debtor is disputing the debt. "
                "We'll demand evidence and flag this for your review. "
                "Would you like to continue legal proceedings?"
            )
            guidance = (
                "Demand specific evidence for the dispute. "
                "Flag to user for review. Frame the question as whether to continue "
                "existing legal proceedings, not whether to start them."
            )
        else:
            action = "demand-evidence"
            user_message = (
                "The debtor is disputing the debt. "
                "We'll demand evidence and flag this for your review. "
                "Would you like to escalate to legal action?"
            )
            guidance = (
                "Demand specific evidence for the dispute. "
                "Flag to user for review. Ask whether they want to go legal."
            )

    # ----- refusal (no reasonable grounds) -----
    elif cls == "refusal":
        if phase == "post-loa":
            action = "continue-legal"
            user_message = (
                "The debtor is refusing to pay without reasonable grounds. "
                "Legal proceedings will continue."
            )
        else:
            action = "go-legal"
            user_message = (
                "The debtor is refusing to pay without reasonable grounds. "
                "We recommend escalating to legal action."
            )

    # ----- unclear -----
    else:
        action = "replan"
        user_message = "The debtor's response is unclear. The outreach plan will be regenerated."
        guidance = "The AI has leeway to interpret the debtor's intent and respond appropriately."

    # Global AI-leeway note
    if guidance:
        guidance += (
            " Note: the AI has leeway to deviate from these defaults where the facts "
            "clearly demand it — e.g. if the debtor's excuse and timeline have been "
            "consistent and reasonable from the start, accept rather than escalate."
        )

    return DebtorResponseActionResult(
        classification=cls,
        action=action,
        phase=phase,
        stated_deadline=classification_result.stated_deadline,
        computed_deadline=computed_deadline,
        has_missed_deadlines=missed,
        is_first_offence=is_first,
        confidence=classification_result.confidence,
        reasoning=classification_result.reasoning,
        user_message=user_message,
        guidance_notes=guidance,
    )


# ---------------------------------------------------------------------------
# Sub-handlers for agreed-with-deadline / agreed-without-deadline
# ---------------------------------------------------------------------------

def _handle_agreed_with_deadline(
    *,
    phase: DebtRecoveryPhase,
    is_first: bool,
    missed: bool,
    days_to_deadline: int | None,
    max_wait: int,
    stated_deadline: str | None,
    today: date,
) -> tuple[DebtorResponseAction, str, str | None, str]:
    """Return (action, user_message, computed_deadline, guidance)."""
    deadline_label = stated_deadline or "the stated date"

    if phase == "friendly":
        # Friendly: if within max wait, accept. If beyond, demand sooner.
        if days_to_deadline is not None and days_to_deadline > max_wait:
            dl = _compute_working_day_deadline(today, 3)
            return (
                "set-deadline",
                f"The debtor offered to pay by {deadline_label}, but that exceeds "
                f"the maximum wait ({max_wait} days). We'll demand payment by "
                f"{dl.strftime('%A %d %B')} instead.",
                dl.isoformat(),
                f"The debtor's proposed timeline of {days_to_deadline} days exceeds "
                f"the max wait of {max_wait} days. Demand payment by the computed deadline. "
                "However, the AI has leeway — if the debtor's reason is genuinely compelling "
                "and the overshoot is small, consider accepting.",
            )
        return (
            "pause-until-deadline",
            f"The debtor has agreed to pay by {deadline_label}. "
            "Outreach will pause until then.",
            None,
            "",
        )

    elif phase == "post-handover":
        if not is_first:
            # Repeat offender — hard 3wd deadline + threaten legal
            dl = _compute_working_day_deadline(today, 3)
            return (
                "threaten-deadline",
                f"The debtor has promised to pay again (not the first time). "
                f"Setting a {dl.strftime('%A %d %B')} deadline with a legal warning.",
                dl.isoformat(),
                "This is a repeat promise. Set a firm 3 working-day deadline and "
                "clearly threaten legal action if not met. No further extensions.",
            )
        if days_to_deadline is not None and days_to_deadline <= 30:
            # First time, reasonable timeline — accept
            return (
                "pause-until-deadline",
                f"The debtor has agreed to pay by {deadline_label}. "
                "Outreach will pause until then.",
                None,
                "",
            )
        # First time but > 1 month — negotiate down
        return (
            "negotiate",
            f"The debtor offered to pay by {deadline_label}, but that's over a month out. "
            "We'll negotiate a shorter timeline.",
            None,
            NEGOTIATION_GUIDANCE + " Push for a shorter timeline — ideally under 30 days.",
        )

    else:  # post-loa
        if not is_first:
            # Repeat — state claim timeline, demand payment
            return (
                "set-deadline",
                "The debtor has made promises before. "
                "We'll state the claim-filing timeline and demand payment.",
                None,
                "State the timeline for claim filing plainly. Tell the debtor to pay. "
                "No negotiation — this is a final demand.",
            )
        if days_to_deadline is not None and days_to_deadline <= 30:
            return (
                "pause-until-deadline",
                f"The debtor has agreed to pay by {deadline_label}. "
                "Outreach will pause until then.",
                None,
                "",
            )
        return (
            "negotiate",
            f"The debtor offered to pay by {deadline_label}, but that's over a month out. "
            "We'll negotiate a shorter timeline.",
            None,
            NEGOTIATION_GUIDANCE + " State the claim-filing timeline clearly.",
        )


def _handle_agreed_without_deadline(
    *,
    phase: DebtRecoveryPhase,
    is_first: bool,
    today: date,
) -> tuple[DebtorResponseAction, str, str | None, str]:
    """Return (action, user_message, computed_deadline, guidance)."""

    if phase == "friendly":
        # Always ask for a specific date, then the with-deadline logic applies on next reply
        dl = _compute_working_day_deadline(today, 3)
        return (
            "ask-for-timeline",
            "The debtor agreed to pay but didn't give a date. "
            "We'll ask for a specific payment date.",
            dl.isoformat(),
            "Ask the debtor for a specific payment date. Include a suggested "
            f"deadline of {dl.strftime('%A %d %B')} as a fallback if they don't commit.",
        )

    elif phase == "post-handover":
        if is_first:
            dl = _compute_working_day_deadline(today, 3)
            return (
                "ask-for-timeline",
                "The debtor agreed to pay but didn't give a date. "
                "We'll ask for a specific payment date.",
                dl.isoformat(),
                "Ask the debtor for a specific payment date. Include a suggested "
                f"deadline of {dl.strftime('%A %d %B')} as a fallback.",
            )
        # Not first time — hard deadline + threaten
        dl = _compute_working_day_deadline(today, 3)
        return (
            "threaten-deadline",
            f"The debtor has promised to pay again without a date (not the first time). "
            f"Setting a {dl.strftime('%A %d %B')} deadline with a legal warning.",
            dl.isoformat(),
            "This is a repeat vague promise. Set a firm 3 working-day deadline and "
            "clearly threaten legal action if not met.",
        )

    else:  # post-loa
        if is_first:
            dl = _compute_working_day_deadline(today, 3)
            return (
                "ask-for-timeline",
                "The debtor agreed to pay but didn't give a date. "
                "We'll ask for a specific payment date and state the legal timeline.",
                dl.isoformat(),
                "Ask for a specific date. State the claim-filing timeline. Suggest "
                f"{dl.strftime('%A %d %B')} as a deadline.",
            )
        return (
            "set-deadline",
            "The debtor has made vague promises before. "
            "We'll state the claim-filing timeline and demand payment.",
            None,
            "State the timeline for claim filing plainly. Tell the debtor to pay. "
            "No further extensions.",
        )


# ---------------------------------------------------------------------------
# Payment plan helper (stub — unchanged)
# ---------------------------------------------------------------------------

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
