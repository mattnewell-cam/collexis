from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


DebtorResponseClassification = Literal[
    "dispute",
    "refusal",
    "agreed-with-deadline",
    "agreed-without-deadline",
    "cant-afford",
    "claims-paid",
    "unclear",
]

DebtorResponseAction = Literal[
    "await-payment-confirmation",
    "auto-check-payment",
    "pause-until-deadline",
    "negotiate",
    "set-deadline",
    "ask-for-timeline",
    "threaten-deadline",
    "demand-evidence",
    "suggest-handover",
    "go-legal",
    "continue-legal",
    "replan",
    "none",
]

DebtRecoveryPhase = Literal["friendly", "post-handover", "post-loa"]

DocumentStatus = Literal["processing", "ready", "failed"]
ProcessingProfile = Literal["default", "job-intake"]
TimelineCategory = Literal[
    "due-date",
    "handover-letter",
    "chase",
    "conversation",
    "letter",
    "other",
]
TimelineSubtype = Literal[
    "email",
    "sms",
    "whatsapp",
    "facebook",
    "voicemail",
    "home-visit",
    "phone",
    "in-person",
]
TimelineSender = Literal["you", "collexis"]
TimelineRecipient = Literal["debtor", "creditor", "collexis"]
TimelineDecisionAction = Literal["create_new", "link_existing"]


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    original_filename: str
    mime_type: str
    storage_path: str
    status: DocumentStatus
    title: str
    communication_date: str | None
    description: str
    transcript: str
    extraction_error: str | None
    linked_timeline_item_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DocumentUpdate(BaseModel):
    title: str | None = None
    communication_date: str | None = None
    description: str | None = None
    transcript: str | None = None


class JobIntakeSummary(BaseModel):
    job_description: str = Field(default="")
    job_detail: str = Field(default="")
    due_date: str | None = None
    price: float | None = None
    amount_paid: float | None = None
    emails: list[str] = Field(default_factory=list)
    phones: list[str] = Field(default_factory=list)
    context_instructions: str = Field(default="")


class ExtractedMessage(BaseModel):
    sender: str = Field(default="")
    datetime: str | None = None
    type: str = Field(default="unknown")
    raw_message: str = Field(default="")


class ExtractedDocument(BaseModel):
    title: str = Field(default="")
    date: str | None = None
    due_date: str | None = None
    description: str = Field(default="")
    messages: list[ExtractedMessage] = Field(default_factory=list)


class TimelineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    category: TimelineCategory
    subtype: TimelineSubtype | None = None
    sender: TimelineSender | None = None
    recipient: TimelineRecipient | None = None
    date: str
    short_description: str
    details: str
    response_classification: DebtorResponseClassification | None = None
    response_action: DebtorResponseAction | None = None
    linked_document_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class TimelineItemCreate(BaseModel):
    category: TimelineCategory
    subtype: TimelineSubtype | None = None
    sender: TimelineSender | None = None
    recipient: TimelineRecipient | None = None
    date: str
    short_description: str
    details: str = ""


class TimelineItemUpdate(BaseModel):
    category: TimelineCategory | None = None
    subtype: TimelineSubtype | None = None
    sender: TimelineSender | None = None
    recipient: TimelineRecipient | None = None
    date: str | None = None
    short_description: str | None = None
    details: str | None = None


class JobDeleteResponse(BaseModel):
    job_id: str
    deleted_document_count: int
    deleted_timeline_item_count: int
    deleted_file_count: int


OutreachPlanStepType = Literal[
    "email",
    "sms",
    "whatsapp",
    "call",
    "letter-warning",
    "letter-of-claim",
    "initiate-legal-action",
]
OutreachPlanSender = Literal["you", "collexis"]


