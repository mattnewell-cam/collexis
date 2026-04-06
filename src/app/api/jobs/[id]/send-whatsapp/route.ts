import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit/server';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';
import { createClient } from '@/lib/supabase/server';
import { findJobById } from '@/lib/jobStore';
import type { Communication } from '@/types/communication';
import type { ApiTimelineItem } from '@/lib/backendTimeline';

type SendWhatsAppPayload = {
  recipients?: unknown;
  communication?: unknown;
};

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.trim().replace(/^\+/, '') || '';
  const digitsOnly = trimmed.replace(/[^\d+]/g, '');

  if (digitsOnly.startsWith('+')) {
    const normalized = `+${digitsOnly.slice(1).replace(/\D/g, '')}`;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
  }

  const localDigits = digitsOnly.replace(/\D/g, '');
  if (localDigits.startsWith('00')) {
    const normalized = `+${localDigits.slice(2)}`;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
  }

  if (defaultCountryCode && localDigits.startsWith('0')) {
    const normalized = `+${defaultCountryCode}${localDigits.slice(1)}`;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
  }

  return null;
}

function uniquePhones(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(item => normalizePhoneNumber(item))
      .filter((item): item is string => typeof item === 'string'),
  ));
}

function hasInvalidPhone(value: unknown) {
  if (!Array.isArray(value)) return false;

  return value.some(item => typeof item !== 'string' || !normalizePhoneNumber(item));
}

function normalizeCommunication(value: unknown): Communication | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string'
    || typeof record.jobId !== 'string'
    || typeof record.category !== 'string'
    || typeof record.date !== 'string'
    || typeof record.shortDescription !== 'string'
    || typeof record.details !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    jobId: record.jobId,
    category: record.category as Communication['category'],
    subtype: typeof record.subtype === 'string' ? record.subtype as Communication['subtype'] : undefined,
    sender: typeof record.sender === 'string' ? record.sender as Communication['sender'] : undefined,
    date: record.date,
    shortDescription: record.shortDescription,
    details: record.details,
    linkedDocumentIds: Array.isArray(record.linkedDocumentIds)
      ? record.linkedDocumentIds.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

export const POST = withRouteLogging('communications.send_whatsapp', async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  log,
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const job = await findJobById(id, supabase);

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const payload = await request.json().catch(() => null) as SendWhatsAppPayload | null;
  const communication = normalizeCommunication(payload?.communication);
  const recipients = uniquePhones(payload?.recipients);

  if (!communication || communication.jobId !== id) {
    return NextResponse.json({ error: 'A valid WhatsApp draft is required.' }, { status: 400 });
  }

  if (communication.subtype !== 'whatsapp') {
    return NextResponse.json({ error: 'Only WhatsApp communications can be sent.' }, { status: 400 });
  }

  if (!communication.shortDescription.trim()) {
    return NextResponse.json({ error: 'A short description is required.' }, { status: 400 });
  }

  if (!communication.details.trim()) {
    return NextResponse.json({ error: 'WhatsApp body is required.' }, { status: 400 });
  }

  if (recipients.length === 0) {
    return NextResponse.json({
      error: 'Add at least one recipient phone number in E.164 format, like +447700900123. You can also set WHATSAPP_DEFAULT_COUNTRY_CODE for local numbers.',
    }, { status: 400 });
  }

  if (hasInvalidPhone(payload?.recipients)) {
    return NextResponse.json({
      error: 'One or more recipient phone numbers are invalid. Use E.164 format, like +447700900123, or set WHATSAPP_DEFAULT_COUNTRY_CODE for local numbers.',
    }, { status: 400 });
  }

  try {
    log.info('communications.send_whatsapp.attempt', {
      jobId: id,
      recipientCount: recipients.length,
    });
    const backendResponse = await loggedFetch(new URL(`/jobs/${id}/send-whatsapp`, documentBackendOrigin()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients,
        communication: {
          category: communication.category,
          subtype: communication.subtype ?? null,
          sender: communication.sender ?? null,
          recipient: communication.recipient ?? null,
          date: communication.date,
          short_description: communication.shortDescription.trim(),
          details: communication.details,
        },
      }),
      cache: 'no-store',
    }, {
      name: 'communications.send_whatsapp_backend',
      context: { jobId: id, recipientCount: recipients.length },
      trace: log.trace,
      source: 'next-api',
    });

    const backendPayload = await backendResponse.json().catch(() => null) as {
      detail?: string;
      error?: string;
      timeline_item?: ApiTimelineItem;
      message_ids?: Array<string | null>;
    } | null;

    if (!backendResponse.ok || !backendPayload?.timeline_item) {
      const message = backendPayload?.detail ?? backendPayload?.error ?? 'Could not send WhatsApp.';
      return NextResponse.json({ error: message }, { status: backendResponse.status || 502 });
    }

    const timelineItem = backendPayload.timeline_item;

    try {
      await recordAuditEvent({
        actorUserId: user?.id ?? null,
        action: 'communication.sent',
        jobId: id,
        entityType: 'communication',
        entityId: timelineItem.id,
        metadata: {
          channel: 'whatsapp',
          category: communication.category,
          sender: communication.sender ?? null,
          recipientCount: recipients.length,
        },
      });
    } catch (error) {
      log.warn('audit_events.write_failed', {
        action: 'communication.sent',
        jobId: id,
        timelineItemId: timelineItem.id,
        error,
      });
    }

    return NextResponse.json({
      timelineItem,
      messageIds: backendPayload.message_ids ?? [],
    });
  } catch (error) {
    log.error('communications.send_whatsapp.failed', {
      jobId: id,
      recipientCount: recipients.length,
      error,
    });
    const message = error instanceof Error ? error.message : 'Could not send WhatsApp.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
