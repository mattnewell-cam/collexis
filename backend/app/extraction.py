from __future__ import annotations

import base64
import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Callable

from openai import OpenAI

from .config import Settings
from .repository import DocumentRepository, filename_stem
from .schemas import ExtractedDocument, JobIntakeSummary, ProcessingProfile, TimelineDecision


SUPPORTED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
TRANSCRIPT_SEPARATOR = "\n============\n"
COMPANY_MANIFEST_PATH = Path(__file__).resolve().parents[2] / "public" / "sample-documents" / "manifest.json"
DEFAULT_EXTRACTION_MODEL = "gpt-5.4-nano"
JOB_INTAKE_EXTRACTION_MODEL = "gpt-5.4-mini"
TIMELINE_PLANNING_MODEL = "gpt-5.4-mini"
JOB_INTAKE_SUMMARY_MODEL = "gpt-5.4-mini"
TIMELINE_PLANNING_PROMPT = (
    "You are deciding how an uploaded document should map onto a debt-recovery timeline. "
    "Return only the schema. "
    "Choose action='link_existing' only when the document is clearly the same event or communication "
    "already represented by one timeline item. Otherwise choose action='create_new'. "
    "If creating a new item, fill category, subtype, sender, date, short_description, and details. "
    "There can be at most one 'due-date' item per job. "
    "Use category 'due-date' only for the original payment deadline being set, normally from the invoice "
    "or first explicit payment notice that establishes when payment is due. "
    "Never use 'due-date' for reminders, overdue notices, follow-ups, or messages/emails that merely mention "
    "an existing due date. Those are usually 'chase', 'conversation', or 'letter' instead. "
    "Use category 'due-date' for the original invoice due date or first payment due notice, "
    "'collexis-handover' for handover/escalation into Collexis, 'chase' for reminders/follow-ups/"
    "voicemails/home visits and obvious payment-chasing emails/messages, "
    "'conversation' for substantive two-way exchanges or calls, 'letter' for formal letters/notices, "
    "and 'other' only when none fit. "
    "A one-way email asking for payment, following up on an overdue invoice, or chasing settlement is a "
    "'chase' with subtype 'email', not a 'due-date'. "
    "Use a subtype only for chase or conversation items, and only from the allowed enum. "
    "Set sender to null instead of guessing when the action is incoming from the debtor/client or unclear. "
    "Keep short_description under 10 words and concrete. "
    "Details should be concise but useful, normally 1-3 sentences."
)
CHASE_SUBTYPES = {"email", "sms", "whatsapp", "facebook", "voicemail", "home-visit"}
CONVERSATION_SUBTYPES = {"email", "sms", "whatsapp", "facebook", "phone", "in-person"}
DATETIME_FORMAT = "%Y-%m-%d %H:%M"


