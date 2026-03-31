'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Job } from '@/types/job';
import { usePathname } from 'next/navigation';

interface Props {
  jobId: string;
  name: string;
  address: string;
  availableJobs: Job[];
}

const isOutstandingJob = (status: string) => status !== 'Paid' && status !== 'Abandoned';

const DetailsIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const DocumentsIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const CommsIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function JobSidebar({ jobId, name, address, availableJobs }: Props) {
  const pathname = usePathname();
  const [isJobMenuOpen, setIsJobMenuOpen] = useState(false);
  const jobMenuRef = useRef<HTMLDivElement | null>(null);
  const outstandingJobs = useMemo(
    () => availableJobs.filter(job => isOutstandingJob(job.status)),
    [availableJobs],
  );
  const currentJobBasePath = `/console/jobs/${jobId}`;
  const currentSectionPath = pathname.startsWith(currentJobBasePath)
    ? pathname.slice(currentJobBasePath.length) || '/details'
    : '/details';
  const normalizedSectionPath = currentSectionPath === '/' ? '/details' : currentSectionPath;

  const tabs = [
    { label: 'Documents', href: `/console/jobs/${jobId}/documents`, icon: <DocumentsIcon /> },
    { label: 'Details', href: `/console/jobs/${jobId}/details`, icon: <DetailsIcon /> },
    { label: 'Communications', href: `/console/jobs/${jobId}/communications`, icon: <CommsIcon /> },
  ];

  useEffect(() => {
    if (!isJobMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!jobMenuRef.current?.contains(event.target as Node)) {
        setIsJobMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsJobMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isJobMenuOpen]);

  const getJobHref = (targetJobId: string) => `/console/jobs/${targetJobId}${normalizedSectionPath}`;

  return (
    <aside className="relative z-10 flex w-60 shrink-0 flex-col border-r border-gray-200 bg-gray-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* Job header */}
      <div className="relative border-b border-gray-200 px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm leading-snug">{name}</p>
            <p className="mt-1 text-xs leading-snug text-gray-500">{address}</p>
          </div>
          <div ref={jobMenuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label="Switch to another outstanding job"
              aria-expanded={isJobMenuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
              onClick={() => setIsJobMenuOpen(open => !open)}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 10l5 5 5-5" />
              </svg>
            </button>
            {isJobMenuOpen ? (
              <div className="absolute left-0 top-11 z-20 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Outstanding Jobs
                </div>
                <div className="flex max-h-80 flex-col overflow-y-auto">
                  {outstandingJobs.map(job => {
                    const isCurrentJob = job.id === jobId;

                    return (
                      <Link
                        key={job.id}
                        href={getJobHref(job.id)}
                        aria-current={isCurrentJob ? 'page' : undefined}
                        className={`rounded-xl px-3 py-2.5 transition-colors ${
                          isCurrentJob ? 'bg-teal-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setIsJobMenuOpen(false)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{job.name}</p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">{job.jobDescription}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            {job.daysOverdue}d
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-2 flex flex-col gap-0.5">
        {tabs.map(tab => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-teal-50 text-teal-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
