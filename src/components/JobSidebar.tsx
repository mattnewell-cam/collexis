'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  jobId: string;
  name: string;
  address: string;
}

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

export default function JobSidebar({ jobId, name, address }: Props) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Documents', href: `/console/jobs/${jobId}/documents`, icon: <DocumentsIcon /> },
    { label: 'Details', href: `/console/jobs/${jobId}/details`, icon: <DetailsIcon /> },
    { label: 'Communications', href: `/console/jobs/${jobId}/communications`, icon: <CommsIcon /> },
  ];

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* Job header */}
      <div className="px-5 py-5 border-b border-gray-200">
        <p className="font-semibold text-gray-900 text-sm leading-snug">{name}</p>
        <p className="text-xs text-gray-500 mt-1 leading-snug">{address}</p>
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