@lru_cache(maxsize=1)
def load_company_context() -> dict[str, object]:
    default_context: dict[str, object] = {
        "name": "Collexis",
        "short_name": "Collexis",
        "emails": tuple(),
        "phones": tuple(),
    }
    if not COMPANY_MANIFEST_PATH.exists():
        return default_context

    try:
        payload = json.loads(COMPANY_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default_context

    company = payload.get("company")
    if not isinstance(company, dict):
        return default_context

    emails = []
    for key in ("accountsEmail", "creditEmail"):
        value = company.get(key)
        if isinstance(value, str) and value.strip():
            emails.append(value.strip().lower())

    phone_value = company.get("phone")
    phones = []
    if isinstance(phone_value, str) and phone_value.strip():
        phones.append(phone_value.strip())

    name = company.get("name")
    short_name = company.get("shortName")
    return {
        "name": name.strip() if isinstance(name, str) and name.strip() else default_context["name"],
        "short_name": short_name.strip() if isinstance(short_name, str) and short_name.strip() else default_context["short_name"],
        "emails": tuple(dict.fromkeys(emails)),
        "phones": tuple(dict.fromkeys(phones)),
    }


def build_extraction_prompt() -> str:
    company_context = load_company_context()
    company_name = str(company_context["name"])
    return (
        "Extract communication metadata from this document. Return only the schema. "
        f"The creditor/business on this case is {company_name}. "
        "Title: short specific title for the communication. "
        "Date: main issue/send date visible in the document; for invoices use the invoice issue date, "
        "for messages/emails use the message send date, and if a conversation spans multiple days use the first day only; "
        "if unclear, return null. "
        "Due date: for invoices, statements, reminders, or payment notices, capture the visible payment due date; otherwise null. "
        "Description: max 50 words summarising the communication. "
        "Messages: one item per visible message/email with sender, datetime as shown or null, "
        "type, and raw_message preserving wording. "
        f"When a visible message is clearly from {company_name} or its staff, set sender to {company_name} exactly. "
        "When a visible message is clearly from the debtor/client, use their visible name. "
        "Do not label clearly outgoing business messages as Unknown. "
        "For invoices or single formal documents, it is acceptable to return one message-like item representing the document; "
        "if you do, set datetime to the visible issue date when shown. "
        "Do not invent missing details."
    )


def build_job_intake_summary_prompt() -> str:
    company_context = load_company_context()
    company_name = str(company_context["name"])
    business_emails = ", ".join(str(email) for email in company_context["emails"]) or "none"
    business_phones = ", ".join(str(phone) for phone in company_context["phones"]) or "none"
    return (
        "Summarize this uploaded debt-recovery case into job details. Return only the schema. "
        "Use only facts that are clearly supported by the processed documents and linked timeline items. "
        f"The creditor/business is {company_name}. "
        f"Never include the creditor's own contact details in emails or phones. Creditor emails: {business_emails}. Creditor phones: {business_phones}. "
        "Return debtor/client contact details only; if none are visible, return empty lists. "
        "job_description: a short plain-English summary of the work or invoice. "
        "job_detail: a concise fuller summary of the work, invoice, dispute, and payment position. "
        "due_date: the invoice or payment due date if clear, otherwise null. "
        "price: total invoice amount if clear, otherwise null. "
        "amount_paid: amount already paid if clearly stated, otherwise null. "
        "emails: distinct customer/client/debtor email addresses only. "
        "phones: distinct customer/client/debtor phone numbers only. "
        "context_instructions: concise internal collection notes, max 35 words. "
        "Do not repeat the creditor's contact details, business address, or long invoice line items. "
        "Do not invent missing details."
    )


def limit_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).strip()


def canonicalize_sender(sender: str, *, company_name: str, company_short_name: str) -> str:
    normalized_sender = sender.strip()
    if not normalized_sender:
        return ""

    lowered = normalized_sender.lower()
    business_aliases = {
        company_name.lower(),
        company_short_name.lower(),
        "accounts",
        "accounts team",
        "credit control",
        "collections",
        "accounts department",
    }
    if lowered in business_aliases:
        return company_name

    return normalized_sender


