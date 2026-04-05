import { NextRequest, NextResponse } from 'next/server';
import { withRouteLogging } from '@/lib/logging/server';

type WhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  context?: {
    id?: string;
    from?: string;
  };
  text?: {
    body?: string;
  };
};

type WhatsAppStatus = {
  id?: string;
  recipient_id?: string;
  status?: string;
  timestamp?: string;
  conversation?: {
    id?: string;
  };
  errors?: Array<{
    code?: number;
    title?: string;
  }>;
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
        messages?: WhatsAppMessage[];
        statuses?: WhatsAppStatus[];
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

function extractMessageEvents(payload: WhatsAppWebhookPayload) {
  const events: Array<Record<string, unknown>> = [];

  payload.entry?.forEach(entry => {
    entry.changes?.forEach(change => {
      const phoneNumberId = change.value?.metadata?.phone_number_id ?? null;
      const displayPhoneNumber = change.value?.metadata?.display_phone_number ?? null;
      const field = change.field ?? null;

      change.value?.messages?.forEach(message => {
        events.push({
          field,
          phoneNumberId,
          displayPhoneNumber,
          messageId: message.id ?? null,
          fromPhone: message.from ?? null,
          messageType: message.type ?? null,
          textLength: message.text?.body?.trim().length ?? 0,
          hasContext: Boolean(message.context?.id),
          contextMessageId: message.context?.id ?? null,
          timestamp: message.timestamp ?? null,
        });
      });
    });
  });

  return events;
}

function extractStatusEvents(payload: WhatsAppWebhookPayload) {
  const events: Array<Record<string, unknown>> = [];

  payload.entry?.forEach(entry => {
    entry.changes?.forEach(change => {
      const phoneNumberId = change.value?.metadata?.phone_number_id ?? null;
      const displayPhoneNumber = change.value?.metadata?.display_phone_number ?? null;
      const field = change.field ?? null;

      change.value?.statuses?.forEach(status => {
        events.push({
          field,
          phoneNumberId,
          displayPhoneNumber,
          messageId: status.id ?? null,
          recipientPhone: status.recipient_id ?? null,
          deliveryStatus: status.status ?? null,
          conversationId: status.conversation?.id ?? null,
          errorCount: status.errors?.length ?? 0,
          timestamp: status.timestamp ?? null,
        });
      });
    });
  });

  return events;
}

function countUnhandledChanges(payload: WhatsAppWebhookPayload) {
  if (!payload.entry) return 0;

  return payload.entry.reduce((entryCount, entry) =>
    entryCount + (entry.changes?.filter(change => {
      const messageCount = Array.isArray(change.value?.messages) ? change.value.messages.length : 0;
      const statusCount = Array.isArray(change.value?.statuses) ? change.value.statuses.length : 0;
      return messageCount === 0 && statusCount === 0;
    }).length ?? 0), 0);
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

export const POST = withRouteLogging('webhooks.whatsapp.receive', async (request: Request, _context, log) => {
  const payload = await request.json().catch(() => null) as WhatsAppWebhookPayload | null;
  if (!payload?.entry) {
    log.warn('webhooks.whatsapp.receive.invalid_payload', {
      hasEntry: Boolean(payload?.entry),
    });
    return NextResponse.json({ error: 'Invalid WhatsApp webhook payload.' }, { status: 400 });
  }

  const messageCount = countItems(payload, 'messages');
  const statusCount = countItems(payload, 'statuses');
  const messageEvents = extractMessageEvents(payload);
  const statusEvents = extractStatusEvents(payload);
  const unhandledChangeCount = countUnhandledChanges(payload);

  log.info('webhooks.whatsapp.receive.summary', {
    entryCount: payload.entry.length,
    messageCount,
    statusCount,
    unhandledChangeCount,
  });

  messageEvents.forEach(event => {
    log.info('webhooks.whatsapp.inbound_message', event);
  });

  statusEvents.forEach(event => {
    if (event.deliveryStatus === 'failed') {
      log.warn('webhooks.whatsapp.delivery_status', event);
      return;
    }
    log.info('webhooks.whatsapp.delivery_status', event);
  });

  if (unhandledChangeCount > 0) {
    log.warn('webhooks.whatsapp.receive.unhandled_changes', {
      unhandledChangeCount,
    });
  }

  return NextResponse.json({
    ok: true,
    received_messages: messageCount,
    received_statuses: statusCount,
  });
});
