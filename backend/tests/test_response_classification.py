"""Test debtor response classification against sample responses.

Run with: python -m pytest backend/tests/test_response_classification.py -v
Or for live LLM tests: python -m pytest backend/tests/test_response_classification.py -v -m live
"""

from __future__ import annotations

import os
import pytest

from backend.app.config import Settings
from backend.app.response_classification import (
    classify_debtor_response,
    determine_response_action,
    detect_phase,
    offer_payment_plan,
    _compute_working_day_deadline,
    _count_prior_promises,
    _has_missed_deadlines,
)
from backend.app.schemas import (
    DebtorResponseClassificationResult,
    JobSnapshot,
)
from datetime import date, datetime
from zoneinfo import ZoneInfo


# ---------------------------------------------------------------------------
# Sample debtor responses covering each classification
# ---------------------------------------------------------------------------

SAMPLE_RESPONSES: list[dict[str, str]] = [
    # --- dispute ---
    {
        "id": "dispute-1",
        "body": "The work was shoddy and I've already complained. The amount is wrong — you charged for work that was never completed.",
        "expected": "dispute",
    },
    {
        "id": "dispute-2",
        "body": "This is ridiculous. I never agreed to pay this amount. The contract clearly states a different figure.",
        "expected": "dispute",
    },
    {
        "id": "dispute-3",
        "body": "The job was never finished properly so I'm disputing this invoice. I'm not paying until you fix the issues.",
        "expected": "dispute",
    },

    # --- refusal ---
    {
        "id": "refusal-1",
        "body": "Absolutely not. Take me to court if you want, I'm not paying a penny.",
        "expected": "refusal",
    },
    {
        "id": "refusal-2",
        "body": "Stop contacting me. I don't care what you say, you're not getting anything from me.",
        "expected": "refusal",
    },
    {
        "id": "refusal-3",
        "body": "No. Go away.",
        "expected": "refusal",
    },

    # --- agreed-with-deadline ---
    {
        "id": "agreed-deadline-1",
        "body": "Hi, I can pay this by Friday the 18th. Sorry for the delay.",
        "expected": "agreed-with-deadline",
    },
    {
        "id": "agreed-deadline-2",
        "body": "I'll transfer the full amount on the 1st of next month when I get paid.",
        "expected": "agreed-with-deadline",
    },
    {
        "id": "agreed-deadline-3",
        "body": "OK I accept I owe this. I will make the payment by end of this week.",
        "expected": "agreed-with-deadline",
    },
    {
        "id": "agreed-deadline-4",
        "body": "I'll pay shortly.",
        "expected": "agreed-with-deadline",
    },

    # --- agreed-without-deadline ---
    {
        "id": "agreed-no-deadline-1",
        "body": "Yeah I know I need to pay this. I'll sort it out.",
        "expected": "agreed-without-deadline",
    },
    {
        "id": "agreed-no-deadline-2",
        "body": "I'll get it paid as soon as I can, just been really busy lately.",
        "expected": "agreed-without-deadline",
    },
    {
        "id": "agreed-no-deadline-3",
        "body": "Fine, I'll pay it. Give me a bit of time though.",
        "expected": "agreed-without-deadline",
    },

    # --- cant-afford ---
    {
        "id": "cant-afford-1",
        "body": "I really want to pay but I've lost my job and I'm on universal credit now. Is there any way I can pay in instalments?",
        "expected": "cant-afford",
    },
    {
        "id": "cant-afford-2",
        "body": "I can't afford to pay the full amount right now. I'm a single parent and money is very tight. Could we work something out?",
        "expected": "cant-afford",
    },
    {
        "id": "cant-afford-3",
        "body": "Look, I acknowledge the debt but there's no way I can pay £2,000 in one go. I could maybe manage £100 a month?",
        "expected": "cant-afford",
    },

    # --- claims-paid ---
    {
        "id": "claims-paid-1",
        "body": "I already paid this last week by bank transfer. Check your account.",
        "expected": "claims-paid",
    },
    {
        "id": "claims-paid-2",
        "body": "This has been settled. I paid the original company directly on the 3rd. I have the receipt.",
        "expected": "claims-paid",
    },
    {
        "id": "claims-paid-3",
        "body": "I made the payment yesterday. Reference number 4829173. Please confirm receipt.",
        "expected": "claims-paid",
    },

    # --- unclear ---
    {
        "id": "unclear-1",
        "body": "Can you call me to discuss? My number is 07700 900123.",
        "expected": "unclear",
    },
    {
        "id": "unclear-2",
        "body": "Who are you? I don't understand what this is about.",
        "expected": "unclear",
    },
    {
        "id": "unclear-3",
        "body": "Please send me the original invoice so I can check.",
        "expected": "unclear",
    },
]


