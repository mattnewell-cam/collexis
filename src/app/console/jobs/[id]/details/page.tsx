import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import JobDetailsForm from '@/components/JobDetailsForm';
import { findJobById } from '@/lib/jobStore';

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = findJobById(id, await cookies());

  if (!job) notFound();

  return (
    <div className="overflow-y-auto h-full">
      <JobDetailsForm job={job} />
    </div>
  );
}
