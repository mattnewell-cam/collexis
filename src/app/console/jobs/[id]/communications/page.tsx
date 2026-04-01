import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JobCommsView from '@/components/JobCommsView';
import { findJobById } from '@/lib/jobStore';

export default async function JobCommunicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const job = await findJobById(id, supabase);

  if (!job) notFound();

  return <JobCommsView job={job} />;
}
