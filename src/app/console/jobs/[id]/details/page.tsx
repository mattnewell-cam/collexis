import { notFound } from 'next/navigation';
import JobDetailsForm from '@/components/JobDetailsForm';
import { logServerEvent } from '@/lib/logging/server';
import { getServerComponentTrace } from '@/lib/logging/serverComponent';
import { findJobById } from '@/lib/jobStore';
import { createClient } from '@/lib/supabase/server';

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trace = await getServerComponentTrace();

  logServerEvent('info', 'server-component', 'console.job_details.read.started', {
    path: '/console/jobs/[id]/details',
    jobId: id,
  }, trace);

  let job: Awaited<ReturnType<typeof findJobById>> | undefined;
  try {
    const supabase = await createClient({
      source: 'server-component',
      scope: 'console.job_details.page',
      trace,
    });
    job = await findJobById(id, supabase);
  } catch (error) {
    logServerEvent('error', 'server-component', 'console.job_details.read.failed', {
      path: '/console/jobs/[id]/details',
      jobId: id,
      error,
    }, trace);
    throw error;
  }

  if (!job) {
    logServerEvent('warn', 'server-component', 'console.job_details.read.not_found', {
      path: '/console/jobs/[id]/details',
      jobId: id,
    }, trace);
    notFound();
  }

  logServerEvent('info', 'server-component', 'console.job_details.read.completed', {
    path: '/console/jobs/[id]/details',
    jobId: id,
  }, trace);

  return (
    <div className="overflow-y-auto h-full">
      <JobDetailsForm job={job} />
    </div>
  );
}
