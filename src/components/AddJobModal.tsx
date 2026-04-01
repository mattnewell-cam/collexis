'use client';

import { useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { mergeJobWithIntakeSummary } from '@/lib/jobStore';
import { documentBackendPath } from '@/lib/documentBackend';
import type { Job, JobIntakeSummary } from '@/types/job';

interface Props {
  open: boolean;
  onClose: () => void;
}

type ApiJobIntakeSummary = {
  job_description: string;
  job_detail: string;
  due_date: string | null;
  price: number | null;
  amount_paid: number | null;
  emails: string[];
  phones: string[];
  context_instructions: string;
};

function mapApiJobIntakeSummary(summary: ApiJobIntakeSummary): JobIntakeSummary {
  return {
    jobDescription: summary.job_description,
    jobDetail: summary.job_detail,
    dueDate: summary.due_date,
    price: summary.price,
    amountPaid: summary.amount_paid,
    emails: summary.emails,
    phones: summary.phones,
    contextInstructions: summary.context_instructions,
  };
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export default function AddJobModal({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<'form' | 'processing'>('form');
  const [processingTitle, setProcessingTitle] = useState('Preparing intake');
  const [processingDetail, setProcessingDetail] = useState('We are setting up your job.');
  const [processingError, setProcessingError] = useState<string | null>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !names.has(f.name))];
    });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const removeFile = (fileName: string) =>
    setFiles(prev => prev.filter(f => f.name !== fileName));

  const close = (force = false) => {
    if (!force && submitting && phase === 'processing' && !processingError) return;
    setName('');
    setAddress('');
    setFiles([]);
    setDragging(false);
    setSubmitting(false);
    setPhase('form');
    setProcessingTitle('Preparing intake');
    setProcessingDetail('We are setting up your job.');
    setProcessingError(null);
    onClose();
  };

  const waitForDocumentsToSettle = useCallback(async (jobId: string, documentIds: string[]) => {
    if (documentIds.length === 0) return;

    while (true) {
      const response = await fetch(documentBackendPath(`/jobs/${jobId}/documents`), { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Could not check document processing.');
      }

      const payload = await response.json() as Array<{ id: string; status: 'processing' | 'ready' | 'failed' }>;
      const trackedDocuments = payload.filter(document => documentIds.includes(document.id));
      const settledDocuments = trackedDocuments.filter(document => document.status !== 'processing');
      const failedDocuments = trackedDocuments.filter(document => document.status === 'failed');

      setProcessingTitle('Processing documents');
      setProcessingDetail(
        `${settledDocuments.length} of ${documentIds.length} documents complete${failedDocuments.length > 0 ? `, ${failedDocuments.length} failed` : ''}.`,
      );

      if (trackedDocuments.length === documentIds.length && settledDocuments.length === documentIds.length) {
        return;
      }

      await sleep(1500);
    }
  }, []);

  const persistMergedJob = useCallback(async (job: Job) => {
    const response = await fetch(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });

    if (!response.ok) {
      throw new Error('Could not save processed job details.');
    }
  }, []);

  const handleUpload = async () => {
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setProcessingError(null);
    try {
      if (files.length > 0) {
        setPhase('processing');
        setProcessingTitle('Creating job');
        setProcessingDetail('We are setting up the intake workspace for your documents.');
      }

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          documents: files.map(file => file.name),
        }),
      });

      if (!response.ok) {
        throw new Error('Could not create job.');
      }

      const payload = await response.json() as { job: Job };

      if (files.length === 0) {
        close(true);
        router.push(`/console/jobs/${payload.job.id}/details`);
        router.refresh();
        return;
      }

      const documentIds: string[] = [];
      for (const [index, file] of files.entries()) {
        setProcessingTitle(`Uploading documents`);
        setProcessingDetail(`Uploading ${index + 1} of ${files.length}: ${file.name}`);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('processing_profile', 'job-intake');

        const uploadResponse = await fetch(documentBackendPath(`/jobs/${payload.job.id}/documents`), {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Could not upload ${file.name}.`);
        }

        const createdDocument = await uploadResponse.json() as { id: string };
        documentIds.push(createdDocument.id);
      }

      await waitForDocumentsToSettle(payload.job.id, documentIds);

      setProcessingTitle('Building job details');
      setProcessingDetail('We are turning the processed documents into job details and communications.');

      let mergedJob = payload.job;
      try {
        const summaryResponse = await fetch(documentBackendPath(`/jobs/${payload.job.id}/intake-summary`), { cache: 'no-store' });
        if (summaryResponse.ok) {
          const summary = mapApiJobIntakeSummary(await summaryResponse.json() as ApiJobIntakeSummary);
          mergedJob = mergeJobWithIntakeSummary(payload.job, summary);
        }
      } catch {
        // If summary generation fails, keep moving so the user can still review documents and timeline manually.
      }
      await persistMergedJob(mergedJob);

      close(true);
      router.push(`/console/jobs/${payload.job.id}/details?notice=docs-processed`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete the intake processing.';
      setPhase('processing');
      setProcessingTitle('Processing interrupted');
      setProcessingDetail('You can close this window and try again.');
      setProcessingError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const canDismiss = !(submitting && phase === 'processing' && !processingError);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={canDismiss ? () => close() : undefined} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{phase === 'processing' ? 'Processing' : 'Add Job'}</h2>
          <button
            onClick={() => close()}
            disabled={!canDismiss}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {phase === 'processing' ? (
          <div className="space-y-4 py-3">
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1e9bb8] shadow-sm">
                {processingError ? (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                ) : (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2abfaa]/30 border-t-[#1e9bb8]" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{processingTitle}</p>
                <p className="mt-1 text-sm text-gray-500">{processingDetail}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-4">
              <p className="text-sm text-gray-700">
                We&apos;re extracting job details and building the communications timeline from your uploaded documents.
              </p>
            </div>

            {processingError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{processingError}</p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              {processingError ? (
                <button
                  onClick={() => close()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Close
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
        {/* Name & Address */}
        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Client name"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Job address"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors"
            />
          </div>
        </div>

        {/* Upload documents */}
        <label className="block text-sm font-medium text-gray-700 mb-2">Upload documents</label>
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`rounded-xl border-2 border-dashed transition-colors px-6 py-8 flex flex-col items-center gap-3 ${
            dragging ? 'border-[#2abfaa] bg-teal-50' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <svg className="w-8 h-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-sm text-gray-500 text-center">Drag &amp; drop files here</p>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-1 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
          >
            Browse
          </button>
          <p className="text-xs text-gray-400">PDF or images</p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <ul className="mt-4 space-y-1.5 max-h-32 overflow-y-auto">
            {files.map(f => (
              <li key={f.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-sm text-gray-700">
                <span className="truncate mr-2">{f.name}</span>
                <button onClick={() => removeFile(f.name)} className="shrink-0 text-gray-400 hover:text-gray-600">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => close()} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { void handleUpload(); }}
            disabled={!name.trim() || submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
          >
            {submitting ? 'Creating...' : 'Upload'}
          </button>
        </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

