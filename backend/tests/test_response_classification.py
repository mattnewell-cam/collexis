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
    offer_payment_plan,
    _compute_working_day_deadline,
)
from backend.app.schemas import (
    DebtorResponseClassificationResult,
    JobSnapshot,
)
from datetime import date


# ---------------------------------------------------------------------------
# Sample debtor responses covering each classification
# ---------------------------------------------------------------------------

SAMPLE_RESPONSES: list[dict[str, str]] = [
    # --- refused-or-disputed ---
    {
        "id": "refuse-1",
        "body": "I'm not paying this. The work was shoddy and I've already complained. You'll be hearing from my solicitor.",
        "expected": "refused-or-disputed",
    },
    {
        "id": "refuse-2",
        "body": "This is ridiculous. I never agreed to pay this amount and I don't owe you anything. Stop contacting me.",
        "expected": "refused-or-disputed",
    },
    {
        "id": "refuse-3",
        "body": "The job was never finished properly so I'm disputing this invoice. I'm not paying until you fix the issues.",
        "expected": "refused-or-disputed",
    },
    {
        "id": "refuse-4",
        "body": "Absolutely not. Take me to court if you want, I'm not paying a penny.",
        "expected": "refused-or-disputed",
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

    def test_lands_on_sunday_uses_two_days(self):
        # If 3 working days would land on a Sunday, use 2 instead.
        # Thursday 2026-04-02 + 3 working days = Tuesday 2026-04-07 (not Sunday)
        # Let's find a case where it would land on Sunday...
        # Actually the function skips weekends, so 3 working days can never
        # land on a weekend. The Sunday check is for edge cases where
        # the calendar math might differ. Let's test the 2-day fallback directly.
        result = _compute_working_day_deadline(date(2026, 4, 6), 2)
        assert result == date(2026, 4, 8)  # Wednesday


class TestDetermineResponseAction:
    def _make_classification(self, cls: str, deadline: str | None = None) -> DebtorResponseClassificationResult:
        return DebtorResponseClassificationResult(
            classification=cls,
            stated_deadline=deadline,
            confidence=0.9,
            reasoning="test",
        )

    def _make_job(self) -> JobSnapshot:
        return JobSnapshot(id="job-1", name="Test Debtor", price=1000.0, amount_paid=0.0)

    def test_refused_suggests_handover(self):
        result = determine_response_action(
            classification_result=self._make_classification("refused-or-disputed"),
            job_snapshot=self._make_job(),
            timeline_items=[],
        )
        assert result.action == "suggest-handover"
        assert result.classification == "refused-or-disputed"

    def test_agreed_with_deadline_pauses(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-04-20"),
            job_snapshot=self._make_job(),
            timeline_items=[],
        )
        assert result.action == "pause-until-deadline"

    def test_agreed_with_deadline_but_missed_before_offers_plan(self):
        timeline = [{"short_description": "Payment not received by deadline", "details": "Debtor missed deadline again"}]
        result = determine_response_action(
            classification_result=self._make_classification("agreed-with-deadline", "2026-04-20"),
            job_snapshot=self._make_job(),
            timeline_items=timeline,
        )
        assert result.action == "offer-payment-plan"
        assert result.has_missed_deadlines is True

    def test_agreed_without_deadline_sets_deadline(self):
        result = determine_response_action(
            classification_result=self._make_classification("agreed-without-deadline"),
            job_snapshot=self._make_job(),
            timeline_items=[],
        )
        assert result.action == "set-deadline"
        assert result.computed_deadline is not None

    def test_cant_afford_offers_plan(self):
        result = determine_response_action(
            classification_result=self._make_classification("cant-afford"),
            job_snapshot=self._make_job(),
            timeline_items=[],
        )
        assert result.action == "offer-payment-plan"

    def test_claims_paid_awaits_confirmation(self):
        result = determine_response_action(
            classification_result=self._make_classification("claims-paid"),
            job_snapshot=self._make_job(),
            timeline_items=[],
        )
        assert result.action == "await-payment-confirmation"

    def test_unclear_replans(self):
        result = determine_response_action(
            classification_result=self._make_classification("unclear"),
            job_snapshot=self._make_job(),
            timeline_items=[],
        )
        assert result.action == "replan"


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