class JobSnapshot(BaseModel):
    id: str
    name: str = Field(default="")
    address: str = Field(default="")
    job_description: str = Field(default="")
    job_detail: str = Field(default="")
    due_date: str | None = None
    price: float | None = None
    amount_paid: float | None = None
    days_overdue: int | None = None
    status: str = Field(default="")
    emails: list[str] = Field(default_factory=list)
    phones: list[str] = Field(default_factory=list)
    context_instructions: str = Field(default="")
    handover_days: int = 14
    planned_handover_at: str | None = None


class OutreachPlanStepDraftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    plan_step_id: str
    subject: str | None = None
    body: str
    is_user_edited: bool
    created_at: datetime
    updated_at: datetime


class OutreachPlanStepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    type: OutreachPlanStepType
    sender: OutreachPlanSender
    headline: str
    scheduled_for: str
    created_at: datetime
    updated_at: datetime
    draft: OutreachPlanStepDraftResponse | None = None


class OutreachPlanDraftStep(BaseModel):
    type: OutreachPlanStepType
    sender: OutreachPlanSender | None = None
    headline: str = Field(default="")
    scheduled_for: str


class OutreachPlanDraft(BaseModel):
    steps: list[OutreachPlanDraftStep] = Field(default_factory=list)


class IncomingReplyContext(BaseModel):
    from_email: str = Field(default="")
    from_name: str | None = None
    received_at: str | None = None
    subject: str = Field(default="")
    body: str = Field(default="")


class InboundEmailReplyRequest(BaseModel):
    job_snapshot: JobSnapshot
    reply: IncomingReplyContext


class InboundEmailJobInferenceRequest(BaseModel):
    reply: IncomingReplyContext
    job_candidates: list[JobSnapshot] = Field(default_factory=list)


class InboundEmailJobInferenceResponse(BaseModel):
    job_id: str | None = None
    confidence: float = 0.0
    rationale: str = Field(default="")


class OutreachPlanGenerateRequest(BaseModel):
    job_snapshot: JobSnapshot
    incoming_reply_context: IncomingReplyContext | None = None


class OutreachPlanDraftEnsureRequest(BaseModel):
    job_snapshot: JobSnapshot


class OutreachPlanDraftUpdateRequest(BaseModel):
    subject: str | None = None
    body: str


class OutreachPlanGeneratedCommunicationDraft(BaseModel):
    plan_step_id: str
    subject: str | None = None
    body: str = Field(default="")


class OutreachPlanGeneratedCommunicationDraftBatch(BaseModel):
    drafts: list[OutreachPlanGeneratedCommunicationDraft] = Field(default_factory=list)


class TimelineDecision(BaseModel):
    action: TimelineDecisionAction = "create_new"
    existing_timeline_item_id: str | None = None
    category: TimelineCategory | None = None
    subtype: TimelineSubtype | None = None
    sender: TimelineSender | None = None
    date: str | None = None
    short_description: str = Field(default="")
    details: str = Field(default="")


class DebtRecoveryContext(BaseModel):
    outstanding_balance: float = 0.0
    court_fee_amount: float | None = None
    court_fee_band_label: str = Field(default="")
    payment_sort_code: str = Field(default="")
    payment_account_number: str = Field(default="")
    phase: DebtRecoveryPhase = "friendly"


class DebtorResponseClassificationResult(BaseModel):
    classification: DebtorResponseClassification
    stated_deadline: str | None = Field(default=None, description="ISO date if the debtor named a specific payment date")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reasoning: str = Field(default="")


class DebtorResponseActionResult(BaseModel):
    classification: DebtorResponseClassification
    action: DebtorResponseAction
    phase: DebtRecoveryPhase = "friendly"
    stated_deadline: str | None = None
    computed_deadline: str | None = Field(default=None, description="3 working-day deadline (2 if 3 lands on Sunday)")
    has_missed_deadlines: bool = False
    is_first_offence: bool = True
    confidence: float = 0.0
    reasoning: str = Field(default="")
    user_message: str = Field(default="", description="Human-readable summary for the UI")
    guidance_notes: str = Field(default="", description="Context notes for the AI drafter on how to handle this response")