def clean_sender_name(sender: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", sender).strip()


def raw_message_addresses_name(raw_message: str, participant_name: str) -> bool:
    if not participant_name:
        return False
    first_name = participant_name.split()[0]
    escaped_first_name = re.escape(first_name)
    return re.search(rf"^(hi|hello|morning|afternoon|evening)\s+{escaped_first_name}\b", raw_message.strip(), re.IGNORECASE) is not None


def apply_conversation_sender_heuristics(
    messages: list[dict[str, str | None]],
    *,
    company_name: str,
    company_short_name: str,
) -> list[dict[str, str | None]]:
    participant_names = [
        clean_sender_name(str(message.get("sender") or ""))
        for message in messages
        if clean_sender_name(str(message.get("sender") or ""))
        and clean_sender_name(str(message.get("sender") or "")).lower() not in {company_name.lower(), company_short_name.lower()}
    ]
    unique_participants = list(dict.fromkeys(participant_names))
    if len(unique_participants) != 1:
        return messages

    participant_name = unique_participants[0]
    resolved_messages: list[dict[str, str | None]] = []
    previous_sender = ""

    for message in messages:
        raw_message = str(message.get("raw_message") or "")
        cleaned_sender = clean_sender_name(str(message.get("sender") or ""))
        resolved_sender = cleaned_sender

        if raw_message_addresses_name(raw_message, participant_name):
            resolved_sender = company_name
        elif not cleaned_sender:
            resolved_sender = participant_name if previous_sender == company_name else company_name
        elif cleaned_sender == participant_name and previous_sender == company_name:
            resolved_sender = participant_name

        resolved_messages.append({**message, "sender": resolved_sender})
        previous_sender = resolved_sender

    return resolved_messages


def normalize_iso_date(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    try:
        year, month, day = candidate.split("T", 1)[0].split("-")
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    except (TypeError, ValueError):
        return None


def parse_datetime_value(value: str | None, *, fallback_date: str | None = None) -> datetime | None:
    if not value:
        return None

    candidate = re.sub(r"\s+", " ", value.strip())
    if not candidate:
        return None

    if fallback_date:
        for time_format in ("%H:%M", "%H.%M"):
            try:
                parsed_time = datetime.strptime(candidate, time_format)
                return datetime.strptime(
                    f"{fallback_date} {parsed_time.strftime('%H:%M')}",
                    DATETIME_FORMAT,
                )
            except ValueError:
                continue

    normalized = candidate.replace("/", "-")
    format_attempts = (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H.%M",
        "%Y-%m-%d",
        "%d %B %Y %H:%M",
        "%d %b %Y %H:%M",
        "%a %d %B %Y %H:%M",
        "%a %d %b %Y %H:%M",
        "%d %B %Y",
        "%d %b %Y",
        "%a %d %B %Y",
        "%a %d %b %Y",
    )

    for format_string in format_attempts:
        try:
            parsed = datetime.strptime(normalized, format_string)
            if "%H" not in format_string:
                parsed = parsed.replace(hour=0, minute=0)
            return parsed
        except ValueError:
            continue

    return None


def normalize_message_datetime(value: str | None, *, fallback_date: str | None = None) -> str | None:
    parsed = parse_datetime_value(value, fallback_date=fallback_date)
    if parsed is None:
        return None
    return parsed.strftime(DATETIME_FORMAT)


def infer_communication_date(
    explicit_date: str | None,
    normalized_messages: list[dict[str, str | None]],
    *,
    original_filename: str,
) -> str | None:
    if explicit_date:
        return explicit_date

    for message in normalized_messages:
        datetime_value = message.get("datetime")
        if not datetime_value:
            continue
        return datetime_value.split(" ", 1)[0]

    return infer_date_from_filename(original_filename)


def infer_date_from_filename(filename: str) -> str | None:
    match = re.search(r"(20\d{2}-\d{2}-\d{2})", filename)
    if not match:
        return None
    return normalize_iso_date(match.group(1))


def format_transcript(messages: list[dict[str, str | None]]) -> str:
    blocks: list[str] = []
    for message in messages:
        blocks.append(
            "\n".join(
                [
                    f"sender: {(message.get('sender') or '').strip()}",
                    f"datetime: {(message.get('datetime') or '').strip()}",
                    f"type: {(message.get('type') or 'unknown').strip() or 'unknown'}",
                    "raw_message:",
                    (message.get("raw_message") or "").rstrip(),
                ]
            ).rstrip()
        )
    return TRANSCRIPT_SEPARATOR.join(blocks)


def normalize_email_address(value: str) -> str:
    return value.strip().lower()


def normalize_phone_number(value: str) -> str:
    return re.sub(r"\D+", "", value)


def normalize_channel_type(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized == "text":
        return "sms"
    return normalized


def filter_external_contacts(values: list[str], *, kind: str) -> list[str]:
    company_context = load_company_context()
    company_emails = {normalize_email_address(str(email)) for email in company_context["emails"]}
    company_phone_numbers = {normalize_phone_number(str(phone)) for phone in company_context["phones"]}
    company_domains = {
        email.split("@", 1)[1]
        for email in company_emails
        if "@" in email
    }

    filtered: list[str] = []
    seen: set[str] = set()

    for value in values:
        trimmed = value.strip()
        if not trimmed:
            continue

        if kind == "email":
            normalized_value = normalize_email_address(trimmed)
            if normalized_value in company_emails:
                continue
            if "@" in normalized_value and normalized_value.split("@", 1)[1] in company_domains:
                continue
            dedupe_key = normalized_value
        else:
            normalized_value = normalize_phone_number(trimmed)
            if normalized_value and normalized_value in company_phone_numbers:
                continue
            dedupe_key = normalized_value or trimmed

        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        filtered.append(trimmed)

    return filtered


def normalize_job_intake_summary(summary: JobIntakeSummary) -> JobIntakeSummary:
    company_context = load_company_context()
    context_text = summary.context_instructions.strip()
    for business_email in company_context["emails"]:
        context_text = context_text.replace(str(business_email), "")
    for business_phone in company_context["phones"]:
        context_text = context_text.replace(str(business_phone), "")
    context_text = re.sub(r"\s{2,}", " ", context_text).strip(" ,;")

    return JobIntakeSummary(
        job_description=summary.job_description.strip(),
        job_detail=summary.job_detail.strip(),
        due_date=summary.due_date,
        price=summary.price,
        amount_paid=summary.amount_paid,
        emails=filter_external_contacts(summary.emails, kind="email"),
        phones=filter_external_contacts(summary.phones, kind="phone"),
        context_instructions=limit_words(context_text, 35),
    )


def normalize_extraction(
    extracted: ExtractedDocument,
    *,
    original_filename: str,
) -> dict[str, str | None]:
    company_context = load_company_context()
    company_name = str(company_context["name"])
    company_short_name = str(company_context["short_name"])
    explicit_date = normalize_iso_date(extracted.date)
    due_date = normalize_iso_date(extracted.due_date)
    normalized_messages: list[dict[str, str | None]] = []
    for message in extracted.messages:
        normalized_type = normalize_channel_type(message.type or "unknown") or "unknown"
        normalized_datetime = normalize_message_datetime(
            message.datetime,
            fallback_date=explicit_date,
        )
        if normalized_datetime is None and normalized_type == "invoice" and explicit_date:
            normalized_datetime = f"{explicit_date} 00:00"
        normalized_messages.append(
            {
                "sender": canonicalize_sender(
                    message.sender,
                    company_name=company_name,
                    company_short_name=company_short_name,
                ),
                "datetime": normalized_datetime,
                "type": normalized_type,
                "raw_message": message.raw_message.rstrip(),
            }
        )

    normalized_messages = apply_conversation_sender_heuristics(
        normalized_messages,
        company_name=company_name,
        company_short_name=company_short_name,
    )

    title = extracted.title.strip() or filename_stem(original_filename)
    description = limit_words(extracted.description.strip(), 50)
    communication_date = infer_communication_date(
        explicit_date,
        normalized_messages,
        original_filename=original_filename,
    )
    transcript = format_transcript(normalized_messages)

    return {
        "title": title,
        "communication_date": communication_date,
        "due_date": due_date,
        "description": description,
        "transcript": transcript,
    }


def build_image_data_url(path: Path, mime_type: str) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def extraction_model_for_profile(processing_profile: ProcessingProfile) -> str:
    if processing_profile == "job-intake":
        return JOB_INTAKE_EXTRACTION_MODEL
    return DEFAULT_EXTRACTION_MODEL


def extract_document_metadata(
    document: dict[str, object],
    settings: Settings,
    processing_profile: ProcessingProfile = "default",
) -> ExtractedDocument:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=settings.openai_api_key)
    path = Path(str(document["storage_path"]))
    mime_type = str(document["mime_type"])
    filename = str(document["original_filename"])
    extraction_model = extraction_model_for_profile(processing_profile)

    if mime_type == "application/pdf":
        with path.open("rb") as file_handle:
            uploaded_file = client.files.create(
                file=(filename, file_handle, mime_type),
                purpose="user_data",
            )
        try:
            response = client.responses.parse(
                model=extraction_model,
                input=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": build_extraction_prompt()},
                            {"type": "input_file", "file_id": uploaded_file.id},
                        ],
                    }
                ],
                text_format=ExtractedDocument,
            )
        finally:
            try:
                client.files.delete(uploaded_file.id)
            except Exception:
                pass
    else:
        response = client.responses.parse(
            model=extraction_model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": build_extraction_prompt()},
                        {
                            "type": "input_image",
                            "image_url": build_image_data_url(path, mime_type),
                        },
                    ],
                }
            ],
            text_format=ExtractedDocument,
        )

    return response.output_parsed


