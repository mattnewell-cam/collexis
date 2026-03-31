import { normalizeUkPhoneForTelnyx } from './phoneNumbers';

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

export async function sendSms(request: SendSmsRequest): Promise<SendSmsResponse> {
  const res = await fetch('/api/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...request,
      to: normalizeUkPhoneForTelnyx(request.to),
      from: request.from ? normalizeUkPhoneForTelnyx(request.from) : undefined,
    }),
  });

  return res.json();
}
