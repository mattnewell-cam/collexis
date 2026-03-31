import type { Communication } from '@/types/communication';
import { mapApiTimelineItem, type ApiTimelineItem } from './backendTimeline';

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
): Promise<Communication> {
  const response = await fetch(`/api/jobs/${jobId}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipients,
      communication,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Could not send email.');
  }

  ensureResponseOk(response, 'Could not send email.');
  const payload = await response.json() as { timelineItem: ApiTimelineItem };
  return mapApiTimelineItem(payload.timelineItem);
}
