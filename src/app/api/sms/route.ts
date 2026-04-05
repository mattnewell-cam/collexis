import Telnyx from 'telnyx';
import { recordAuditEvent } from '@/lib/audit/server';
import { withRouteLogging } from '@/lib/logging/server';
import { createClient } from '@/lib/supabase/server';

const telnyxApiKey = process.env.TELNYX_API_KEY ?? '';
const telnyxFromNumber = process.env.TELNYX_FROM_NUMBER ?? '';
const telnyxMessagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID ?? '';

type SmsPayload = {
  to?: unknown;
  text?: unknown;
  from?: unknown;
  jobId?: unknown;
};

function telnyxClient() {
  if (!telnyxApiKey) {
    throw new Error('TELNYX_API_KEY is not configured.');
  }

  return new Telnyx({ apiKey: telnyxApiKey });
}

export const POST = withRouteLogging('communications.send_sms_route', async (request: Request, _context, log) => {
  const payload = await request.json().catch(() => null) as SmsPayload | null;
  const to = typeof payload?.to === 'string' ? payload.to.trim() : '';
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const from = typeof payload?.from === 'string' ? payload.from.trim() : telnyxFromNumber;
  const jobId = typeof payload?.jobId === 'string' ? payload.jobId.trim() : '';

  if (!to || !text) {
    return Response.json({ error: 'Missing required fields: to and text.' }, { status: 400 });
  }

  if (!from) {
    return Response.json({ error: 'TELNYX_FROM_NUMBER is not configured.' }, { status: 500 });
  }

  if (!telnyxMessagingProfileId) {
    return Response.json({ error: 'TELNYX_MESSAGING_PROFILE_ID is not configured.' }, { status: 500 });
  }

  try {
    log.info('communications.send_sms.attempt', {
      hasFrom: Boolean(from),
      textLength: text.length,
    });
    const client = telnyxClient();
    const message = await client.messages.send({
      from,
      to,
      text,
      messaging_profile_id: telnyxMessagingProfileId,
    });
    const messageId = typeof message.data?.id === 'string' ? message.data.id : null;

    if (jobId) {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        await recordAuditEvent({
          actorUserId: user?.id ?? null,
          action: 'communication.sent',
          jobId,
          entityType: 'communication',
          entityId: messageId,
          metadata: {
            channel: 'sms',
            recipientCount: 1,
          },
        });
      } catch (error) {
        log.warn('audit_events.write_failed', {
          action: 'communication.sent',
          jobId,
          error,
        });
      }
    }

    return Response.json({
      success: true,
      messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send SMS.';
    log.error('communications.send_sms.failed', { error });
    return Response.json({ error: message }, { status: 502 });
  }
});
