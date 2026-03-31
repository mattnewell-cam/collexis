import { cookies } from 'next/headers';
import ConsoleJobsView from '@/components/ConsoleJobsView';
import { getAllJobs } from '@/lib/jobStore';

export default async function ConsolePage() {
  return <ConsoleJobsView initialJobs={getAllJobs(await cookies())} />;
}
