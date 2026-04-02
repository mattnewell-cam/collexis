import { toApiJobSnapshot } from '@/lib/apiJobSnapshot';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findJobById, findJobsByPhone } from '@/lib/jobStore';

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

async function createInboundSmsTimelineItem(
  jobId: string,
  payload: NonNullable<TelnyxWebhookPayload['data']>['payload'],
  trace?: { requestId?: string; actionId?: string; sessionId?: string },
) {
  const fromPhone = payload?.from?.phone_number?.trim() ?? '';
  const toPhone = payload?.to?.[0]?.phone_number?.trim() ?? '';
  const text = payload?.text?.trim() ?? '';
  const receivedAt = payload?.received_at?.trim() ?? new Date().toISOString();
  const messageId = payload?.id?.trim() ?? '';

  await loggedFetch(new URL(`/jobs/${jobId}/timeline-items`, documentBackendOrigin()), {
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
  }, {
    name: 'webhooks.telnyx.create_timeline_item',
    context: { jobId },
    trace,
    source: 'next-api',
  });
}

async function regeneratePlan(jobId: string, trace?: { requestId?: string; actionId?: string; sessionId?: string }) {
  const supabase = createAdminClient();
  const job = await findJobById(jobId, supabase);
  if (!job) return;

  await loggedFetch(new URL(`/jobs/${jobId}/outreach-plan/generate`, documentBackendOrigin()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_snapshot: toApiJobSnapshot(job) }),
    cache: 'no-store',
  }, {
    name: 'webhooks.telnyx.regenerate_plan',
    context: { jobId },
    trace,
    source: 'next-api',
  });
}

export const POST = withRouteLogging('webhooks.telnyx.receive', async (request: Request, _context, log) => {
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
      const supabase = createAdminClient();
      const matchingJobs = await findJobsByPhone(fromPhone, supabase);
      log.info('webhooks.telnyx.message_received', {
        from: fromPhone,
        to: payload?.to?.[0]?.phone_number,
        receivedAt: payload?.received_at,
        messageId: payload?.id,
        matchedJobIds: matchingJobs.map(job => job.id),
      });

      if (matchingJobs.length === 1) {
        await createInboundSmsTimelineItem(matchingJobs[0].id, payload, log.trace);
        await regeneratePlan(matchingJobs[0].id, log.trace);
      }
      break;
    }

    case 'message.sent':
    case 'message.delivered':
      log.info('webhooks.telnyx.delivery_event', {
        eventType,
        messageId: event.payload?.id,
        to: event.payload?.to?.[0]?.phone_number,
      });
      break;

    case 'message.finalized':
      if (event.payload?.errors?.length) {
        log.error('webhooks.telnyx.message_failed', {
          errors: event.payload.errors,
        });
      }
      break;

    default:
      log.info('webhooks.telnyx.unhandled_event', { eventType });
  }

  return Response.json({ received: true });
});
