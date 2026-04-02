import { NextResponse } from 'next/server';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';

type ReceiveEmailReplyPayload = {
  job_snapshot?: unknown;
  reply?: unknown;
};

export const POST = withRouteLogging('inbound_email.forward_known_job', async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  log,
) => {
  const { id } = await params;
  const payload = await request.json().catch(() => null) as ReceiveEmailReplyPayload | null;

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'A reply payload is required.' }, { status: 400 });
  }

  const response = await loggedFetch(new URL(`/jobs/${id}/inbound-email-replies`, documentBackendOrigin()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  }, {
    name: 'inbound_email.forward_to_backend',
    context: { jobId: id },
    trace: log.trace,
    source: 'next-api',
  });

  const responseBody = await response.text();

  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  });
});
