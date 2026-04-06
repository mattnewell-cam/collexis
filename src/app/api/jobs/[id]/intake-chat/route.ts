import { NextResponse } from 'next/server';
import { toApiJobSnapshot } from '@/lib/apiJobSnapshot';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';
import { findJobById } from '@/lib/jobStore';
import { createClient } from '@/lib/supabase/server';

export const POST = withRouteLogging('intake_chat.route', async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  log,
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to use intake chat.' }, { status: 401 });
  }

  const job = await findJobById(id, supabase);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const body = await request.json() as { messages?: unknown; field_statuses?: unknown };

  let backendResponse: Response;

  try {
    log.info('intake_chat.forward_to_backend', { jobId: id, userId: user.id });
    backendResponse = await loggedFetch(new URL(`/jobs/${id}/intake-chat`, documentBackendOrigin()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_snapshot: toApiJobSnapshot(job),
        messages: body.messages ?? [],
        field_statuses: body.field_statuses ?? {},
      }),
      cache: 'no-store',
    }, {
      name: 'intake_chat.backend_request',
      context: { jobId: id },
      trace: log.trace,
      source: 'next-api',
    });
  } catch (error) {
    log.error('intake_chat.backend_unavailable', { jobId: id, userId: user.id, error });
    return NextResponse.json({ error: 'Could not reach the document backend.' }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const errorPayload = await backendResponse.json().catch(() => null) as { error?: string; detail?: string } | null;
    const errorMessage = errorPayload?.error ?? errorPayload?.detail ?? 'Intake chat failed.';
    return NextResponse.json({ error: errorMessage }, { status: backendResponse.status });
  }

  const result = await backendResponse.json();
  return NextResponse.json(result);
});
