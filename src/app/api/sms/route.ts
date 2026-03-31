import Telnyx from 'telnyx';

const telnyxApiKey = process.env.TELNYX_API_KEY ?? '';
const telnyxFromNumber = process.env.TELNYX_FROM_NUMBER ?? '';
const telnyxMessagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID ?? '';

type SmsPayload = {
  to?: unknown;
  text?: unknown;
  from?: unknown;
};

function telnyxClient() {
  if (!telnyxApiKey) {
    throw new Error('TELNYX_API_KEY is not configured.');
  }

  return new Telnyx({ apiKey: telnyxApiKey });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as SmsPayload | null;
  const to = typeof payload?.to === 'string' ? payload.to.trim() : '';
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const from = typeof payload?.from === 'string' ? payload.from.trim() : telnyxFromNumber;

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
    const client = telnyxClient();
    const message = await client.messages.send({
      from,
      to,
      text,
      messaging_profile_id: telnyxMessagingProfileId,
    });

    return Response.json({
      success: true,
      messageId: message.data?.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send SMS.';
    console.error('[Telnyx] Send SMS error:', error);
    return Response.json({ error: message }, { status: 502 });
  }
}
