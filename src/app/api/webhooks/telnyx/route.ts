import { toApiJobSnapshot } from '@/lib/apiJobSnapshot';
import { findJobsByPhone, getAllJobs } from '@/lib/jobStore';

const documentBackendUrl = process.env.DOCUMENT_BACKEND_URL ?? 'http://127.0.0.1:8000';

type TelnyxWebhookPayload = {
  data?: {
    event_type?: string;
    payload?: {
      id?: string;
      text?: string;
      received_at?: string;
      from?: { phone_number?: string | null };
      to?: Array<{ phone_number?: string | null }>;
      errors?: unknown[];
    };
  };
};

async function createInboundSmsTimelineItem(jobId: string, payload: NonNullable<TelnyxWebhookPayload['data']>['payload']) {
  const fromPhone = payload?.from?.phone_number?.trim() ?? '';
  const toPhone = payload?.to?.[0]?.phone_number?.trim() ?? '';
  const text = payload?.text?.trim() ?? '';
  const receivedAt = payload?.received_at?.trim() ?? new Date().toISOString();
  const messageId = payload?.id?.trim() ?? '';

  await fetch(new URL(`/jobs/${jobId}/timeline-items`, documentBackendUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'conversation',
      subtype: 'sms',
      sender: null,
      date: receivedAt,
      short_description: `SMS reply from ${fromPhone || 'unknown number'}`,
      details: [
        fromPhone ? `From: ${fromPhone}` : '',
        toPhone ? `To: ${toPhone}` : '',
        messageId ? `Message ID: ${messageId}` : '',
        `Received at: ${receivedAt}`,
        '',
        text,
      ].filter(Boolean).join('\n'),
    }),
    cache: 'no-store',
  });
}

async function regeneratePlan(jobId: string) {
  const job = getAllJobs().find(candidate => candidate.id === jobId);
  if (!job) return;

  await fetch(new URL(`/jobs/${jobId}/outreach-plan/generate`, documentBackendUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_snapshot: toApiJobSnapshot(job),
    }),
    cache: 'no-store',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as TelnyxWebhookPayload | null;
  const event = body?.data;

  if (!event) {
    return Response.json({ error: 'No event data.' }, { status: 400 });
  }

  const eventType = event.event_type;

  switch (eventType) {
    case 'message.received': {
      const payload = event.payload;
      const fromPhone = payload?.from?.phone_number?.trim() ?? '';
      const matchingJobs = findJobsByPhone(fromPhone, getAllJobs());

      console.log('[Telnyx] Inbound SMS:', {
        from: fromPhone,
        to: payload?.to?.[0]?.phone_number,
        text: payload?.text,
        receivedAt: payload?.received_at,
        messageId: payload?.id,
        matchedJobIds: matchingJobs.map(job => job.id),
      });

      if (matchingJobs.length === 1) {
        await createInboundSmsTimelineItem(matchingJobs[0].id, payload);
        await regeneratePlan(matchingJobs[0].id);
      }
      break;
    }

    case 'message.sent':
    case 'message.delivered':
      console.log(`[Telnyx] Message ${eventType}:`, {
        messageId: event.payload?.id,
        to: event.payload?.to?.[0]?.phone_number,
      });
      break;

    case 'message.finalized':
      if (event.payload?.errors?.length) {
        console.error('[Telnyx] Message failed:', event.payload.errors);
      }
      break;

    default:
      console.log(`[Telnyx] Unhandled event: ${eventType}`);
  }

  return Response.json({ received: true });
}
