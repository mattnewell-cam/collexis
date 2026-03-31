import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import JobCommsView from '@/components/JobCommsView';
import { findJobById } from '@/lib/jobStore';

export default async function JobCommunicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = findJobById(id, await cookies());

  if (!job) notFound();

  return <JobCommsView job={job} />;
}
