'use client';

import { useState } from 'react';
import { Job } from '@/types/job';
import BulkUploadButton from './BulkUploadButton';
import JobRowModal from './JobRowModal';

interface Props {
  jobs: Job[];
}

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
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs ${classes}`}>
      {days}d
    </span>
  );
}

export default function JobsTable({ jobs }: Props) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <BulkUploadButton />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Description</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Days Overdue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="cursor-pointer hover:bg-teal-50 transition-colors"
                onClick={() => setSelectedJob(job)}
              >
                <td className="px-5 py-4 text-gray-800 whitespace-nowrap">{job.address}</td>
                <td className="px-5 py-4 text-gray-700">{job.jobDescription}</td>
                <td className="px-5 py-4 text-gray-800 whitespace-nowrap">{job.name}</td>
                <td className="px-5 py-4 text-gray-800 whitespace-nowrap">
                  ${job.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-4">
                  <DaysOverdueBadge days={job.daysOverdue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedJob && (
        <JobRowModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </>
  );
}
