import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
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
  const cookieStore = await cookies();
  const job = findJobById(id, cookieStore);

  if (!job) notFound();

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <JobSidebar
        jobId={job.id}
        name={job.name}
        address={job.address}
        availableJobs={getAllJobs(cookieStore).filter(candidate => isOutstandingJob(candidate.status))}
      />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
