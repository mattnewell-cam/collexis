'use client';

import { useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { mockJobs } from '@/data/mockJobs';

export default function DocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const job = mockJobs.find(j => j.id === id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const documents = (job?.invoiceDocuments ?? []).map(filename => ({
    filename,
    title: '[title]',
    date: '[date]',
    description: '[description]',
  }));

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || !job) return;
    const arr = Array.from(incoming);
    const existing = new Set(job.invoiceDocuments);
    for (const f of arr) {
      if (!existing.has(f.name)) {
        job.invoiceDocuments.push(f.name);
      }
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [job]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  return (
    <div className="flex flex-col h-full p-6" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* Upload zone — ~25% of page height */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3 shrink-0 ${
          dragging ? 'border-[#2abfaa] bg-teal-50' : 'border-gray-200 bg-gray-50'
        }`}
        style={{ height: '25vh' }}
      >
        <svg className="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm text-gray-500">Drag &amp; drop files here</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
        >
          Browse
        </button>
        <p className="text-xs text-gray-400">PDF or images</p>
      </div>

      {/* Document list */}
      <div className="mt-6 flex-1 overflow-y-auto space-y-3">
        {documents.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No documents uploaded yet.</p>
        )}
        {documents.map(doc => (
          <div
            key={doc.filename}
            className="flex rounded-xl border border-gray-200 bg-white overflow-hidden"
            style={{ height: '12.5vh', minHeight: '80px' }}
          >
            {/* Preview — 15% */}
            <div className="w-[15%] bg-gray-100 flex items-center justify-center shrink-0">
              <svg className="w-8 h-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>

            {/* Title, filename, date, description — 40% */}
            <div className="w-[40%] p-3 flex flex-col justify-center border-r border-gray-100">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                <p className="text-xs text-gray-500 truncate shrink-0">{doc.filename}</p>
              </div>
              <p className="text-xs text-gray-400 mt-1">{doc.date}</p>
              <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>
            </div>

            {/* Transcription area — 45% */}
            <div className="w-[45%] p-3 flex items-center">
              <p className="text-xs text-gray-300 italic">Transcription will appear here</p>
            </div>
          </div>
        ))}
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
