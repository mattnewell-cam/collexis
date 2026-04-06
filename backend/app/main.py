from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import threading
from typing import Callable
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .brevo_email import brevo_configuration_error
from .config import Settings
from .database import init_db
from .extraction import SUPPORTED_EXTENSIONS, normalize_iso_date, process_document, summarize_job_intake
from .inbound_email_job_inference import infer_inbound_email_job
from .logging_utils import (
    LOG_HEADER_ACTION_ID,
    LOG_HEADER_REQUEST_ID,
    LOG_HEADER_SESSION_ID,
    LOG_HEADER_TRACE_ORIGIN,
    bind_log_context,
    configure_json_logging,
    log_event,
)
from .outreach_drafting import ensure_outreach_plan_drafts
from .outreach_planning import generate_outreach_plan
from .repository import DocumentRepository
from .response_classification import (
    classify_debtor_response,
    determine_response_action,
    offer_payment_plan,
)
from .scheduled_outreach import SchedulerMonitor, start_scheduler_thread
from .schemas import (
    DebtorResponseActionResult,
    DocumentResponse,
    DocumentUpdate,
    InboundEmailJobInferenceRequest,
    InboundEmailJobInferenceResponse,
    InboundEmailReplyRequest,
    JobDeleteResponse,
    JobIntakeSummary,
    OutreachPlanDraftEnsureRequest,
    OutreachPlanDraftUpdateRequest,
    OutreachPlanGenerateRequest,
    OutreachPlanStepResponse,
    OutreachPlanStepDraftResponse,
    ProcessingProfile,
    WhatsAppSendRequest,
    WhatsAppSendResponse,
    TimelineItemCreate,
    TimelineItemResponse,
    TimelineItemUpdate,
)
from .whatsapp_sender import playwright_whatsapp_configuration_error, send_playwright_whatsapp_messages

logger = logging.getLogger(__name__)


def normalize_recipient_emails(emails: list[str]) -> list[str]:
    return list(dict.fromkeys(email.strip().lower() for email in emails if email.strip()))


def enrich_planned_steps(
    planned_steps: list[dict[str, object]],
    *,
    recipient_emails: list[str],
) -> list[dict[str, object]]:
    normalized_emails = normalize_recipient_emails(recipient_emails)
    return [
        {
            **step,
            "recipient_emails": normalized_emails if str(step.get("type")) == "email" else [],
            "delivery_status": "pending",
            "processing_started_at": None,
            "sent_at": None,
            "failed_at": None,
            "attempt_count": 0,
            "last_error": None,
            "provider_message_id": None,
        }
        for step in planned_steps
    ]


