from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Callable

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import Settings
from .database import init_db
from .extraction import SUPPORTED_EXTENSIONS, normalize_iso_date, process_document, summarize_job_intake
from .inbound_email_job_inference import infer_inbound_email_job
from .outreach_drafting import ensure_outreach_plan_drafts
from .outreach_planning import generate_outreach_plan
from .repository import DocumentRepository
from .schemas import (
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
    TimelineItemCreate,
    TimelineItemResponse,
    TimelineItemUpdate,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_env()
    init_db(app_settings)

    app = FastAPI(title="Collexis backend")
    app.state.settings = app_settings
    app.state.document_processor = process_document
    app.state.job_intake_summarizer = summarize_job_intake
    app.state.outreach_plan_generator = generate_outreach_plan
    app.state.outreach_plan_draft_ensurer = ensure_outreach_plan_drafts
    app.state.inbound_email_job_inferer = infer_inbound_email_job

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

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

        inferer: Callable[..., InboundEmailJobInferenceResponse] = app.state.inbound_email_job_inferer
        decision = inferer(
            reply=payload.reply,
            job_candidates=payload.job_candidates,
            settings=app.state.settings,
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
        planned_steps = generator(
            job_snapshot=payload.job_snapshot,
            timeline_items=timeline_items,
            documents=ready_documents,
            incoming_reply_context=payload.incoming_reply_context,
            settings=app.state.settings,
        )
        repository.replace_outreach_plan_steps(job_id, steps=planned_steps)
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

        headline_source = from_name or from_email or "debtor"
        timeline_item = repository.create_timeline_item(
            job_id=job_id,
            category="conversation",
            subtype="email",
            sender=None,
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
        )

        timeline_items = repository.list_timeline_for_job(job_id)
        ready_documents = [
            document
            for document in repository.list_for_job(job_id)
            if str(document.get("status")) == "ready"
        ]
        generator: Callable[..., list[dict[str, object]]] = app.state.outreach_plan_generator
        planned_steps = generator(
            job_snapshot=payload.job_snapshot,
            timeline_items=timeline_items,
            documents=ready_documents,
            incoming_reply_context=payload.reply,
            settings=app.state.settings,
        )
        repository.replace_outreach_plan_steps(job_id, steps=planned_steps)

        return {
            "timeline_item": TimelineItemResponse.model_validate(timeline_item).model_dump(mode="json"),
            "plan_steps": [
                OutreachPlanStepResponse.model_validate(step).model_dump(mode="json")
                for step in repository.list_outreach_plan_steps_with_drafts(job_id)
            ],
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
            return []

        draft_ensurer: Callable[..., list[dict[str, object]]] = app.state.outreach_plan_draft_ensurer
        drafts_to_create = draft_ensurer(
            job_snapshot=payload.job_snapshot,
            timeline_items=repository.list_timeline_for_job(job_id),
            documents=[
                document
                for document in repository.list_for_job(job_id)
                if str(document.get("status")) == "ready"
            ],
            plan_steps=stored_steps,
            existing_drafts=repository.list_outreach_plan_drafts(job_id),
            settings=app.state.settings,
        )
        if drafts_to_create:
            repository.create_outreach_plan_drafts(job_id, drafts=drafts_to_create)

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
            date=normalize_iso_date(payload.date) or payload.date,
            short_description=payload.short_description.strip(),
            details=payload.details,
        )
        return TimelineItemResponse.model_validate(created)

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