# ---------------------------------------------------------------------------
# Unit tests (no LLM, deterministic)
# ---------------------------------------------------------------------------

class TestComputeWorkingDayDeadline:
    def test_normal_weekday(self):
        # Monday 2026-04-06 + 3 working days = Thursday 2026-04-09
        result = _compute_working_day_deadline(date(2026, 4, 6), 3)
        assert result == date(2026, 4, 9)
        assert result.weekday() == 3  # Thursday

    def test_from_wednesday(self):
        # Wednesday 2026-04-08 + 3 working days = Monday 2026-04-13
        result = _compute_working_day_deadline(date(2026, 4, 8), 3)
        assert result == date(2026, 4, 13)
        assert result.weekday() == 0  # Monday

    def test_from_friday(self):
        # Friday 2026-04-10 + 3 working days = Wednesday 2026-04-15
        result = _compute_working_day_deadline(date(2026, 4, 10), 3)
        assert result == date(2026, 4, 15)

    def test_two_working_days(self):
        result = _compute_working_day_deadline(date(2026, 4, 6), 2)
        assert result == date(2026, 4, 8)  # Wednesday


class TestCountPriorPromises:
    def test_no_promises(self):
        assert _count_prior_promises([]) == 0
        assert _count_prior_promises([{"response_classification": "dispute"}]) == 0

    def test_counts_agreed_classifications(self):
        timeline = [
            {"response_classification": "agreed-with-deadline"},
            {"response_classification": "agreed-without-deadline"},
            {"response_classification": "dispute"},
        ]
        assert _count_prior_promises(timeline) == 2


class TestHasMissedDeadlines:
    def test_empty_timeline(self):
        assert _has_missed_deadlines([]) is False

    def test_no_deadline_items(self):
        assert _has_missed_deadlines([
            {"response_classification": "dispute", "stated_deadline": None, "computed_deadline": None},
        ]) is False

    def test_deadline_in_future(self):
        assert _has_missed_deadlines([
            {"response_classification": "agreed-with-deadline", "stated_deadline": "2099-12-31", "computed_deadline": None},
        ]) is False

    def test_deadline_in_past_is_missed(self):
        assert _has_missed_deadlines([
            {"response_classification": "agreed-with-deadline", "stated_deadline": "2024-01-01", "computed_deadline": None},
        ]) is True

    def test_uses_computed_deadline_as_fallback(self):
        assert _has_missed_deadlines([
            {"response_classification": "agreed-with-deadline", "stated_deadline": None, "computed_deadline": "2024-01-01"},
        ]) is True

    def test_not_missed_if_subsequent_claims_paid(self):
        assert _has_missed_deadlines([
            {"response_classification": "agreed-with-deadline", "stated_deadline": "2024-01-01", "computed_deadline": None},
            {"response_classification": "claims-paid", "stated_deadline": None, "computed_deadline": None},
        ]) is False

    def test_missed_if_claims_paid_before_deadline(self):
        """claims-paid before the deadline item doesn't count."""
        assert _has_missed_deadlines([
            {"response_classification": "claims-paid", "stated_deadline": None, "computed_deadline": None},
            {"response_classification": "agreed-with-deadline", "stated_deadline": "2024-01-01", "computed_deadline": None},
        ]) is True

    def test_ignores_non_agreed_classifications(self):
        assert _has_missed_deadlines([
            {"response_classification": "cant-afford", "stated_deadline": "2024-01-01", "computed_deadline": None},
        ]) is False


