import { normalizeUkPhoneForTelnyx } from './phoneNumbers';
import { loggedFetch } from './logging/fetch';
import type { TraceContext } from './logging/shared';

export interface SendSmsRequest {
  to: string;
  text: string;
  from?: string;
}

export interface SendSmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSms(request: SendSmsRequest, trace?: TraceContext): Promise<SendSmsResponse> {
  const res = await loggedFetch('/api/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...request,
      to: normalizeUkPhoneForTelnyx(request.to),
      from: request.from ? normalizeUkPhoneForTelnyx(request.from) : undefined,
    }),
  }, {
    name: 'communications.send_sms',
    context: {
      hasFrom: Boolean(request.from?.trim()),
      textLength: request.text.trim().length,
    },
    trace,
  });

  return res.json();
}
