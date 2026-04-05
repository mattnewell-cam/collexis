import { notFound } from 'next/navigation';
import JobDocumentsView from '@/components/JobDocumentsView';
import { logServerEvent } from '@/lib/logging/server';
import { getServerComponentTrace } from '@/lib/logging/serverComponent';
import { findJobById } from '@/lib/jobStore';
import { createClient } from '@/lib/supabase/server';

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trace = await getServerComponentTrace();

  logServerEvent('info', 'server-component', 'console.job_documents.read.started', {
    path: '/console/jobs/[id]/documents',
    jobId: id,
  }, trace);

  let job: Awaited<ReturnType<typeof findJobById>> | undefined;
  try {
    const supabase = await createClient({
      source: 'server-component',
      scope: 'console.job_documents.page',
      trace,
    });
    job = await findJobById(id, supabase);
  } catch (error) {
    logServerEvent('error', 'server-component', 'console.job_documents.read.failed', {
      path: '/console/jobs/[id]/documents',
      jobId: id,
      error,
    }, trace);
    throw error;
  }

  if (!job) {
    logServerEvent('warn', 'server-component', 'console.job_documents.read.not_found', {
      path: '/console/jobs/[id]/documents',
      jobId: id,
    }, trace);
    notFound();
  }

  logServerEvent('info', 'server-component', 'console.job_documents.read.completed', {
    path: '/console/jobs/[id]/documents',
    jobId: id,
  }, trace);

  return <JobDocumentsView jobId={id} />;
}
