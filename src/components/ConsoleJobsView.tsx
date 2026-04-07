'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import JobsTable from '@/components/JobsTable';
import { runClientAction } from '@/lib/logging/client';
import { loggedFetch } from '@/lib/logging/fetch';
import { toUserFacingErrorMessage } from '@/lib/userFacingError';
import { Job } from '@/types/job';

interface Props {
  initialJobs: Job[];
}

const isOutstandingJob = (job: Job) => job.status !== 'Paid' && job.status !== 'Abandoned';

export default function ConsoleJobsView({ initialJobs }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const outstandingJobs = useMemo(
    () => jobs.filter(isOutstandingJob),
    [jobs],
  );
  const pastJobs = useMemo(
    () => jobs.filter(job => !isOutstandingJob(job)),
    [jobs],
  );

  const handleDeleteJob = async (job: Job) => {
    setDeleteError(null);
    setDeletingJobId(job.id);
    const previousJobs = jobs;
    setJobs(currentJobs => currentJobs.filter(currentJob => currentJob.id !== job.id));

    try {
      return await runClientAction('jobs.delete', async trace => {
        const response = await loggedFetch(`/api/jobs/${job.id}`, {
          method: 'DELETE',
        }, {
          name: 'jobs.delete_request',
          context: { jobId: job.id },
          trace,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Could not delete job.');
        }

        router.refresh();
        return true;
      }, {
        jobId: job.id,
      });
    } catch (error) {
      setJobs(previousJobs);
      setDeleteError(toUserFacingErrorMessage(error, 'Could not delete job.'));
      return false;
    } finally {
      setDeletingJobId(currentId => (currentId === job.id ? null : currentId));
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
      {deleteError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      ) : null}

      <section>
        <JobsTable
          title="Outstanding"
          jobs={outstandingJobs}
          onDeleteJob={handleDeleteJob}
          deletingJobId={deletingJobId}
        />
      </section>

      <section>
        <JobsTable
          title="Past Jobs"
          jobs={pastJobs}
          onDeleteJob={handleDeleteJob}
          deletingJobId={deletingJobId}
        />
      </section>
    </main>
  );
}
