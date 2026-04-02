import { NextResponse } from 'next/server';
import { toApiJobSnapshot } from '@/lib/apiJobSnapshot';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { loggedFetch } from '@/lib/logging/fetch';
import { withRouteLogging } from '@/lib/logging/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findJobById, findJobsByEmail, getAllJobs } from '@/lib/jobStore';

type IncomingReplyPayload = {
  job_id?: unknown;
  reply?: {
    from_email?: unknown;
    from_name?: unknown;
    received_at?: unknown;
    subject?: unknown;
    body?: unknown;
  } | null;
};

type BackendJobInferenceResponse = {
  job_id?: string | null;
  confidence?: number;
  rationale?: string;
};

function normalizeReply(payload: IncomingReplyPayload['reply']) {
  if (!payload || typeof payload !== 'object') return null;

  const fromEmail = typeof payload.from_email === 'string' ? payload.from_email.trim().toLowerCase() : '';
  const fromName = typeof payload.from_name === 'string' ? payload.from_name.trim() : '';
  const receivedAt = typeof payload.received_at === 'string' ? payload.received_at.trim() : '';
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';

  if (!fromEmail) return null;
  if (!subject && !body) return null;

  return {
    from_email: fromEmail,
    from_name: fromName || null,
    received_at: receivedAt || null,
    subject,
    body,
  };
}

export const POST = withRouteLogging('inbound_email.match_and_forward', async (request: Request, _context, log) => {
  const payload = await request.json().catch(() => null) as IncomingReplyPayload | null;
  const reply = normalizeReply(payload?.reply ?? null);

  if (!reply) {
    return NextResponse.json({ error: 'A valid inbound reply is required.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const allJobs = await getAllJobs(supabase);
  const knownJobs = new Map(allJobs.map(job => [job.id, job]));

  if (knownJobs.size === 0) {
    return NextResponse.json({ error: 'There are no known jobs to match this inbound email against.' }, { status: 404 });
  }

  let job = null;
  if (typeof payload?.job_id === 'string' && payload.job_id.trim()) {
    job = knownJobs.get(payload.job_id.trim()) ?? await findJobById(payload.job_id.trim(), supabase) ?? null;
    if (!job) {
      return NextResponse.json({ error: 'Job not found for the supplied job id.' }, { status: 404 });
    }
  } else {
    const matchingJobs = await findJobsByEmail(reply.from_email, supabase);
    if (matchingJobs.length === 1) {
      [job] = matchingJobs;
    } else {
      const inferenceResponse = await loggedFetch(new URL('/jobs/infer-inbound-email-job', documentBackendOrigin()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reply,
          job_candidates: Array.from(knownJobs.values()).map(toApiJobSnapshot),
        }),
        cache: 'no-store',
      }, {
        name: 'inbound_email.infer_job',
        context: { candidateCount: knownJobs.size },
        trace: log.trace,
        source: 'next-api',
      });

      if (!inferenceResponse.ok) {
        const inferenceText = await inferenceResponse.text();
        return new NextResponse(inferenceText, {
          status: inferenceResponse.status,
          headers: {
            'Content-Type': inferenceResponse.headers.get('Content-Type') ?? 'application/json',
          },
        });
      }

      const inference = await inferenceResponse.json() as BackendJobInferenceResponse;
      if (!inference.job_id) {
        return NextResponse.json({
          error: 'Could not infer which job this inbound email pertains to.',
          confidence: inference.confidence ?? 0,
          rationale: inference.rationale ?? '',
        }, { status: 422 });
      }

      job = knownJobs.get(inference.job_id) ?? null;
      if (!job) {
        return NextResponse.json({ error: 'The inferred job was not found in the current job list.' }, { status: 404 });
      }
    }
  }

  const backendResponse = await loggedFetch(new URL(`/jobs/${job.id}/inbound-email-replies`, documentBackendOrigin()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_snapshot: toApiJobSnapshot(job),
      reply,
    }),
    cache: 'no-store',
  }, {
    name: 'inbound_email.forward_matched_job',
    context: { jobId: job.id },
    trace: log.trace,
    source: 'next-api',
  });

  const responseText = await backendResponse.text();

  return new NextResponse(responseText, {
    status: backendResponse.status,
    headers: {
      'Content-Type': backendResponse.headers.get('Content-Type') ?? 'application/json',
    },
  });
});
