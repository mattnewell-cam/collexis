from __future__ import annotations

import json

from openai import OpenAI

from .config import Settings
from .schemas import InboundEmailJobInferenceResponse, IncomingReplyContext, JobSnapshot


INBOUND_EMAIL_JOB_INFERENCE_MODEL = "gpt-5.4"

INBOUND_EMAIL_JOB_INFERENCE_PROMPT = (
    "You are matching an inbound debtor/client email reply to the most likely debt-recovery job in Collexis. "
    "Return only the schema. "
    "The reply is an inbound message received by Collexis. "
    "Use the sender email, sender name, subject, and body, plus the candidate jobs' names, addresses, descriptions, balances, and contact details. "
    "Choose the single most likely job_id if there is a reasonable match. "
    "If the evidence is weak or ambiguous, return job_id as null instead of guessing. "
    "Keep rationale short."
)


def infer_inbound_email_job(
    *,
    reply: IncomingReplyContext,
    job_candidates: list[JobSnapshot],
    settings: Settings,
) -> InboundEmailJobInferenceResponse:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.parse(
        model=INBOUND_EMAIL_JOB_INFERENCE_MODEL,
        reasoning={"effort": "medium"},
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": INBOUND_EMAIL_JOB_INFERENCE_PROMPT},
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {
                                "reply": reply.model_dump(mode="json"),
                                "job_candidates": [candidate.model_dump(mode="json") for candidate in job_candidates],
                            },
                            ensure_ascii=True,
                        ),
                    },
                ],
            }
        ],
        text_format=InboundEmailJobInferenceResponse,
    )
    return response.output_parsed
