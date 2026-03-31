import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { findJobById } from '@/lib/jobStore';
import { brevoConfigurationError, sendBrevoEmail } from '@/lib/brevoEmail';
import type { Communication } from '@/types/communication';

const documentBackendUrl = process.env.DOCUMENT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type SendEmailPayload = {
  recipients?: unknown;
  communication?: unknown;
};

type TimelineCreateResponse = {
  id: string;
  job_id: string;
  category: Communication['category'];
  subtype: Communication['subtype'] | null;
  sender: Communication['sender'] | null;
  date: string;
  short_description: string;
  details: string;
  linked_document_ids: string[];
  created_at: string;
  updated_at: string;
};

function uniqueEmails(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean),
  ));
}

function isEmailAddress(value: string) {
  return emailPattern.test(value);
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

async function createTimelineItem(jobId: string, communication: Communication) {
  const response = await fetch(new URL(`/jobs/${jobId}/timeline-items`, documentBackendUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: communication.category,
      subtype: communication.subtype ?? null,
      sender: communication.sender ?? null,
      date: communication.date,
      short_description: communication.shortDescription.trim(),
      details: communication.details,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
    throw new Error(payload?.detail ?? payload?.error ?? 'The email sent, but it could not be recorded in the timeline.');
  }

  return await response.json() as TimelineCreateResponse;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const configurationError = brevoConfigurationError();
  if (configurationError) {
    return NextResponse.json({ error: configurationError }, { status: 500 });
  }

  const { id } = await params;
  const cookieStore = await cookies();
  const job = findJobById(id, cookieStore);

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const payload = await request.json().catch(() => null) as SendEmailPayload | null;
  const communication = normalizeCommunication(payload?.communication);
  const recipients = uniqueEmails(payload?.recipients);

  if (!communication || communication.jobId !== id) {
    return NextResponse.json({ error: 'A valid email draft is required.' }, { status: 400 });
  }

  if (communication.subtype !== 'email') {
    return NextResponse.json({ error: 'Only email communications can be sent.' }, { status: 400 });
  }

  if (!communication.shortDescription.trim()) {
    return NextResponse.json({ error: 'Email subject is required.' }, { status: 400 });
  }

  if (!communication.details.trim()) {
    return NextResponse.json({ error: 'Email body is required.' }, { status: 400 });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'Add at least one recipient email address.' }, { status: 400 });
  }

  if (recipients.some(recipient => !isEmailAddress(recipient))) {
    return NextResponse.json({ error: 'One or more recipient email addresses are invalid.' }, { status: 400 });
  }

  try {
    const brevoResponse = await sendBrevoEmail({
      to: recipients.map(email => ({
        email,
        name: job.name || undefined,
      })),
      subject: communication.shortDescription.trim(),
      textContent: communication.details.trim(),
    });

    const timelineItem = await createTimelineItem(id, {
      ...communication,
      details: `Subject: ${communication.shortDescription.trim()}\n\n${communication.details.trim()}`,
    });

    return NextResponse.json({
      timelineItem,
      messageId: brevoResponse.messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send email.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
