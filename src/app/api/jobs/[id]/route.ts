import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  applyJobUpdate,
  findJobById,
  getAddedJobs,
  getAddedJobsCookieName,
  getDeletedJobsCookieName,
  getDeletedJobIds,
  serializeAddedJobs,
  serializeDeletedJobIds,
  upsertAddedJob,
} from '@/lib/jobStore';
import { readAuthenticatedEmail } from '@/lib/authSession';
import { mockJobs } from '@/data/mockJobs';

const documentBackendUrl = process.env.DOCUMENT_BACKEND_URL ?? 'http://127.0.0.1:8000';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const ownerEmail = readAuthenticatedEmail(cookieStore);
  const currentJob = findJobById(id, cookieStore);

  if (!currentJob) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }
  if (!ownerEmail) {
    return NextResponse.json({ error: 'Sign in to manage jobs.' }, { status: 401 });
  }

  const payload = await request.json();
  const updatedJob = applyJobUpdate(currentJob, payload);
  const nextAddedJobs = upsertAddedJob(getAddedJobs(cookieStore), updatedJob);
  const response = NextResponse.json({ job: updatedJob });

  response.cookies.set({
    name: getAddedJobsCookieName(ownerEmail),
    value: serializeAddedJobs(nextAddedJobs),
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const ownerEmail = readAuthenticatedEmail(cookieStore);
  const currentJob = findJobById(id, cookieStore);

  if (!currentJob) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }
  if (!ownerEmail) {
    return NextResponse.json({ error: 'Sign in to manage jobs.' }, { status: 401 });
  }

  let backendResponse: Response;

  try {
    backendResponse = await fetch(new URL(`/jobs/${id}`, documentBackendUrl), {
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

  const nextAddedJobs = getAddedJobs(cookieStore).filter(job => job.id !== id);
  const seedJobIds = new Set(mockJobs.map(job => job.id));
  const nextDeletedJobIds = seedJobIds.has(id)
    ? Array.from(new Set([...getDeletedJobIds(cookieStore), id]))
    : getDeletedJobIds(cookieStore).filter(jobId => jobId !== id);

  const backendPayload = await backendResponse.json().catch(() => ({}));
  const response = NextResponse.json({
    ...backendPayload,
    job: currentJob,
  });

  response.cookies.set({
    name: getAddedJobsCookieName(ownerEmail),
    value: serializeAddedJobs(nextAddedJobs),
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set({
    name: getDeletedJobsCookieName(ownerEmail),
    value: serializeDeletedJobIds(nextDeletedJobIds),
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
