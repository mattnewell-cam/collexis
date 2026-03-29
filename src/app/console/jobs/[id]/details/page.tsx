import { notFound } from 'next/navigation';
import { mockJobs } from '@/data/mockJobs';
import JobDetailsForm from '@/components/JobDetailsForm';

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = mockJobs.find(j => j.id === id);

  if (!job) notFound();

  return (
    <div className="overflow-y-auto h-full">
      <JobDetailsForm job={job} />
    </div>
  );
}
