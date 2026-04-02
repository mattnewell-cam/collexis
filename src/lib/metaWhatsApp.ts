import { loggedFetch } from './logging/fetch';

interface SendMetaWhatsAppTextInput {
  to: string;
  textBody: string;
}

type MetaWhatsAppErrorPayload = {
  error?: {
    message?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
};

type MetaWhatsAppSuccessPayload = {
  messages?: Array<{
    id?: string;
  }>;
};

const metaGraphApiUrl = 'https://graph.facebook.com';
const defaultApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v23.0';

function whatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '';
}

function whatsAppPhoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
}

export function isWhatsAppConfigured() {
  return whatsAppAccessToken().length > 0 && whatsAppPhoneNumberId().length > 0;
}

export function whatsAppConfigurationError() {
  if (isWhatsAppConfigured()) return null;
  return 'WhatsApp is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to .env.local.';
}

function normalizeMetaError(payload: MetaWhatsAppErrorPayload | null) {
  const userMessage = payload?.error?.error_user_msg?.trim();
  if (userMessage) return userMessage;

  const message = payload?.error?.message?.trim();
  if (!message) {
    return 'Meta rejected the WhatsApp request.';
  }

  const hints = [
    'outside the allowed window',
    'message template',
    're-engagement message',
    'freeform message',
  ];
  if (hints.some(hint => message.toLowerCase().includes(hint))) {
    return `${message} Send an approved template message first, or message within the active customer service window.`;
  }

  return message;
}

export async function sendMetaWhatsAppText({
  to,
  textBody,
}: SendMetaWhatsAppTextInput): Promise<{ messageId: string | null }> {
  const accessToken = whatsAppAccessToken();
  const phoneNumberId = whatsAppPhoneNumberId();

  if (!accessToken || !phoneNumberId) {
    throw new Error(whatsAppConfigurationError() ?? 'WhatsApp is not configured.');
  }

  const response = await loggedFetch(`${metaGraphApiUrl}/${defaultApiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: textBody,
      },
    }),
    cache: 'no-store',
  }, {
    name: 'provider.whatsapp.send_text',
    context: {
      phoneNumberId,
      textLength: textBody.trim().length,
    },
    source: 'next-api',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as MetaWhatsAppErrorPayload | null;
    throw new Error(normalizeMetaError(payload));
  }

  const payload = await response.json().catch(() => null) as MetaWhatsAppSuccessPayload | null;
  return {
    messageId: payload?.messages?.[0]?.id ?? null,
  };
}