def summarize_job_intake(job_id: str, settings: Settings) -> JobIntakeSummary:
    repository = DocumentRepository(settings)
    documents = [
        document
        for document in repository.list_for_job(job_id)
        if str(document["status"]) == "ready"
    ]
    if not documents:
        return JobIntakeSummary()

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    timeline_items = repository.list_timeline_for_job(job_id)
    payload = {
        "job_id": job_id,
        "documents": [
            {
                "id": str(document["id"]),
                "original_filename": str(document["original_filename"]),
                "title": str(document["title"]),
                "communication_date": document["communication_date"],
                "description": str(document["description"]),
                "transcript": str(document["transcript"]),
                "linked_timeline_item_ids": document["linked_timeline_item_ids"],
            }
            for document in documents
        ],
        "timeline_items": [
            {
                "id": str(item["id"]),
                "category": str(item["category"]),
                "subtype": item["subtype"],
                "sender": item["sender"],
                "date": str(item["date"]),
                "short_description": str(item["short_description"]),
                "details": str(item["details"]),
                "linked_document_ids": item["linked_document_ids"],
            }
            for item in timeline_items
        ],
    }

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.parse(
        model=JOB_INTAKE_SUMMARY_MODEL,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": build_job_intake_summary_prompt()},
                    {"type": "input_text", "text": json.dumps(payload, ensure_ascii=True)},
                ],
            }
        ],
        text_format=JobIntakeSummary,
    )
    return normalize_job_intake_summary(response.output_parsed)


