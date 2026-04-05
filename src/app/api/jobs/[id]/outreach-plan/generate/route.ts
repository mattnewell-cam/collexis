import { NextResponse } from 'next/server';
import { toApiJobSnapshot } from '@/lib/apiJobSnapshot';
import { recordAuditEvent } from '@/lib/audit/server';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';
import { findJobById } from '@/lib/jobStore';
import { createClient } from '@/lib/supabase/server';

type ApiOutreachPlanStep = {
  type?: string;
};

export const POST = withRouteLogging('outreach_plan.generate_route', async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
  log,
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to generate outreach plans.' }, { status: 401 });
  }

  const job = await findJobById(id, supabase);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  let backendResponse: Response;

  try {
    log.info('outreach_plan.generate.forward_to_backend', {
      jobId: id,
      userId: user.id,
    });
    backendResponse = await loggedFetch(new URL(`/jobs/${id}/outreach-plan/generate`, documentBackendOrigin()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_snapshot: toApiJobSnapshot(job),
      }),
      cache: 'no-store',
    }, {
      name: 'outreach_plan.generate_backend_request',
      context: { jobId: id },
      trace: log.trace,
      source: 'next-api',
    });
  } catch (error) {
    log.error('outreach_plan.generate.backend_unavailable', {
      jobId: id,
      userId: user.id,
      error,
    });
    return NextResponse.json({ error: 'Could not reach the document backend.' }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const errorPayload = await backendResponse.json().catch(() => null) as { error?: string; detail?: string } | null;
    const errorMessage = errorPayload?.error ?? errorPayload?.detail ?? 'Could not generate outreach plan.';
    return NextResponse.json({ error: errorMessage }, { status: backendResponse.status });
  }

  const planSteps = await backendResponse.json() as ApiOutreachPlanStep[];

  try {
    await recordAuditEvent({
      actorUserId: user.id,
      action: 'outreach_plan.generated',
      jobId: id,
      entityType: 'outreach_plan',
      entityId: id,
      metadata: {
        stepCount: planSteps.length,
      },
    });
  } catch (error) {
    log.warn('audit_events.write_failed', {
      action: 'outreach_plan.generated',
      jobId: id,
      error,
    });
  }

  return NextResponse.json(planSteps);
});
