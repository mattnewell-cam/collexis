import { NextResponse } from 'next/server';

const documentBackendUrl = process.env.DOCUMENT_BACKEND_URL ?? 'http://127.0.0.1:8000';

type ReceiveEmailReplyPayload = {
  job_snapshot?: unknown;
  reply?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => null) as ReceiveEmailReplyPayload | null;

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'A reply payload is required.' }, { status: 400 });
  }

  const response = await fetch(new URL(`/jobs/${id}/inbound-email-replies`, documentBackendUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const responseBody = await response.text();

  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  });
}