def plan_document_timeline(
    *,
    document: dict[str, object],
    normalized_document: dict[str, str | None],
    existing_timeline_items: list[dict[str, object]],
    settings: Settings,
) -> TimelineDecision:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=settings.openai_api_key)
    timeline_context = [
        {
            "id": str(item["id"]),
            "date": str(item["date"]),
            "category": str(item["category"]),
            "subtype": item["subtype"],
            "sender": item["sender"],
            "short_description": str(item["short_description"]),
            "details": str(item["details"]),
        }
        for item in existing_timeline_items
    ]

    payload = {
        "job_id": str(document["job_id"]),
        "document": {
            "id": str(document["id"]),
            "original_filename": str(document["original_filename"]),
            "mime_type": str(document["mime_type"]),
            "title": normalized_document["title"],
            "communication_date": normalized_document["communication_date"],
            "due_date": normalized_document.get("due_date"),
            "description": normalized_document["description"],
            "transcript": normalized_document["transcript"],
        },
        "existing_timeline_items": timeline_context,
    }

    response = client.responses.parse(
        model=TIMELINE_PLANNING_MODEL,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": TIMELINE_PLANNING_PROMPT},
                    {"type": "input_text", "text": json.dumps(payload, ensure_ascii=True)},
                ],
            }
        ],
        text_format=TimelineDecision,
    )
    return response.output_parsed


