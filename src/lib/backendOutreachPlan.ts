import type { DebtorResponseActionResult } from '@/types/communication';
import type { Job } from '@/types/job';
import type { PostNowDraft, PostNowStep } from '@/types/postNowPlan';
import { toApiJobSnapshot } from './apiJobSnapshot';
import { documentBackendPath } from './documentBackend';
import { loggedFetch } from './logging/fetch';
import type { TraceContext } from './logging/shared';

type ApiOutreachPlanDraft = {
  id: string;
  job_id: string;
  plan_step_id: string;
  subject: string | null;
  body: string;
  is_user_edited: boolean;
  created_at: string;
  updated_at: string;
};

type ApiOutreachPlanStep = {
  id: string;
  job_id: string;
  type: PostNowStep['type'] | 'text';
  sender: PostNowStep['sender'];
  headline: string;
  scheduled_for: string;
  created_at: string;
  updated_at: string;
  draft?: ApiOutreachPlanDraft | null;
};

type ApiDebtorResponseActionResult = {
  classification: string;
  action: string;
  stated_deadline: string | null;
  computed_deadline: string | null;
  has_missed_deadlines: boolean;
  confidence: number;
  reasoning: string;
  user_message: string;
};

type ApiInboundEmailReplyResponse = {
  timeline_item: {
    id: string;
    job_id: string;
    category: string;
    subtype: string | null;
    sender: string | null;
    recipient: string | null;
    date: string;
    short_description: string;
    details: string;
    response_classification: string | null;
    response_action: string | null;
    linked_document_ids: string[];
    created_at: string;
    updated_at: string;
  };
  plan_steps: ApiOutreachPlanStep[];
  response_action: ApiDebtorResponseActionResult;
};

export type InboundEmailReplyInput = {
  fromEmail: string;
  fromName?: string;
  receivedAt?: string;
  subject?: string;
  body: string;
};

function ensureResponseOk(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
}

function mapApiOutreachPlanDraft(draft: ApiOutreachPlanDraft): PostNowDraft {
  return {
    id: draft.id,
    planStepId: draft.plan_step_id,
    subject: draft.subject ?? undefined,
    body: draft.body,
    isUserEdited: draft.is_user_edited,
  };
}

function normalizeSmsHeadline(headline: string, type: ApiOutreachPlanStep['type']) {
  if ((type === 'sms' || type === 'text') && headline.startsWith('Text:')) {
    return `SMS:${headline.slice('Text:'.length)}`;
  }
  if ((type === 'sms' || type === 'text') && headline.startsWith('Text ')) {
    return `SMS ${headline.slice('Text '.length)}`;
  }
  return headline;
}

export function mapApiOutreachPlanStep(step: ApiOutreachPlanStep): PostNowStep {
  return {
    id: step.id,
    type: step.type === 'text' ? 'sms' : step.type,
    sender: step.sender,
    headline: normalizeSmsHeadline(step.headline, step.type),
    scheduledFor: step.scheduled_for,
    draft: step.draft ? mapApiOutreachPlanDraft(step.draft) : undefined,
  };
}

