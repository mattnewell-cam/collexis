import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createJob } from '@/lib/jobStore';

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to manage jobs.' }, { status: 401 });
  }

  try {
    const job = await createJob(supabase, user.id, { name, address, documents });
    return NextResponse.json({ job });
  } catch {
    return NextResponse.json({ error: 'Could not create job.' }, { status: 500 });
  }
}