def normalize_timeline_details(
    details: str,
    *,
    normalized_document: dict[str, str | None],
) -> str:
    preferred = details.strip()
    if preferred:
        return limit_words(preferred, 120)
    if normalized_document["description"]:
        return str(normalized_document["description"]).strip()
    if normalized_document["transcript"]:
        return limit_words(str(normalized_document["transcript"]).strip(), 120)
    return str(normalized_document["title"]).strip()


def infer_transcript_message_types(transcript: str) -> list[str]:
    return [
        normalize_channel_type(match)
        for match in re.findall(r"^type:\s*(.+)$", transcript, re.MULTILINE)
        if match.strip()
    ]


def infer_transcript_senders(transcript: str) -> list[str]:
    return [
        match.strip()
        for match in re.findall(r"^sender:\s*(.+)$", transcript, re.MULTILINE)
        if match.strip()
    ]


def infer_transcript_sender(
    transcript: str,
    *,
    company_name: str,
) -> str | None:
    senders = infer_transcript_senders(transcript)
    if company_name in senders:
        return "you"
    return None


def infer_subtype_from_filename(filename: str) -> str | None:
    lowered = filename.lower()
    if "whatsapp" in lowered:
        return "whatsapp"
    if "sms" in lowered or "text" in lowered:
        return "sms"
    if "email" in lowered:
        return "email"
    if "facebook" in lowered:
        return "facebook"
    if "voicemail" in lowered:
        return "voicemail"
    if "home-visit" in lowered or "home_visit" in lowered or "home visit" in lowered:
        return "home-visit"
    return None


def infer_document_subtype(
    *,
    document: dict[str, object],
    normalized_document: dict[str, str | None],
) -> str | None:
    filename_subtype = infer_subtype_from_filename(str(document.get("original_filename") or ""))
    if filename_subtype:
        return filename_subtype

    for subtype in infer_transcript_message_types(str(normalized_document.get("transcript") or "")):
        if subtype in CHASE_SUBTYPES or subtype in CONVERSATION_SUBTYPES:
            return subtype
    return None


def infer_document_category(
    *,
    document: dict[str, object],
    normalized_document: dict[str, str | None],
    existing_timeline_items: list[dict[str, object]],
) -> tuple[str, str | None, str | None]:
    company_context = load_company_context()
    company_name = str(company_context["name"])
    transcript = str(normalized_document.get("transcript") or "")
    sender = infer_transcript_sender(transcript, company_name=company_name)
    subtype = infer_document_subtype(document=document, normalized_document=normalized_document)
    senders = {value for value in infer_transcript_senders(transcript)}
    has_dialogue = len(senders) >= 2 or TRANSCRIPT_SEPARATOR in transcript
    text_blob = " ".join(
        part.strip().lower()
        for part in (
            normalized_document.get("title"),
            normalized_document.get("description"),
            transcript,
        )
        if part and part.strip()
    )
    chase_keywords = (
        "chase",
        "follow up",
        "follow-up",
        "followup",
        "reminder",
        "overdue",
        "outstanding",
        "unpaid",
        "please pay",
        "confirm when",
    )
    chase_like = any(keyword in text_blob for keyword in chase_keywords)
    if subtype == "sms" and chase_like:
        return "chase", subtype, sender
    if has_dialogue and subtype in CONVERSATION_SUBTYPES:
        return "conversation", subtype, sender
    if chase_like:
        if subtype in CHASE_SUBTYPES:
            return "chase", subtype, sender
        return "chase", None, sender
    if subtype in CHASE_SUBTYPES:
        return "chase", subtype, sender
    if subtype in CONVERSATION_SUBTYPES:
        return "conversation", subtype, sender
    if normalized_document.get("due_date") and not any(str(item["category"]) == "due-date" for item in existing_timeline_items):
        return "due-date", None, None
    return "other", None, sender


