'use client';

import { ReactNode, useId, useMemo, useState } from 'react';
import { Job, JobStatus } from '@/types/job';
import JobRowModal from './JobRowModal';

interface Props {
  jobs: Job[];
  actions?: ReactNode;
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

export default function JobsTable({ jobs, actions }: Props) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputId = useId();

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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-gray-500">
          Showing {visibleJobs.length} of {jobs.length} jobs
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <form
            className="w-full sm:w-auto"
            onSubmit={event => {
              event.preventDefault();
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
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Address
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Job Description
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Price
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Paid
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Days Overdue
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleJobs.length > 0 ? (
              visibleJobs.map(job => (
                <tr
                  key={job.id}
                  className="cursor-pointer transition-colors hover:bg-teal-50"
                  onClick={() => setSelectedJob(job)}
                >
                  <td className="whitespace-nowrap px-5 py-4 text-gray-800">
                    {job.address}
                  </td>
                  <td className="px-5 py-4 text-gray-700">
                    {job.jobDescription}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-gray-800">
                    {job.name}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-gray-800">
                    {POUND_SYMBOL}
                    {job.price.toLocaleString('en-GB', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-gray-800">
                    {job.amountPaid > 0 ? (
                      `${POUND_SYMBOL}${job.amountPaid.toLocaleString('en-GB', {
                        minimumFractionDigits: 2,
                      })}`
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {job.daysOverdue > 0 ? (
                      <DaysOverdueBadge days={job.daysOverdue} />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={job.status} />
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

      {selectedJob && (
        <JobRowModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </>
  );
}
