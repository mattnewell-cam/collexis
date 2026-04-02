import { NextRequest, NextResponse } from 'next/server';
import { withRouteLogging } from '@/lib/logging/server';

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: unknown[];
        statuses?: unknown[];
      };
    }>;
  }>;
};

function webhookVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || '';
}

function countItems(payload: WhatsAppWebhookPayload | null, key: 'messages' | 'statuses') {
  if (!payload?.entry) return 0;

  return payload.entry.reduce((count, entry) => {
    const nextCount = entry.changes?.reduce((changeCount, change) => {
      const items = change.value?.[key];
      return changeCount + (Array.isArray(items) ? items.length : 0);
    }, 0) ?? 0;

    return count + nextCount;
  }, 0);
}

export const GET = withRouteLogging('webhooks.whatsapp.verify', async (request: NextRequest) => {
  const verifyToken = webhookVerifyToken();
  if (!verifyToken) {
    return NextResponse.json({
      error: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured.',
    }, { status: 500 });
  }

  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 });
});

export const POST = withRouteLogging('webhooks.whatsapp.receive', async (request: Request) => {
  const payload = await request.json().catch(() => null) as WhatsAppWebhookPayload | null;
  const messageCount = countItems(payload, 'messages');
  const statusCount = countItems(payload, 'statuses');

  return NextResponse.json({
    ok: true,
    received_messages: messageCount,
    received_statuses: statusCount,
  });
});