class TestDetectPhase:
    def _make_job(self, planned_handover_at: str | None = None) -> JobSnapshot:
        return JobSnapshot(id="job-1", name="Test", planned_handover_at=planned_handover_at)

    def test_friendly_by_default(self):
        job = self._make_job(planned_handover_at="2099-12-31T00:00:00")
        assert detect_phase(job, []) == "friendly"

    def test_post_handover_when_past_date(self):
        job = self._make_job(planned_handover_at="2020-01-01T00:00:00")
        assert detect_phase(job, []) == "post-handover"

    def test_post_loa_when_legal_letter_in_timeline(self):
        job = self._make_job(planned_handover_at="2020-01-01T00:00:00")
        timeline = [{"category": "letter", "short_description": "Letter of claim sent", "details": ""}]
        assert detect_phase(job, timeline) == "post-loa"

    def test_post_loa_from_step_type(self):
        job = self._make_job(planned_handover_at="2020-01-01T00:00:00")
        timeline = [{"type": "letter-of-claim", "short_description": "", "details": ""}]
        assert detect_phase(job, timeline) == "post-loa"


class TestDetermineResponseAction:
    def _make_classification(self, cls: str, deadline: str | None = None) -> DebtorResponseClassificationResult:
        return DebtorResponseClassificationResult(
            classification=cls,
            stated_deadline=deadline,
            confidence=0.9,
            reasoning="test",
        )

    def _make_job(self, handover_days: int = 14) -> JobSnapshot:
        return JobSnapshot(
            id="job-1", name="Test Debtor", price=1000.0, amount_paid=0.0,
            handover_days=handover_days,
        )

    def _prior_promise_timeline(self) -> list[dict[str, object]]:
        return [{
            "response_classification": "agreed-with-deadline",
            "stated_deadline": "2026-01-01",
            "computed_deadline": None,
            "short_description": "",
            "details": "",
        }]

    # --- claims-paid ---

    def test_claims_paid_friendly_awaits_confirmation(self):
        result = determine_response_action(
            classification_result=self._make_classification("claims-paid"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "await-payment-confirmation"

    def test_claims_paid_post_handover_auto_checks(self):
        result = determine_response_action(
            classification_result=self._make_classification("claims-paid"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-handover",
        )
        assert result.action == "auto-check-payment"

    def test_claims_paid_post_loa_auto_checks(self):
        result = determine_response_action(
            classification_result=self._make_classification("claims-paid"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-loa",
        )
        assert result.action == "auto-check-payment"

    # --- agreed-with-deadline, friendly ---

    def test_agreed_deadline_friendly_within_max_wait_pauses(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-04-10"),
            job_snapshot=self._make_job(handover_days=14),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "pause-until-deadline"

    def test_agreed_deadline_friendly_beyond_max_wait_sets_deadline(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-12-31"),
            job_snapshot=self._make_job(handover_days=14),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "set-deadline"
        assert result.computed_deadline is not None

    # --- agreed-with-deadline, post-handover ---

    def test_agreed_deadline_post_handover_first_short_pauses(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-04-20"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-handover",
        )
        assert result.action == "pause-until-deadline"

    def test_agreed_deadline_post_handover_first_long_negotiates(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-12-31"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-handover",
        )
        assert result.action == "negotiate"

    def test_agreed_deadline_post_handover_repeat_threatens(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-04-20"),
            job_snapshot=self._make_job(),
            timeline_items=self._prior_promise_timeline(),
            phase="post-handover",
        )
        assert result.action == "threaten-deadline"
        assert result.computed_deadline is not None

    # --- agreed-without-deadline ---

    def test_agreed_no_deadline_friendly_asks_for_timeline(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-without-deadline"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "ask-for-timeline"

    def test_agreed_no_deadline_post_handover_first_asks(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-without-deadline"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-handover",
        )
        assert result.action == "ask-for-timeline"

    def test_agreed_no_deadline_post_handover_repeat_threatens(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-without-deadline"),
            job_snapshot=self._make_job(),
            timeline_items=self._prior_promise_timeline(),
            phase="post-handover",
        )
        assert result.action == "threaten-deadline"

    def test_agreed_no_deadline_post_loa_repeat_sets_deadline(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-without-deadline"),
            job_snapshot=self._make_job(),
            timeline_items=self._prior_promise_timeline(),
            phase="post-loa",
        )
        assert result.action == "set-deadline"
        assert result.computed_deadline is not None

    def test_agreed_deadline_post_loa_repeat_sets_deadline_with_date(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-04-20"),
            job_snapshot=self._make_job(),
            timeline_items=self._prior_promise_timeline(),
            phase="post-loa",
        )
        assert result.action == "set-deadline"
        assert result.computed_deadline is not None

    # --- cant-afford ---

    def test_cant_afford_friendly_suggests_handover(self):
        result = determine_response_action(
            classification_result=self._make_classification("cant-afford"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "suggest-handover"

    def test_cant_afford_post_handover_negotiates(self):
        result = determine_response_action(
            classification_result=self._make_classification("cant-afford"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-handover",
        )
        assert result.action == "negotiate"

    def test_cant_afford_post_loa_negotiates(self):
        result = determine_response_action(
            classification_result=self._make_classification("cant-afford"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-loa",
        )
        assert result.action == "negotiate"

    # --- dispute ---

    def test_dispute_friendly_demands_evidence(self):
        result = determine_response_action(
            classification_result=self._make_classification("dispute"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "demand-evidence"

    def test_dispute_post_loa_demands_evidence(self):
        result = determine_response_action(
            classification_result=self._make_classification("dispute"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-loa",
        )
        assert result.action == "demand-evidence"
        assert "continue" in result.user_message.lower()

    # --- refusal ---

    def test_refusal_friendly_goes_legal(self):
        result = determine_response_action(
            classification_result=self._make_classification("refusal"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "go-legal"

    def test_refusal_post_handover_goes_legal(self):
        result = determine_response_action(
            classification_result=self._make_classification("refusal"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-handover",
        )
        assert result.action == "go-legal"

    def test_refusal_post_loa_continues_legal(self):
        result = determine_response_action(
            classification_result=self._make_classification("refusal"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-loa",
        )
        assert result.action == "continue-legal"

    # --- unclear ---

    def test_unclear_replans(self):
        result = determine_response_action(
            classification_result=self._make_classification("unclear"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="friendly",
        )
        assert result.action == "replan"

    # --- phase and guidance metadata ---

    def test_phase_included_in_result(self):
        result = determine_response_action(
            classification_result=self._make_classification("cant-afford"),
            job_snapshot=self._make_job(),
            timeline_items=[],
            phase="post-handover",
        )
        assert result.phase == "post-handover"
        assert result.guidance_notes  # should have negotiation guidance

    def test_is_first_offence_flag(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-04-20"),
            job_snapshot=self._make_job(),
            timeline_items=self._prior_promise_timeline(),
            phase="post-handover",
        )
        assert result.is_first_offence is False


class TestPaymentPlanStub:
    def test_basic_plan(self):
        job = JobSnapshot(id="job-1", name="Test", price=1200.0, amount_paid=0.0)
        plan = offer_payment_plan(job_snapshot=job, outstanding_balance=1200.0)
        assert plan["monthly_amount"] == 400.0
        assert plan["default_term_months"] == 3
        assert plan["max_term_months"] == 12
        assert plan["status"] == "stub"


# ---------------------------------------------------------------------------
# Live LLM classification tests — only run with: pytest -m live
# ---------------------------------------------------------------------------

@pytest.mark.live
class TestLiveClassification:
    """Run each sample response through gpt-5.4-nano and check the classification.

    These tests require OPENAI_API_KEY to be set and hit the real API.
    Run with: pytest backend/tests/test_response_classification.py -m live -v
    """

    @pytest.fixture(autouse=True)
    def _setup(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            pytest.skip("OPENAI_API_KEY not set")
        self.settings = Settings(
            data_dir=Settings.from_env().data_dir,
            database_path=Settings.from_env().database_path,
            uploads_dir=Settings.from_env().uploads_dir,
            openai_api_key=api_key,
            brevo_api_key=None,
            collexis_from_email="test@test.com",
            collexis_from_name="Test",
            brevo_sandbox=True,
            scheduler_poll_interval_seconds=60,
            scheduler_claim_timeout_seconds=600,
        )

    @pytest.mark.parametrize(
        "sample",
        SAMPLE_RESPONSES,
        ids=[s["id"] for s in SAMPLE_RESPONSES],
    )
    def test_classification(self, sample: dict[str, str]):
        result = classify_debtor_response(
            reply_body=sample["body"],
            settings=self.settings,
        )
        assert result.classification == sample["expected"], (
            f"Expected {sample['expected']} but got {result.classification} "
            f"(confidence={result.confidence:.2f}, reasoning={result.reasoning})"
        )
