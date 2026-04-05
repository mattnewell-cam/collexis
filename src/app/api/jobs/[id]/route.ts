import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit/server';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';
import { createClient } from '@/lib/supabase/server';
import { findJobById, updateJob, deleteJob } from '@/lib/jobStore';

export const PATCH = withRouteLogging('jobs.update', async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  log,
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to manage jobs.' }, { status: 401 });
  }

  const currentJob = await findJobById(id, supabase);

  if (!currentJob) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  try {
    const payload = await request.json();
    const changedFields = payload && typeof payload === 'object'
      ? Object.keys(payload as Record<string, unknown>).sort()
      : [];
    log.info('jobs.update.attempt', {
      jobId: id,
      userId: user.id,
      changedFields,
    });
    const updatedJob = await updateJob(supabase, id, payload);
    try {
      await recordAuditEvent({
        actorUserId: user.id,
        action: 'job.updated',
        jobId: id,
        entityType: 'job',
        entityId: id,
        metadata: {
          changedFields,
        },
      });
    } catch (error) {
      log.warn('audit_events.write_failed', {
        action: 'job.updated',
        jobId: id,
        error,
      });
    }
    return NextResponse.json({ job: updatedJob });
  } catch (error) {
    log.error('jobs.update.failed', {
      jobId: id,
      userId: user.id,
      error,
    });
    return NextResponse.json({ error: 'Could not update job.' }, { status: 500 });
  }
});

export const DELETE = withRouteLogging('jobs.delete', async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
  log,
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to manage jobs.' }, { status: 401 });
  }

  const currentJob = await findJobById(id, supabase);

  if (!currentJob) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  let backendResponse: Response;

  try {
    log.info('jobs.delete.forward_to_backend', {
      jobId: id,
      userId: user.id,
    });
    backendResponse = await loggedFetch(new URL(`/jobs/${id}`, documentBackendOrigin()), {
      method: 'DELETE',
    }, {
      name: 'jobs.delete_backend_request',
      context: { jobId: id },
      trace: log.trace,
      source: 'next-api',
    });
  } catch (error) {
    log.error('jobs.delete.backend_unavailable', {
      jobId: id,
      userId: user.id,
      error,
    });
    return NextResponse.json({ error: 'Could not reach the document backend.' }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const errorPayload = await backendResponse.json().catch(() => null) as { error?: string; detail?: string } | null;
    const errorMessage = errorPayload?.error ?? errorPayload?.detail ?? 'Could not delete job.';
    return NextResponse.json({ error: errorMessage }, { status: backendResponse.status });
  }

  try {
    await deleteJob(supabase, id);
  } catch (error) {
    log.error('jobs.delete.failed', {
      jobId: id,
      userId: user.id,
      error,
    });
    return NextResponse.json({ error: 'Could not delete job.' }, { status: 500 });
  }

  try {
    await recordAuditEvent({
      actorUserId: user.id,
      action: 'job.deleted',
      jobId: id,
      entityType: 'job',
      entityId: id,
      metadata: {
        status: currentJob.status,
      },
    });
  } catch (error) {
    log.warn('audit_events.write_failed', {
      action: 'job.deleted',
      jobId: id,
      error,
    });
  }

  const backendPayload = await backendResponse.json().catch(() => ({}));
  return NextResponse.json({ ...backendPayload, job: currentJob });
});
