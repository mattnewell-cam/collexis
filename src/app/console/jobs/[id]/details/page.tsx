import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JobDetailsForm from '@/components/JobDetailsForm';
import { findJobById } from '@/lib/jobStore';

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const job = await findJobById(id, supabase);

  if (!job) notFound();

  return (
    <div className="overflow-y-auto h-full">
      <JobDetailsForm job={job} />
    </div>
  );
}
