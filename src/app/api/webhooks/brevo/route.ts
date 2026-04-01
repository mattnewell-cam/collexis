import { NextRequest, NextResponse } from 'next/server';

type BrevoWebhookPayload = Record<string, unknown> | Array<Record<string, unknown>>;

function webhookSecret() {
  return process.env.BREVO_WEBHOOK_SECRET?.trim() || '';
}

function payloadEvents(payload: BrevoWebhookPayload | null) {
  if (!payload) return [];

  const events = Array.isArray(payload) ? payload : [payload];
  return events.map((event) => ({
    event: typeof event.event === 'string' ? event.event : null,
    email: typeof event.email === 'string' ? event.email : null,
    messageId:
      typeof event['message-id'] === 'string'
        ? event['message-id']
        : typeof event.messageId === 'string'
          ? event.messageId
          : null,
    ts: typeof event.ts === 'number' || typeof event.ts === 'string' ? event.ts : null,
    subject: typeof event.subject === 'string' ? event.subject : null,
    tag: typeof event.tag === 'string' ? event.tag : null,
  }));
}

function isAuthorized(request: NextRequest) {
  const secret = webhookSecret();
  if (!secret) return true;

  return request.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Webhook authorization failed.' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, provider: 'brevo' });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Webhook authorization failed.' }, { status: 403 });
  }

  const payload = await request.json().catch(() => null) as BrevoWebhookPayload | null;

  if (!payload) {
    return NextResponse.json({ error: 'A valid Brevo payload is required.' }, { status: 400 });
  }

  const events = payloadEvents(payload);

  console.log('[Brevo webhook] Received event batch:', {
    eventCount: events.length,
    events,
    payload,
  });

  return NextResponse.json({
    ok: true,
    received_events: events.length,
  });
}
