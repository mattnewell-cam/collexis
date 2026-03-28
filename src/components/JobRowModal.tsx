'use client';

import { useEffect, useState } from 'react';
import { Job } from '@/types/job';

interface Props {
  job: Job;
  onClose: () => void;
}

export default function JobRowModal({ job, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-in on mount
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`relative w-full max-w-lg h-full bg-white shadow-xl overflow-y-auto transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{job.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{job.address}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Contact */}
        <section className="p-6 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact</h3>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {job.emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  {email}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {job.phones.map((phone) => (
                <span key={phone} className="text-sm text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.63 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.6a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {phone}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Job Details */}
        <section className="p-6 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Job Details</h3>
          <p className="text-sm text-gray-800 mb-3">{job.jobDescription}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Total</span>
            <span className="text-lg font-semibold text-gray-900">
              ${job.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </section>

        {/* Context / Instructions */}
        <section className="p-6 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Context / Instructions</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{job.contextInstructions}</p>
        </section>

        {/* Invoice Documents */}
        <section className="p-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Invoice Documents</h3>
          <div className="space-y-2">
            {job.invoiceDocuments.map((doc) => (
              <div
                key={doc}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span className="text-sm text-gray-700">{doc}</span>
                </div>
                {/* Non-functional download link */}
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-xs font-medium text-[#1e9bb8] hover:opacity-80 transition-opacity"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
