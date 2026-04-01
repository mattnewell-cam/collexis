import { createClient } from '@/lib/supabase/server';
import ConsoleJobsView from '@/components/ConsoleJobsView';
import { getAllJobs } from '@/lib/jobStore';

export default async function ConsolePage() {
  const supabase = await createClient();
  const jobs = await getAllJobs(supabase);
  return <ConsoleJobsView initialJobs={jobs} />;
}
