import { notFound } from 'next/navigation';
import JobSidebar from '@/components/JobSidebar';
import { logServerEvent } from '@/lib/logging/server';
import { getServerComponentTrace } from '@/lib/logging/serverComponent';
import { findJobById, getAllJobs, isOutstandingJob } from '@/lib/jobStore';
import { createClient } from '@/lib/supabase/server';

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trace = await getServerComponentTrace();

  logServerEvent('info', 'server-component', 'console.job_layout.read.started', {
    path: '/console/jobs/[id]',
    jobId: id,
  }, trace);

  let job: Awaited<ReturnType<typeof findJobById>> | undefined;
  let allJobs: Awaited<ReturnType<typeof getAllJobs>> = [];
  try {
    const supabase = await createClient({
      source: 'server-component',
      scope: 'console.job_layout',
      trace,
    });
    [job, allJobs] = await Promise.all([
      findJobById(id, supabase),
      getAllJobs(supabase),
    ]);
  } catch (error) {
    logServerEvent('error', 'server-component', 'console.job_layout.read.failed', {
      path: '/console/jobs/[id]',
      jobId: id,
      error,
    }, trace);
    throw error;
  }

  if (!job) {
    logServerEvent('warn', 'server-component', 'console.job_layout.read.not_found', {
      path: '/console/jobs/[id]',
      jobId: id,
    }, trace);
    notFound();
  }

  logServerEvent('info', 'server-component', 'console.job_layout.read.completed', {
    path: '/console/jobs/[id]',
    jobId: id,
    availableJobCount: allJobs.filter(candidate => isOutstandingJob(candidate.status)).length,
  }, trace);

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <JobSidebar
        jobId={job.id}
        name={job.name}
        address={job.address}
        availableJobs={allJobs.filter(candidate => isOutstandingJob(candidate.status))}
      />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