export async function fetchOutreachPlan(jobId: string, trace?: TraceContext): Promise<PostNowStep[]> {
  const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/outreach-plan`), {
    cache: 'no-store',
  }, {
    name: 'outreach_plan.fetch',
    context: { jobId },
    trace,
  });
  ensureResponseOk(response, 'Could not load outreach plan.');
  const payload = await response.json() as ApiOutreachPlanStep[];
  return payload.map(mapApiOutreachPlanStep);
}

export async function ensureOutreachPlanDrafts(job: Job, trace?: TraceContext): Promise<PostNowStep[]> {
  const response = await loggedFetch(documentBackendPath(`/jobs/${job.id}/outreach-plan/drafts/ensure`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_snapshot: toApiJobSnapshot(job),
    }),
  }, {
    name: 'outreach_plan.ensure_drafts',
    context: { jobId: job.id },
    trace,
  });
  ensureResponseOk(response, 'Could not refresh outreach plan drafts.');
  const payload = await response.json() as ApiOutreachPlanStep[];
  return payload.map(mapApiOutreachPlanStep);
}

export async function generateOutreachPlan(job: Job, trace?: TraceContext): Promise<PostNowStep[]> {
  const response = await loggedFetch(`/api/jobs/${job.id}/outreach-plan/generate`, {
    method: 'POST',
    cache: 'no-store',
  }, {
    name: 'outreach_plan.generate',
    context: { jobId: job.id },
    trace,
  });
  ensureResponseOk(response, 'Could not generate outreach plan.');
  const payload = await response.json() as ApiOutreachPlanStep[];
  return payload.map(mapApiOutreachPlanStep);
}

function mapApiResponseAction(raw: ApiDebtorResponseActionResult): DebtorResponseActionResult {
  return {
    classification: raw.classification as DebtorResponseActionResult['classification'],
    action: raw.action as DebtorResponseActionResult['action'],
    statedDeadline: raw.stated_deadline,
    computedDeadline: raw.computed_deadline,
    hasMissedDeadlines: raw.has_missed_deadlines,
    confidence: raw.confidence,
    reasoning: raw.reasoning,
    userMessage: raw.user_message,
  };
}

export async function receiveInboundEmailReply(
  job: Job,
  reply: InboundEmailReplyInput,
  trace?: TraceContext,
): Promise<{ planSteps: PostNowStep[]; responseAction: DebtorResponseActionResult }> {
  const response = await loggedFetch(`/api/jobs/${job.id}/receive-email-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_snapshot: toApiJobSnapshot(job),
      reply: {
        from_email: reply.fromEmail,
        from_name: reply.fromName ?? null,
        received_at: reply.receivedAt ?? null,
        subject: reply.subject ?? '',
        body: reply.body,
      },
    }),
  }, {
    name: 'inbound_email.process_known_job',
    context: {
      jobId: job.id,
      hasSubject: Boolean(reply.subject?.trim()),
      bodyLength: reply.body.trim().length,
    },
    trace,
  });
  ensureResponseOk(response, 'Could not process inbound email reply.');
  const payload = await response.json() as ApiInboundEmailReplyResponse;
  return {
    planSteps: payload.plan_steps.map(mapApiOutreachPlanStep),
    responseAction: mapApiResponseAction(payload.response_action),
  };
}

export async function receiveInboundEmailReplyBySender(
  reply: InboundEmailReplyInput & { jobId?: string },
  trace?: TraceContext,
): Promise<{ planSteps: PostNowStep[]; responseAction: DebtorResponseActionResult }> {
  const response = await loggedFetch('/api/email-replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id: reply.jobId ?? null,
      reply: {
        from_email: reply.fromEmail,
        from_name: reply.fromName ?? null,
        received_at: reply.receivedAt ?? null,
        subject: reply.subject ?? '',
        body: reply.body,
      },
    }),
  }, {
    name: 'inbound_email.process_unknown_job',
    context: {
      jobId: reply.jobId ?? null,
      hasSubject: Boolean(reply.subject?.trim()),
      bodyLength: reply.body.trim().length,
    },
    trace,
  });
  ensureResponseOk(response, 'Could not process inbound email reply.');
  const payload = await response.json() as ApiInboundEmailReplyResponse;
  return {
    planSteps: payload.plan_steps.map(mapApiOutreachPlanStep),
    responseAction: mapApiResponseAction(payload.response_action),
  };
}

export async function updateOutreachPlanDraft(
  draftId: string,
  payload: { subject?: string; body: string },
  trace?: TraceContext,
): Promise<PostNowDraft> {
  const response = await loggedFetch(documentBackendPath(`/outreach-plan-drafts/${draftId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: payload.subject ?? null,
      body: payload.body,
    }),
  }, {
    name: 'outreach_plan.save_draft',
    context: {
      draftId,
      hasSubject: Boolean(payload.subject?.trim()),
      bodyLength: payload.body.trim().length,
    },
    trace,
  });
  ensureResponseOk(response, 'Could not save outreach plan draft.');
  return mapApiOutreachPlanDraft(await response.json() as ApiOutreachPlanDraft);
}