def create_initial_outreach_plan_drafts(
    *,
    repository: DocumentRepository,
    job_id: str,
    job_snapshot: object,
    timeline_items: list[dict[str, object]],
    ready_documents: list[dict[str, object]],
    settings: Settings,
    draft_ensurer: Callable[..., list[dict[str, object]]],
) -> int:
    try:
        drafts_to_create = draft_ensurer(
            job_snapshot=job_snapshot,
            timeline_items=timeline_items,
            documents=ready_documents,
            plan_steps=repository.list_outreach_plan_steps(job_id),
            existing_drafts=repository.list_outreach_plan_drafts(job_id),
            settings=settings,
            window_days=None,
        )
        if drafts_to_create:
            created = repository.create_outreach_plan_drafts(job_id, drafts=drafts_to_create)
            draft_count = len(created)
            log_event(
                logger,
                logging.INFO,
                "outreach_plan.drafts.pre_generated",
                job_id=job_id,
                timeline_item_count=len(timeline_items),
                ready_document_count=len(ready_documents),
                created_draft_count=draft_count,
            )
            return draft_count
        log_event(
            logger,
            logging.INFO,
            "outreach_plan.drafts.pre_generation_skipped",
            job_id=job_id,
            timeline_item_count=len(timeline_items),
            ready_document_count=len(ready_documents),
            created_draft_count=0,
        )
        return 0
    except Exception:
        logger.exception("Outreach plan drafts could not be pre-generated for job %s", job_id)
        return 0


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_env()
    configure_json_logging(
        os.getenv("COLLEXIS_LOG_LEVEL", "INFO"),
        supabase_url=app_settings.supabase_url,
        supabase_service_role_key=app_settings.supabase_service_role_key,
    )
    init_db(app_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        stop_event = threading.Event()
        scheduler_monitor = SchedulerMonitor(app_settings.scheduler_poll_interval_seconds)
        app.state.scheduler_monitor = scheduler_monitor
        app.state.scheduler_stop_event = stop_event
        app.state.scheduler_thread = start_scheduler_thread(
            settings=app_settings,
            monitor=scheduler_monitor,
            stop_event=stop_event,
            draft_ensurer=app.state.outreach_plan_draft_ensurer,
        )
        try:
            yield
        finally:
            stop_event.set()
            app.state.scheduler_thread.join(timeout=5)

    app = FastAPI(title="Collexis backend", lifespan=lifespan)
    app.state.settings = app_settings
    app.state.document_processor = process_document
    app.state.job_intake_summarizer = summarize_job_intake
    app.state.outreach_plan_generator = generate_outreach_plan
    app.state.outreach_plan_draft_ensurer = ensure_outreach_plan_drafts
    app.state.inbound_email_job_inferer = infer_inbound_email_job
    app.state.whatsapp_sender = send_playwright_whatsapp_messages

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_logging_middleware(request: Request, call_next):
        request_id = request.headers.get(LOG_HEADER_REQUEST_ID) or str(uuid4())
        action_id = request.headers.get(LOG_HEADER_ACTION_ID)
        session_id = request.headers.get(LOG_HEADER_SESSION_ID)
        trace_origin = request.headers.get(LOG_HEADER_TRACE_ORIGIN)
        started_at = datetime.now(timezone.utc)
        with bind_log_context(
            request_id=request_id,
            action_id=action_id,
            session_id=session_id,
        ):
            log_event(
                logger,
                logging.INFO,
                "backend.request.received",
                method=request.method,
                path=request.url.path,
                trace_origin=trace_origin,
            )

            try:
                response = await call_next(request)
            except Exception as exc:
                duration_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)
                log_event(
                    logger,
                    logging.ERROR,
                    "backend.request.failed",
                    method=request.method,
                    path=request.url.path,
                    duration_ms=duration_ms,
                    error=exc,
                )
                raise

            duration_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)
            response.headers[LOG_HEADER_REQUEST_ID] = request_id
            response.headers[LOG_HEADER_TRACE_ORIGIN] = "backend"
            log_event(
                logger,
                logging.INFO if response.status_code < 500 else logging.WARNING,
                "backend.request.completed",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=duration_ms,
            )
            return response

    @app.get("/health")
    def health() -> Response:
        scheduler_monitor: SchedulerMonitor = app.state.scheduler_monitor
        snapshot = scheduler_monitor.snapshot()
        payload = {
            "status": "ok" if scheduler_monitor.is_healthy() else "degraded",
            "brevo_configured": brevo_configuration_error(app.state.settings) is None,
            "scheduler": {
                "started_at": snapshot.started_at,
                "last_heartbeat_at": snapshot.last_heartbeat_at,
                "last_success_at": snapshot.last_success_at,
                "last_error_at": snapshot.last_error_at,
                "last_error": snapshot.last_error,
                "processed_count": snapshot.processed_count,
            },
        }
        return JSONResponse(payload, status_code=200 if scheduler_monitor.is_healthy() else 503)

    @app.get("/jobs/{job_id}/documents", response_model=list[DocumentResponse])
    def list_documents(job_id: str) -> list[DocumentResponse]:
        repository = DocumentRepository(app.state.settings)
        return [DocumentResponse.model_validate(doc) for doc in repository.list_for_job(job_id)]

    @app.get("/jobs/{job_id}/timeline-items", response_model=list[TimelineItemResponse])
    def list_timeline_items(job_id: str) -> list[TimelineItemResponse]:
        repository = DocumentRepository(app.state.settings)
        return [TimelineItemResponse.model_validate(item) for item in repository.list_timeline_for_job(job_id)]

    @app.get("/jobs/{job_id}/intake-summary", response_model=JobIntakeSummary)
    def get_job_intake_summary(job_id: str) -> JobIntakeSummary:
        summarizer: Callable[[str, Settings], JobIntakeSummary] = app.state.job_intake_summarizer
        return summarizer(job_id, app.state.settings)

    @app.delete("/jobs/{job_id}", response_model=JobDeleteResponse)
    def delete_job(job_id: str) -> JobDeleteResponse:
        repository = DocumentRepository(app.state.settings)
        deleted = repository.delete_job(job_id)
        return JobDeleteResponse.model_validate(deleted)

    @app.get("/jobs/{job_id}/outreach-plan", response_model=list[OutreachPlanStepResponse])
    def list_outreach_plan_steps(job_id: str) -> list[OutreachPlanStepResponse]:
        repository = DocumentRepository(app.state.settings)
        return [
            OutreachPlanStepResponse.model_validate(step)
            for step in repository.list_outreach_plan_steps_with_drafts(job_id)
        ]

    @app.post("/jobs/infer-inbound-email-job", response_model=InboundEmailJobInferenceResponse)
    def infer_job_for_inbound_email(
        payload: InboundEmailJobInferenceRequest,
    ) -> InboundEmailJobInferenceResponse:
        if not payload.job_candidates:
            raise HTTPException(status_code=400, detail="At least one job candidate is required.")

        log_event(
            logger,
            logging.INFO,
            "inbound_email.inference.requested",
            candidate_count=len(payload.job_candidates),
            has_subject=bool(payload.reply.subject.strip()),
            body_length=len(payload.reply.body.strip()),
        )

        inferer: Callable[..., InboundEmailJobInferenceResponse] = app.state.inbound_email_job_inferer
        decision = inferer(
            reply=payload.reply,
            job_candidates=payload.job_candidates,
            settings=app.state.settings,
        )
        matched_job_id = decision.job_id if hasattr(decision, "job_id") else decision.get("job_id")
        confidence = decision.confidence if hasattr(decision, "confidence") else decision.get("confidence")
        log_event(
            logger,
            logging.INFO,
            "inbound_email.inference.completed",
            candidate_count=len(payload.job_candidates),
            matched_job_id=matched_job_id,
            confidence=confidence,
        )
        return InboundEmailJobInferenceResponse.model_validate(decision)

    @app.post("/jobs/{job_id}/outreach-plan/generate", response_model=list[OutreachPlanStepResponse])
    def generate_job_outreach_plan(
        job_id: str,
        payload: OutreachPlanGenerateRequest,
    ) -> list[OutreachPlanStepResponse]:
        if payload.job_snapshot.id != job_id:
            raise HTTPException(status_code=400, detail="Job snapshot does not match route job id.")

        repository = DocumentRepository(app.state.settings)
        generator: Callable[..., list[dict[str, object]]] = app.state.outreach_plan_generator
        timeline_items = repository.list_timeline_for_job(job_id)
        ready_documents = [
            document
            for document in repository.list_for_job(job_id)
            if str(document.get("status")) == "ready"
        ]
        log_event(
            logger,
            logging.INFO,
            "outreach_plan.generate.inputs_loaded",
            job_id=job_id,
            timeline_item_count=len(timeline_items),
            ready_document_count=len(ready_documents),
            has_incoming_reply=payload.incoming_reply_context is not None,
        )
        planned_steps = generator(
            job_snapshot=payload.job_snapshot,
            timeline_items=timeline_items,
            documents=ready_documents,
            incoming_reply_context=payload.incoming_reply_context,
            settings=app.state.settings,
        )
        stored_steps = repository.replace_outreach_plan_steps(
            job_id,
            steps=enrich_planned_steps(planned_steps, recipient_emails=payload.job_snapshot.emails),
        )
        created_draft_count = create_initial_outreach_plan_drafts(
            repository=repository,
            job_id=job_id,
            job_snapshot=payload.job_snapshot,
            timeline_items=timeline_items,
            ready_documents=ready_documents,
            settings=app.state.settings,
            draft_ensurer=app.state.outreach_plan_draft_ensurer,
        )
        log_event(
            logger,
            logging.INFO,
            "outreach_plan.generate.persisted",
            job_id=job_id,
            generated_step_count=len(planned_steps),
            stored_step_count=len(stored_steps),
            created_draft_count=created_draft_count,
        )
        enriched_steps = repository.list_outreach_plan_steps_with_drafts(job_id)
        return [
            OutreachPlanStepResponse.model_validate(step)
            for step in enriched_steps
        ]

    @app.post("/jobs/{job_id}/inbound-email-replies")
    def receive_inbound_email_reply(
        job_id: str,
        payload: InboundEmailReplyRequest,
    ) -> dict[str, object]:
        if payload.job_snapshot.id != job_id:
            raise HTTPException(status_code=400, detail="Job snapshot does not match route job id.")

        repository = DocumentRepository(app.state.settings)
        reply_subject = payload.reply.subject.strip()
        reply_body = payload.reply.body.strip()
        from_email = payload.reply.from_email.strip().lower()
        from_name = (payload.reply.from_name or "").strip()
        received_at = normalize_iso_date(payload.reply.received_at) or payload.reply.received_at or datetime.utcnow().date().isoformat()

        if not reply_subject and not reply_body:
            raise HTTPException(status_code=400, detail="Reply subject or body is required.")

        log_event(
            logger,
            logging.INFO,
            "inbound_email.reply.received",
            job_id=job_id,
            from_email=from_email,
            has_subject=bool(reply_subject),
            body_length=len(reply_body),
        )

        # Classify the debtor response before recording
        classification_result = classify_debtor_response(
            reply_body=reply_body,
            reply_subject=reply_subject,
            settings=app.state.settings,
        )
        log_event(
            logger,
            logging.INFO,
            "inbound_email.reply.classified",
            job_id=job_id,
            classification=classification_result.classification,
            confidence=classification_result.confidence,
        )

        # Load timeline to check for missed deadlines
        existing_timeline = repository.list_timeline_for_job(job_id)

        # Determine the action to take
        action_result = determine_response_action(
            classification_result=classification_result,
            job_snapshot=payload.job_snapshot,
            timeline_items=existing_timeline,
        )
        log_event(
            logger,
            logging.INFO,
            "inbound_email.reply.action_determined",
            job_id=job_id,
            classification=action_result.classification,
            action=action_result.action,
            has_missed_deadlines=action_result.has_missed_deadlines,
        )

        headline_source = from_name or from_email or "debtor"
        timeline_item = repository.create_timeline_item(
            job_id=job_id,
            category="conversation",
            subtype="email",
            sender=None,
            recipient="collexis",
            date=received_at,
            short_description=f"Email reply from {headline_source}",
            details="\n".join(
                part
                for part in [
                    f"From: {from_name} <{from_email}>" if from_name and from_email else (f"From: {from_email}" if from_email else ""),
                    f"Received at: {payload.reply.received_at}" if payload.reply.received_at else "",
                    f"Subject: {reply_subject}" if reply_subject else "",
                    "",
                    reply_body,
                ]
                if part
            ),
            response_classification=action_result.classification,
            response_action=action_result.action,
            stated_deadline=action_result.stated_deadline,
            computed_deadline=action_result.computed_deadline,
        )
        log_event(
            logger,
            logging.INFO,
            "inbound_email.reply.timeline_recorded",
            job_id=job_id,
            timeline_item_id=timeline_item["id"],
            received_at=received_at,
        )

        timeline_items = repository.list_timeline_for_job(job_id)
        ready_documents = [
            document
            for document in repository.list_for_job(job_id)
            if str(document.get("status")) == "ready"
        ]

        # Only replan if the action calls for it (not for actions that need user input first)
        plan_steps_response: list[dict[str, object]] = []
        should_replan = action_result.action in (
            "replan", "set-deadline", "ask-for-timeline", "threaten-deadline",
            "negotiate", "continue-legal",
        )

        if should_replan:
            log_event(
                logger,
                logging.INFO,
                "inbound_email.reply.replan_inputs_loaded",
                job_id=job_id,
                timeline_item_count=len(timeline_items),
                ready_document_count=len(ready_documents),
            )
            generator: Callable[..., list[dict[str, object]]] = app.state.outreach_plan_generator
            planned_steps = generator(
                job_snapshot=payload.job_snapshot,
                timeline_items=timeline_items,
                documents=ready_documents,
                incoming_reply_context=payload.reply,
                settings=app.state.settings,
            )
            stored_steps = repository.replace_outreach_plan_steps(
                job_id,
                steps=enrich_planned_steps(planned_steps, recipient_emails=payload.job_snapshot.emails),
            )
            created_draft_count = create_initial_outreach_plan_drafts(
                repository=repository,
                job_id=job_id,
                job_snapshot=payload.job_snapshot,
                timeline_items=timeline_items,
                ready_documents=ready_documents,
                settings=app.state.settings,
                draft_ensurer=app.state.outreach_plan_draft_ensurer,
            )
            log_event(
                logger,
                logging.INFO,
                "inbound_email.reply.replan_persisted",
                job_id=job_id,
                stored_step_count=len(stored_steps),
                created_draft_count=created_draft_count,
            )

        plan_steps_response = [
            OutreachPlanStepResponse.model_validate(step).model_dump(mode="json")
            for step in repository.list_outreach_plan_steps_with_drafts(job_id)
        ]

        return {
            "timeline_item": TimelineItemResponse.model_validate(timeline_item).model_dump(mode="json"),
            "plan_steps": plan_steps_response,
            "response_action": action_result.model_dump(mode="json"),
        }

    @app.post("/jobs/{job_id}/outreach-plan/drafts/ensure", response_model=list[OutreachPlanStepResponse])
    def ensure_job_outreach_plan_drafts(
        job_id: str,
        payload: OutreachPlanDraftEnsureRequest,
    ) -> list[OutreachPlanStepResponse]:
        if payload.job_snapshot.id != job_id:
            raise HTTPException(status_code=400, detail="Job snapshot does not match route job id.")

        repository = DocumentRepository(app.state.settings)
        stored_steps = repository.list_outreach_plan_steps(job_id)
        if not stored_steps:
            log_event(
                logger,
                logging.INFO,
                "outreach_plan.drafts.ensure.skipped",
                job_id=job_id,
                reason="no_stored_steps",
            )
            return []

        timeline_items = repository.list_timeline_for_job(job_id)
        ready_documents = [
            document
            for document in repository.list_for_job(job_id)
            if str(document.get("status")) == "ready"
        ]
        existing_drafts = repository.list_outreach_plan_drafts(job_id)
        log_event(
            logger,
            logging.INFO,
            "outreach_plan.drafts.ensure.requested",
            job_id=job_id,
            stored_step_count=len(stored_steps),
            existing_draft_count=len(existing_drafts),
            timeline_item_count=len(timeline_items),
            ready_document_count=len(ready_documents),
        )

        draft_ensurer: Callable[..., list[dict[str, object]]] = app.state.outreach_plan_draft_ensurer
        drafts_to_create = draft_ensurer(
            job_snapshot=payload.job_snapshot,
            timeline_items=timeline_items,
            documents=ready_documents,
            plan_steps=stored_steps,
            existing_drafts=existing_drafts,
            settings=app.state.settings,
        )
        if drafts_to_create:
            repository.create_outreach_plan_drafts(job_id, drafts=drafts_to_create)
        log_event(
            logger,
            logging.INFO,
            "outreach_plan.drafts.ensure.completed",
            job_id=job_id,
            stored_step_count=len(stored_steps),
            created_draft_count=len(drafts_to_create),
        )

        return [
            OutreachPlanStepResponse.model_validate(step)
            for step in repository.list_outreach_plan_steps_with_drafts(job_id)
        ]

    @app.patch("/outreach-plan-drafts/{draft_id}", response_model=OutreachPlanStepDraftResponse)
    def update_outreach_plan_draft(
        draft_id: str,
        payload: OutreachPlanDraftUpdateRequest,
    ) -> OutreachPlanStepDraftResponse:
        repository = DocumentRepository(app.state.settings)
        current = repository.get_outreach_plan_draft(draft_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Outreach plan draft not found.")

        try:
            updated = repository.update_outreach_plan_draft(
                draft_id,
                subject=payload.subject.strip() if payload.subject is not None else None,
                body=payload.body,
                is_user_edited=True,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Outreach plan draft not found.") from exc

        return OutreachPlanStepDraftResponse.model_validate(updated)

    @app.post("/jobs/{job_id}/documents", response_model=DocumentResponse)
    async def upload_document(
        job_id: str,
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        processing_profile: ProcessingProfile = Form("default"),
        timeline_item_id: str | None = Form(None),
    ) -> DocumentResponse:
        extension = Path(file.filename or "").suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Only PDF, PNG, JPG, JPEG and WEBP files are supported.")

        settings_for_request: Settings = app.state.settings
        repository = DocumentRepository(settings_for_request)
        if timeline_item_id is not None:
            timeline_item = repository.get_timeline_item(timeline_item_id)
            if timeline_item is None:
                raise HTTPException(status_code=404, detail="Timeline item not found.")
            if str(timeline_item["job_id"]) != job_id:
                raise HTTPException(status_code=400, detail="Timeline item does not belong to this job.")

        placeholder_path = f"pending{extension}"
        document = repository.create(
            job_id=job_id,
            original_filename=file.filename or "upload",
            mime_type=file.content_type or guess_mime_type(extension),
            storage_path=placeholder_path,
        )

        final_path = repository.build_storage_path(job_id, str(document["id"]), extension)
        repository.write_file(final_path, await file.read(), str(document["mime_type"]))
        document = repository.update_fields(document["id"], storage_path=final_path)
        if timeline_item_id is not None:
            repository.link_document_to_timeline_item(document["id"], timeline_item_id)
            document = repository.get(document["id"]) or document

        processor: Callable[[str, Settings, ProcessingProfile], None] = app.state.document_processor
        background_tasks.add_task(processor, document["id"], settings_for_request, processing_profile)
        return DocumentResponse.model_validate(document)

    @app.post("/jobs/{job_id}/timeline-items", response_model=TimelineItemResponse)
    def create_timeline_item(job_id: str, payload: TimelineItemCreate) -> TimelineItemResponse:
        repository = DocumentRepository(app.state.settings)
        created = repository.create_timeline_item(
            job_id=job_id,
            category=payload.category,
            subtype=payload.subtype,
            sender=payload.sender,
            recipient=payload.recipient,
            date=normalize_iso_date(payload.date) or payload.date,
            short_description=payload.short_description.strip(),
            details=payload.details,
        )
        return TimelineItemResponse.model_validate(created)

    @app.post("/jobs/{job_id}/send-whatsapp", response_model=WhatsAppSendResponse)
    def send_job_whatsapp(job_id: str, payload: WhatsAppSendRequest) -> WhatsAppSendResponse:
        configuration_error = playwright_whatsapp_configuration_error()
        if configuration_error is not None:
            raise HTTPException(status_code=500, detail=configuration_error)

        communication = payload.communication
        recipients = list(dict.fromkeys(recipient.strip() for recipient in payload.recipients if recipient.strip()))
        if not recipients:
            raise HTTPException(status_code=400, detail="At least one recipient phone number is required.")
        if communication.subtype != "whatsapp":
            raise HTTPException(status_code=400, detail="Only WhatsApp communications can be sent.")
        if not communication.short_description.strip():
            raise HTTPException(status_code=400, detail="A short description is required.")
        if not communication.details.strip():
            raise HTTPException(status_code=400, detail="WhatsApp body is required.")

        log_event(
            logger,
            logging.INFO,
            "communications.send_whatsapp.requested",
            job_id=job_id,
            recipient_count=len(recipients),
        )

        sender: Callable[..., list[str | None]] = app.state.whatsapp_sender
        try:
            message_ids = sender(
                recipients=recipients,
                text_body=communication.details.strip(),
                settings=app.state.settings,
            )
        except RuntimeError as exc:
            log_event(
                logger,
                logging.ERROR,
                "communications.send_whatsapp.failed",
                job_id=job_id,
                recipient_count=len(recipients),
                error=exc,
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        repository = DocumentRepository(app.state.settings)
        timeline_item = repository.create_timeline_item(
            job_id=job_id,
            category=communication.category,
            subtype=communication.subtype,
            sender=communication.sender,
            recipient=communication.recipient,
            date=normalize_iso_date(communication.date) or communication.date,
            short_description=communication.short_description.strip(),
            details=f"To: {', '.join(recipients)}\n\n{communication.details.strip()}",
        )
        log_event(
            logger,
            logging.INFO,
            "communications.send_whatsapp.completed",
            job_id=job_id,
            recipient_count=len(recipients),
            timeline_item_id=timeline_item["id"],
        )
        return WhatsAppSendResponse(
            timeline_item=TimelineItemResponse.model_validate(timeline_item),
            message_ids=message_ids,
        )

    @app.patch("/documents/{document_id}", response_model=DocumentResponse)
    def update_document(document_id: str, payload: DocumentUpdate) -> DocumentResponse:
        repository = DocumentRepository(app.state.settings)
        current = repository.get(document_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Document not found.")

        updates = payload.model_dump(exclude_unset=True)
        if "communication_date" in updates:
            updates["communication_date"] = normalize_iso_date(updates["communication_date"])

        try:
            updated = repository.update_fields(document_id, **updates)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Document not found.") from exc

        return DocumentResponse.model_validate(updated)

    @app.patch("/timeline-items/{timeline_item_id}", response_model=TimelineItemResponse)
    def update_timeline_item(timeline_item_id: str, payload: TimelineItemUpdate) -> TimelineItemResponse:
        repository = DocumentRepository(app.state.settings)
        current = repository.get_timeline_item(timeline_item_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Timeline item not found.")

        updates = payload.model_dump(exclude_unset=True)
        if "date" in updates:
            updates["date"] = normalize_iso_date(updates["date"]) or updates["date"]

        try:
            updated = repository.update_timeline_item(timeline_item_id, **updates)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Timeline item not found.") from exc

        return TimelineItemResponse.model_validate(updated)

    @app.post("/timeline-items/{timeline_item_id}/documents/{document_id}", response_model=TimelineItemResponse)
    def link_document_to_timeline_item(timeline_item_id: str, document_id: str) -> TimelineItemResponse:
        repository = DocumentRepository(app.state.settings)
        timeline_item = repository.get_timeline_item(timeline_item_id)
        if timeline_item is None:
            raise HTTPException(status_code=404, detail="Timeline item not found.")

        document = repository.get(document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found.")
        if str(document["job_id"]) != str(timeline_item["job_id"]):
            raise HTTPException(status_code=400, detail="Document does not belong to this job.")

        repository.link_document_to_timeline_item(document_id, timeline_item_id)
        updated = repository.get_timeline_item(timeline_item_id)
        if updated is None:
            raise HTTPException(status_code=404, detail="Timeline item not found.")
        return TimelineItemResponse.model_validate(updated)

    @app.delete("/timeline-items/{timeline_item_id}", response_model=TimelineItemResponse)
    def delete_timeline_item(timeline_item_id: str) -> TimelineItemResponse:
        repository = DocumentRepository(app.state.settings)
        try:
            deleted = repository.delete_timeline_item(timeline_item_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Timeline item not found.") from exc
        return TimelineItemResponse.model_validate(deleted)

    @app.get("/documents/{document_id}/file")
    def get_document_file(document_id: str) -> Response:
        repository = DocumentRepository(app.state.settings)
        document = repository.get(document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found.")

        try:
            file_content = repository.read_file(str(document["storage_path"]))
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Document file not found.")

        return Response(
            content=file_content,
            media_type=str(document["mime_type"]),
            headers={
                "Content-Disposition": f'inline; filename="{str(document["original_filename"])}"',
            },
        )

    return app


def guess_mime_type(extension: str) -> str:
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(extension, "application/octet-stream")


app = create_app()
