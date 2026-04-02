import type { Communication } from '@/types/communication';
import { mapApiTimelineItem, type ApiTimelineItem } from './backendTimeline';
import { loggedFetch } from './logging/fetch';
import type { TraceContext } from './logging/shared';

interface SendJobWhatsAppInput {
  recipients: string[];
  communication: Communication;
}

function ensureResponseOk(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
}

export async function sendJobWhatsApp(
  jobId: string,
  { recipients, communication }: SendJobWhatsAppInput,
  trace?: TraceContext,
): Promise<Communication> {
  const response = await loggedFetch(`/api/jobs/${jobId}/send-whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipients,
      communication,
    }),
  }, {
    name: 'communications.send_whatsapp',
    context: {
      jobId,
      recipientCount: recipients.length,
      headlineLength: communication.shortDescription.trim().length,
      bodyLength: communication.details.trim().length,
    },
    trace,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Could not send WhatsApp.');
  }

  ensureResponseOk(response, 'Could not send WhatsApp.');
  const payload = await response.json() as { timelineItem: ApiTimelineItem };
  return mapApiTimelineItem(payload.timelineItem);
}
