import { notFound } from 'next/navigation';
import JobCommunicationsPageClient from '@/components/JobCommunicationsPageClient';
import { logServerEvent } from '@/lib/logging/server';
import { getServerComponentTrace } from '@/lib/logging/serverComponent';
import { findJobById } from '@/lib/jobStore';
import { ensureStarterTimeline } from '@/lib/starterTimeline';
import { createClient } from '@/lib/supabase/server';

export default async function JobCommunicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trace = await getServerComponentTrace();

  logServerEvent('info', 'server-component', 'console.job_communications.read.started', {
    path: '/console/jobs/[id]/communications',
    jobId: id,
  }, trace);

  let job: Awaited<ReturnType<typeof findJobById>> | undefined;
  try {
    const supabase = await createClient({
      source: 'server-component',
      scope: 'console.job_communications.page',
      trace,
    });
    job = await findJobById(id, supabase);
  } catch (error) {
    logServerEvent('error', 'server-component', 'console.job_communications.read.failed', {
      path: '/console/jobs/[id]/communications',
      jobId: id,
      error,
    }, trace);
    throw error;
  }

  if (!job) {
    logServerEvent('warn', 'server-component', 'console.job_communications.read.not_found', {
      path: '/console/jobs/[id]/communications',
      jobId: id,
    }, trace);
    notFound();
  }

  try {
    await ensureStarterTimeline(job, trace);
  } catch (error) {
    logServerEvent('warn', 'server-component', 'console.job_communications.starter_timeline.failed', {
      path: '/console/jobs/[id]/communications',
      jobId: id,
      error,
    }, trace);
  }

  logServerEvent('info', 'server-component', 'console.job_communications.read.completed', {
    path: '/console/jobs/[id]/communications',
    jobId: id,
  }, trace);

  return <JobCommunicationsPageClient />;
}
