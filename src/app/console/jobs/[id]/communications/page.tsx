import { notFound } from 'next/navigation';
import { mockJobs } from '@/data/mockJobs';
import JobCommsView from '@/components/JobCommsView';

export default async function JobCommunicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = mockJobs.find(j => j.id === id);

  if (!job) notFound();

  return <JobCommsView jobId={job.id} />;
}
