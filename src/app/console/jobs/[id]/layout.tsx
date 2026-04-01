import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JobSidebar from '@/components/JobSidebar';
import { findJobById, getAllJobs, isOutstandingJob } from '@/lib/jobStore';

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [job, allJobs] = await Promise.all([
    findJobById(id, supabase),
    getAllJobs(supabase),
  ]);

  if (!job) notFound();

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