def should_keep_link_existing(
    *,
    decision: TimelineDecision,
    document: dict[str, object],
    normalized_document: dict[str, str | None],
    existing_timeline_items: list[dict[str, object]],
) -> bool:
    if not decision.existing_timeline_item_id:
        return False

    linked_item = next(
        (item for item in existing_timeline_items if str(item["id"]) == decision.existing_timeline_item_id),
        None,
    )
    if linked_item is None:
        return False

    preferred_subtype = infer_document_subtype(document=document, normalized_document=normalized_document)
    linked_subtype = str(linked_item["subtype"]) if linked_item["subtype"] else None
    if str(linked_item["category"]) == "due-date":
        if preferred_subtype is not None:
            return False
        due_date = normalize_iso_date(normalized_document.get("due_date"))
        communication_date = normalize_iso_date(normalized_document.get("communication_date"))
        if due_date and str(linked_item["date"]) != due_date:
            return False
        if communication_date and due_date and communication_date != due_date:
            return False

    if (
        preferred_subtype
        and str(linked_item["category"]) in {"chase", "conversation"}
        and linked_subtype != preferred_subtype
    ):
        return False

    communication_date = normalize_iso_date(normalized_document.get("communication_date"))
    if (
        communication_date
        and str(linked_item["category"]) in {"chase", "conversation", "letter"}
        and str(linked_item["date"]) != communication_date
    ):
        return False

    return True


def reclassify_additional_due_date(
    *,
    document: dict[str, object],
    normalized_document: dict[str, str | None],
) -> tuple[str, str | None, str | None]:
    company_context = load_company_context()
    company_name = str(company_context["name"])
    transcript = str(normalized_document.get("transcript") or "")
    message_types = infer_transcript_message_types(transcript)
    preferred_subtype = infer_document_subtype(document=document, normalized_document=normalized_document)
    sender = infer_transcript_sender(transcript, company_name=company_name)

    if preferred_subtype in CHASE_SUBTYPES:
        return "chase", preferred_subtype, sender
    for subtype in message_types:
        if subtype in CHASE_SUBTYPES:
            return "chase", subtype, sender

    text_blob = " ".join(
        part.strip().lower()
        for part in (
            normalized_document.get("title"),
            normalized_document.get("description"),
            transcript,
        )
        if part and part.strip()
    )
    chase_keywords = (
        "chase",
        "follow up",
        "follow-up",
        "followup",
        "reminder",
        "overdue",
        "outstanding",
        "unpaid",
        "payment due",
        "please pay",
    )
    if any(keyword in text_blob for keyword in chase_keywords):
        return "chase", None, sender

    for subtype in message_types:
        if subtype in CONVERSATION_SUBTYPES:
            return "conversation", subtype, sender

    return "other", None, sender


