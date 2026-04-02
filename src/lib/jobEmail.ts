import type { Communication } from '@/types/communication';
import { mapApiTimelineItem, type ApiTimelineItem } from './backendTimeline';
import { loggedFetch } from './logging/fetch';
import type { TraceContext } from './logging/shared';

interface SendJobEmailInput {
  recipients: string[];
  communication: Communication;
}

function ensureResponseOk(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
}

export async function sendJobEmail(
  jobId: string,
  { recipients, communication }: SendJobEmailInput,
  trace?: TraceContext,
): Promise<Communication> {
  const response = await loggedFetch(`/api/jobs/${jobId}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipients,
      communication,
    }),
  }, {
    name: 'communications.send_email',
    context: {
      jobId,
      recipientCount: recipients.length,
      subjectLength: communication.shortDescription.trim().length,
      bodyLength: communication.details.trim().length,
    },
    trace,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Could not send email.');
  }

  ensureResponseOk(response, 'Could not send email.');
  const payload = await response.json() as { timelineItem: ApiTimelineItem };
  return mapApiTimelineItem(payload.timelineItem);
}
