export interface BrevoEmailRecipient {
  email: string;
  name?: string;
}

interface SendBrevoEmailInput {
  to: BrevoEmailRecipient[];
  subject: string;
  textContent: string;
}

const brevoApiUrl = 'https://api.brevo.com/v3/smtp/email';
const defaultSenderEmail = process.env.COLLEXIS_FROM_EMAIL?.trim() || 'hello@collexis.uk';
const defaultSenderName = process.env.COLLEXIS_FROM_NAME?.trim() || 'Collexis';

function brevoApiKey() {
  return process.env.BREVO_API_KEY?.trim() || '';
}

export function isBrevoConfigured() {
  return brevoApiKey().length > 0;
}

export function brevoConfigurationError() {
  if (isBrevoConfigured()) return null;
  return 'Brevo is not configured. Add BREVO_API_KEY to .env.local.';
}

export async function sendBrevoEmail({
  to,
  subject,
  textContent,
}: SendBrevoEmailInput): Promise<{ messageId: string | null }> {
  const apiKey = brevoApiKey();
  if (!apiKey) {
    throw new Error(brevoConfigurationError() ?? 'Brevo is not configured.');
  }

  const response = await fetch(brevoApiUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: defaultSenderEmail,
        name: defaultSenderName,
      },
      replyTo: {
        email: defaultSenderEmail,
        name: defaultSenderName,
      },
      to,
      subject,
      textContent,
      ...(process.env.BREVO_SANDBOX === 'true'
        ? {
            headers: {
              'X-Sib-Sandbox': 'drop',
            },
          }
        : {}),
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      message?: string;
      code?: string;
    } | null;
    const message = payload?.message?.trim();
    throw new Error(message || 'Brevo rejected the email request.');
  }

  const payload = await response.json().catch(() => null) as { messageId?: string } | null;
  return {
    messageId: payload?.messageId ?? null,
  };
}