def normalize_timeline_decision(
    decision: TimelineDecision,
    *,
    document: dict[str, object],
    normalized_document: dict[str, str | None],
    existing_timeline_items: list[dict[str, object]],
) -> dict[str, str | None]:
    existing_ids = {str(item["id"]) for item in existing_timeline_items}
    if (
        decision.action == "link_existing"
        and decision.existing_timeline_item_id
        and decision.existing_timeline_item_id in existing_ids
        and should_keep_link_existing(
            decision=decision,
            document=document,
            normalized_document=normalized_document,
            existing_timeline_items=existing_timeline_items,
        )
    ):
        return {
            "action": "link_existing",
            "existing_timeline_item_id": decision.existing_timeline_item_id,
            "category": None,
            "subtype": None,
            "sender": None,
            "date": None,
            "short_description": "",
            "details": "",
        }

    inferred_category, inferred_subtype, inferred_sender = infer_document_category(
        document=document,
        normalized_document=normalized_document,
        existing_timeline_items=existing_timeline_items,
    )
    category = decision.category or inferred_category
    subtype = decision.subtype or inferred_subtype
    if category == "due-date" and any(str(item["category"]) == "due-date" for item in existing_timeline_items):
        category, subtype, inferred_sender = reclassify_additional_due_date(
            document=document,
            normalized_document=normalized_document,
        )
    elif category in {"chase", "conversation"} and inferred_category in {"chase", "conversation"}:
        category = inferred_category
        if inferred_subtype is not None:
            subtype = inferred_subtype
    sender = decision.sender if decision.sender is not None else inferred_sender

    if category == "chase" and subtype not in CHASE_SUBTYPES:
        subtype = None
    elif category == "conversation" and subtype not in CONVERSATION_SUBTYPES:
        subtype = None
    elif category not in {"chase", "conversation"}:
        subtype = None

    if category == "due-date":
        sender = None

    decision_date = normalize_iso_date(decision.date)
    document_date = normalize_iso_date(normalized_document["communication_date"])
    due_date = normalize_iso_date(normalized_document.get("due_date"))
    fallback_date = normalize_iso_date(str(document["created_at"])) or str(document["created_at"]).split(" ", 1)[0]
    short_description = limit_words(
        (decision.short_description or "").strip() or str(normalized_document["title"]).strip(),
        10,
    )

    return {
        "action": "create_new",
        "existing_timeline_item_id": None,
        "category": category,
        "subtype": subtype,
        "sender": sender,
        "date": decision_date or (due_date if category == "due-date" else None) or document_date or due_date or fallback_date,
        "short_description": short_description,
        "details": normalize_timeline_details(
            decision.details,
            normalized_document=normalized_document,
        ),
    }


def process_document(
    document_id: str,
    settings: Settings,
    processing_profile: ProcessingProfile = "default",
    extractor: Callable[[dict[str, object], Settings, ProcessingProfile], ExtractedDocument] = extract_document_metadata,
    timeline_planner: Callable[
        [dict[str, object], dict[str, str | None], list[dict[str, object]], Settings],
        TimelineDecision,
    ]
    | None = None,
) -> None:
    repository = DocumentRepository(settings)
    document = repository.get(document_id)
    if document is None:
        return

    planner = timeline_planner or (
        lambda current_document, normalized_document, existing_timeline_items, current_settings: plan_document_timeline(
            document=current_document,
            normalized_document=normalized_document,
            existing_timeline_items=existing_timeline_items,
            settings=current_settings,
        )
    )

    try:
        extracted = extractor(document, settings, processing_profile)
        normalized_document = normalize_extraction(
            extracted,
            original_filename=str(document["original_filename"]),
        )
        document = repository.update_fields(
            document_id,
            extraction_error=None,
            title=normalized_document["title"],
            communication_date=normalized_document["communication_date"],
            description=normalized_document["description"],
            transcript=normalized_document["transcript"],
        )

        existing_timeline_items = repository.list_timeline_for_job(str(document["job_id"]))
        decision = planner(document, normalized_document, existing_timeline_items, settings)
        normalized_timeline = normalize_timeline_decision(
            decision,
            document=document,
            normalized_document=normalized_document,
            existing_timeline_items=existing_timeline_items,
        )

        if normalized_timeline["action"] == "link_existing":
            repository.link_document_to_timeline_item(
                document_id,
                str(normalized_timeline["existing_timeline_item_id"]),
            )
        else:
            timeline_item = repository.create_timeline_item(
                job_id=str(document["job_id"]),
                category=str(normalized_timeline["category"]),
                subtype=normalized_timeline["subtype"],
                sender=normalized_timeline["sender"],
                date=str(normalized_timeline["date"]),
                short_description=str(normalized_timeline["short_description"]),
                details=str(normalized_timeline["details"]),
            )
            repository.link_document_to_timeline_item(document_id, str(timeline_item["id"]))

        repository.update_fields(
            document_id,
            status="ready",
            extraction_error=None,
        )
    except Exception as exc:
        repository.update_fields(
            document_id,
            status="failed",
            extraction_error=str(exc).strip() or "Document extraction failed.",
        )
