import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit/server';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';
import { findJobById } from '@/lib/jobStore';
import { createClient } from '@/lib/supabase/server';

type TimelineDeletePayload = {
  category?: unknown;
  subtype?: unknown;
  sender?: unknown;
};

export const DELETE = withRouteLogging('timeline_items.delete_route', async (
  request: Request,
  { params }: { params: Promise<{ id: string; timelineItemId: string }> },
  log,
) => {
  const { id, timelineItemId } = await params;
  const payload = await request.json().catch(() => null) as TimelineDeletePayload | null;
  const category = typeof payload?.category === 'string' ? payload.category : null;
  const subtype = typeof payload?.subtype === 'string' ? payload.subtype : null;
  const sender = typeof payload?.sender === 'string' ? payload.sender : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to manage timeline items.' }, { status: 401 });
  }

  const currentJob = await findJobById(id, supabase);
  if (!currentJob) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  let backendResponse: Response;

  try {
    log.info('timeline_items.delete.forward_to_backend', {
      jobId: id,
      timelineItemId,
      userId: user.id,
    });
    backendResponse = await loggedFetch(new URL(`/timeline-items/${timelineItemId}`, documentBackendOrigin()), {
      method: 'DELETE',
      cache: 'no-store',
    }, {
      name: 'timeline.delete_backend_request',
      context: { jobId: id, timelineItemId },
      trace: log.trace,
      source: 'next-api',
    });
  } catch (error) {
    log.error('timeline_items.delete.backend_unavailable', {
      jobId: id,
      timelineItemId,
      userId: user.id,
      error,
    });
    return NextResponse.json({ error: 'Could not reach the document backend.' }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const errorPayload = await backendResponse.json().catch(() => null) as { error?: string; detail?: string } | null;
    const errorMessage = errorPayload?.error ?? errorPayload?.detail ?? 'Could not delete timeline item.';
    return NextResponse.json({ error: errorMessage }, { status: backendResponse.status });
  }

  try {
    await recordAuditEvent({
      actorUserId: user.id,
      action: 'timeline_item.deleted',
      jobId: id,
      entityType: 'timeline_item',
      entityId: timelineItemId,
      metadata: {
        category,
        subtype,
        sender,
      },
    });
  } catch (error) {
    log.warn('audit_events.write_failed', {
      action: 'timeline_item.deleted',
      jobId: id,
      timelineItemId,
      error,
    });
  }

  return NextResponse.json({ deleted: true });
});
