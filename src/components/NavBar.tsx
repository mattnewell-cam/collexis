'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import AddJobModal from '@/components/AddJobModal';

export default function NavBar() {
  const pathname = usePathname();
  const isJobs = pathname === '/console';
  const isAccount = pathname.startsWith('/console/account');
  const [showAddJob, setShowAddJob] = useState(false);

  return (
    <>
      <nav className="w-full border-b border-gray-200 shadow-sm h-16 flex items-center px-8" style={{ background: '#f8f9fb' }}>
        <div className="flex items-center justify-between w-full">
          {/* Wordmark */}
          <Link
            href="/console"
            className="text-2xl font-bold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Collexis
          </Link>

          {/* Tabs + Add Job */}
          <div className="flex items-center gap-3">
            <Link
              href="/console"
              className={`relative px-4 py-1.5 text-sm font-medium transition-colors ${
                isJobs ? 'text-[#1e9bb8]' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Jobs
              {isJobs && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
                />
              )}
            </Link>
            <button
              onClick={() => setShowAddJob(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80"
              style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Job
            </button>
            <Link
              href="/console/account"
              aria-label="Open account details and settings"
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                isAccount
                  ? 'border-teal-200 bg-teal-50 text-teal-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="8" r="4" />
              </svg>
            </Link>
          </div>
        </div>
      </nav>
      <AddJobModal open={showAddJob} onClose={() => setShowAddJob(false)} />
    </>
  );
}
