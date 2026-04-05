import ConsoleJobsView from '@/components/ConsoleJobsView';
import { logServerEvent } from '@/lib/logging/server';
import { getServerComponentTrace } from '@/lib/logging/serverComponent';
import { getAllJobs } from '@/lib/jobStore';
import { createClient } from '@/lib/supabase/server';

export default async function ConsolePage() {
  const trace = await getServerComponentTrace();
  logServerEvent('info', 'server-component', 'console.page.read.started', {
    path: '/console',
  }, trace);

  let jobs: Awaited<ReturnType<typeof getAllJobs>> = [];
  try {
    const supabase = await createClient({
      source: 'server-component',
      scope: 'console.page',
      trace,
    });
    jobs = await getAllJobs(supabase);
  } catch (error) {
    logServerEvent('error', 'server-component', 'console.page.read.failed', {
      path: '/console',
      error,
    }, trace);
    throw error;
  }

  logServerEvent('info', 'server-component', 'console.page.read.completed', {
    path: '/console',
    jobCount: jobs.length,
  }, trace);

  return <ConsoleJobsView initialJobs={jobs} />;
}
