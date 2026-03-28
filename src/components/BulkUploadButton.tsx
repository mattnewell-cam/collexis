import { useRef } from 'react';

export default function BulkUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80"
        style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Bulk Upload Invoices
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
      />
    </>
  );
}
