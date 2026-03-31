import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createStoredJob,
  getAddedJobs,
  getAddedJobsCookieName,
  getAllJobs,
  serializeAddedJobs,
} from '@/lib/jobStore';
import { readAuthenticatedEmail } from '@/lib/authSession';

export async function POST(request: Request) {
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

  const cookieStore = await cookies();
  const ownerEmail = readAuthenticatedEmail(cookieStore);
  if (!ownerEmail) {
    return NextResponse.json({ error: 'Sign in to manage jobs.' }, { status: 401 });
  }

  const addedJobs = getAddedJobs(cookieStore);
  const job = createStoredJob({ name, address, documents }, getAllJobs(cookieStore));
  const response = NextResponse.json({ job });

  response.cookies.set({
    name: getAddedJobsCookieName(ownerEmail),
    value: serializeAddedJobs([...addedJobs, job]),
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
