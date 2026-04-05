import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit/server';
import { createClient } from '@/lib/supabase/server';
import { createJob } from '@/lib/jobStore';
import { withRouteLogging } from '@/lib/logging/server';

export const POST = withRouteLogging('jobs.create', async (request, _context, log) => {
  const payload = await request.json() as {
    name?: unknown;
    address?: unknown;
    documents?: unknown;
  };

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const documents = Array.isArray(payload.documents)
    ? payload.documents.filter((item): item is string => typeof item === 'string')
    : [];

  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to manage jobs.' }, { status: 401 });
  }

  try {
    log.info('jobs.create.attempt', {
      userId: user.id,
      hasAddress: Boolean(address),
      documentCount: documents.length,
    });
    const job = await createJob(supabase, user.id, { name, address, documents });
    try {
      await recordAuditEvent({
        actorUserId: user.id,
        action: 'job.created',
        jobId: job.id,
        entityType: 'job',
        entityId: job.id,
        metadata: {
          hasAddress: Boolean(address),
          documentCount: documents.length,
        },
      });
    } catch (error) {
      log.warn('audit_events.write_failed', {
        action: 'job.created',
        jobId: job.id,
        error,
      });
    }
    return NextResponse.json({ job });
  } catch (error) {
    log.error('jobs.create.failed', {
      userId: user.id,
      error,
    });
    return NextResponse.json({ error: 'Could not create job.' }, { status: 500 });
  }
});
