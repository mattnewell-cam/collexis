'use client';

import { ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logClientEvent } from '@/lib/logging/client';
import { Job, JobStatus } from '@/types/job';

interface Props {
  title?: string;
  jobs: Job[];
  actions?: ReactNode;
  onDeleteJob?: (job: Job) => Promise<boolean> | boolean;
  deletingJobId?: string | null;
}

const POUND_SYMBOL = '\u00A3';

function DaysOverdueBadge({ days }: { days: number }) {
  let classes: string;

  if (days >= 30) {
    classes = 'bg-red-100 text-red-700';
  } else if (days >= 10) {
    classes = 'bg-amber-100 text-amber-700';
  } else {
    classes = 'bg-gray-100 text-gray-600';
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${classes}`}>
      {days}d
    </span>
  );
}

const STATUS_STYLES: Record<JobStatus, string> = {
  'Initial wait': 'bg-gray-100 text-gray-600',
  'Polite chase': 'bg-blue-100 text-blue-700',
  'Stern chase': 'bg-amber-100 text-amber-700',
  'Letter of Action sent': 'bg-orange-100 text-orange-700',
  'Awaiting judgment': 'bg-red-100 text-red-700',
  'Judgment granted': 'bg-purple-100 text-purple-700',
  Paid: 'bg-green-100 text-green-700',
  Abandoned: 'bg-gray-100 text-gray-400',
};

const STATUS_PROGRESS_ORDER: Record<JobStatus, number> = {
  Paid: 7,
  Abandoned: 6,
  'Judgment granted': 5,
  'Awaiting judgment': 4,
  'Letter of Action sent': 3,
  'Stern chase': 2,
  'Polite chase': 1,
  'Initial wait': 0,
};

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

export default function JobsTable({ title, jobs, actions, onDeleteJob, deletingJobId = null }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<Job | null>(null);
  const [openMenuJobId, setOpenMenuJobId] = useState<string | null>(null);
  const searchInputId = useId();
  const showDeleteColumn = Boolean(onDeleteJob);
  const openMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuJobId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!openMenuRef.current?.contains(event.target as Node)) {
        setOpenMenuJobId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuJobId(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuJobId]);

  const handleConfirmDelete = async () => {
    if (!deleteConfirmJob || !onDeleteJob) {
      return;
    }

    const didDelete = await onDeleteJob(deleteConfirmJob);
    if (didDelete) {
      setDeleteConfirmJob(null);
    }
  };

  const navigateToJob = (jobId: string) => {
    logClientEvent('info', 'jobs.opened', {
      jobId,
      tableTitle: title ?? null,
    }, { sendToServer: true });
    router.push(`/console/jobs/${jobId}`);
  };

  const visibleJobs = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    const filteredJobs = normalizedSearchQuery
      ? jobs.filter(job => {
          const searchableContent = [
            job.address,
            job.jobDescription,
            job.name,
            ...job.emails,
            ...job.phones,
          ]
            .join(' ')
            .toLowerCase();

          return searchableContent.includes(normalizedSearchQuery);
        })
      : jobs;

    return [...filteredJobs].sort((a, b) => {
      const statusDifference =
        STATUS_PROGRESS_ORDER[b.status] - STATUS_PROGRESS_ORDER[a.status];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      const overdueDifference = b.daysOverdue - a.daysOverdue;

      if (overdueDifference !== 0) {
        return overdueDifference;
      }

      return a.name.localeCompare(b.name);
    });
  }, [jobs, searchQuery]);

  return (
    <>
      {title ? (
        <div className="mb-2">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-gray-500">
          Showing {visibleJobs.length} of {jobs.length} jobs
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <form
            className="w-full sm:w-auto"
            onSubmit={event => {
              event.preventDefault();
              logClientEvent('info', 'jobs.search_submitted', {
                tableTitle: title ?? null,
                queryLength: searchInput.trim().length,
                totalJobs: jobs.length,
              }, { sendToServer: true });
              setSearchQuery(searchInput);
            }}
          >
            <input
              id={searchInputId}
              type="search"
              aria-label="Search table"
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder="Search address, job, name, email, phone"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] sm:w-80"
            />
          </form>
          {actions}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="w-[19%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Address
              </th>
              <th className="w-[20%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Job Description
              </th>
              <th className="w-[17%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="w-[11%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Price
              </th>
              <th className="w-[10%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Paid
              </th>
              <th className="w-[8%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Days Overdue
              </th>
              <th className="w-[15%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleJobs.length > 0 ? (
              visibleJobs.map(job => (
                <tr
                  key={job.id}
                  className="transition-colors hover:bg-teal-50"
                >
                  <td
                    className="px-5 py-4 text-gray-800 cursor-pointer"
                    onClick={() => navigateToJob(job.id)}
                  >
                    {job.address}
                  </td>
                  <td
                    className="px-5 py-4 text-gray-700 cursor-pointer"
                    onClick={() => navigateToJob(job.id)}
                  >
                    {job.jobDescription}
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-4 text-gray-800 cursor-pointer"
                    onClick={() => navigateToJob(job.id)}
                  >
                    {job.name}
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-4 text-gray-800 cursor-pointer"
                    onClick={() => navigateToJob(job.id)}
                  >
                    {POUND_SYMBOL}
                    {job.price.toLocaleString('en-GB', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-4 text-gray-800 cursor-pointer"
                    onClick={() => navigateToJob(job.id)}
                  >
                    {job.amountPaid > 0 ? (
                      `${POUND_SYMBOL}${job.amountPaid.toLocaleString('en-GB', {
                        minimumFractionDigits: 2,
                      })}`
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td
                    className="px-5 py-4 cursor-pointer"
                    onClick={() => navigateToJob(job.id)}
                  >
                    {job.daysOverdue > 0 ? (
                      <DaysOverdueBadge days={job.daysOverdue} />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td
                    className="px-5 py-4 cursor-pointer"
                    onClick={() => navigateToJob(job.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={job.status} />
                      {showDeleteColumn ? (
                        <div
                          ref={openMenuJobId === job.id ? openMenuRef : null}
                          className="relative inline-flex shrink-0"
                          onClick={event => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`More actions for ${job.name}`}
                            aria-expanded={openMenuJobId === job.id}
                            onClick={() => {
                              setOpenMenuJobId(currentId => (currentId === job.id ? null : job.id));
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                              <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
                              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                              <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
                            </svg>
                          </button>
                          {openMenuJobId === job.id ? (
                            <div className="absolute bottom-10 right-0 z-20 min-w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-[0_18px_60px_-24px_rgba(15,23,42,0.35)]">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuJobId(null);
                                  setDeleteConfirmJob(job);
                                }}
                                disabled={deletingJobId === job.id}
                                className="block w-full px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingJobId === job.id ? 'Deleting...' : 'Delete job'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-sm text-gray-500"
                >
                  No jobs match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {deleteConfirmJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => {
              if (deletingJobId !== deleteConfirmJob.id) {
                setDeleteConfirmJob(null);
              }
            }}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
            <h3 className="text-lg font-semibold text-gray-900">Are you sure?</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Delete <span className="font-medium text-gray-900">{deleteConfirmJob.name}</span> and remove its documents and timeline items permanently?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmJob(null)}
                disabled={deletingJobId === deleteConfirmJob.id}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingJobId === deleteConfirmJob.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400"
              >
                {deletingJobId === deleteConfirmJob.id ? 'Deleting...' : 'Delete job'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}
