import { notFound } from 'next/navigation';
import { mockJobs } from '@/data/mockJobs';
import JobSidebar from '@/components/JobSidebar';

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = mockJobs.find(j => j.id === id);

  if (!job) notFound();

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <JobSidebar jobId={job.id} name={job.name} address={job.address} />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
