import { NextResponse } from 'next/server';
import { documentBackendOrigin } from '@/lib/documentBackend';
import { createClient } from '@/lib/supabase/server';
import { findJobById, updateJob, deleteJob } from '@/lib/jobStore';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const updatedJob = await updateJob(supabase, id, payload);
    return NextResponse.json({ job: updatedJob });
  } catch {
    return NextResponse.json({ error: 'Could not update job.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    backendResponse = await fetch(new URL(`/jobs/${id}`, documentBackendOrigin()), {
      method: 'DELETE',
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach the document backend.' }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const errorPayload = await backendResponse.json().catch(() => null) as { error?: string; detail?: string } | null;
    const errorMessage = errorPayload?.error ?? errorPayload?.detail ?? 'Could not delete job.';
    return NextResponse.json({ error: errorMessage }, { status: backendResponse.status });
  }

  try {
    await deleteJob(supabase, id);
  } catch {
    return NextResponse.json({ error: 'Could not delete job.' }, { status: 500 });
  }

  const backendPayload = await backendResponse.json().catch(() => ({}));
  return NextResponse.json({ ...backendPayload, job: currentJob });
}
