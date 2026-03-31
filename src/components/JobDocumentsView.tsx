'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentRecord } from '@/types/document';

type ApiDocumentRecord = {
  id: string;
  job_id: string;
  original_filename: string;
  mime_type: string;
  storage_path: string;
  status: DocumentRecord['status'];
  title: string;
  communication_date: string | null;
  description: string;
  transcript: string;
  extraction_error: string | null;
  created_at: string;
  updated_at: string;
};

type EditableField = 'title' | 'communicationDate' | 'description' | 'transcript';

type EditableDocumentRecord = DocumentRecord & {
  isSaving: boolean;
  pendingSave: boolean;
  saveError: string | null;
};

const SAVE_DEBOUNCE_MS = 700;

function mapApiDocument(document: ApiDocumentRecord): DocumentRecord {
  return {
    id: document.id,
    jobId: document.job_id,
    originalFilename: document.original_filename,
    mimeType: document.mime_type,
    storagePath: document.storage_path,
    status: document.status,
    title: document.title,
    communicationDate: document.communication_date ?? '',
    description: document.description,
    transcript: document.transcript,
    extractionError: document.extraction_error,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

function createLocalDocument(document: DocumentRecord): EditableDocumentRecord {
  return {
    ...document,
    isSaving: false,
    pendingSave: false,
    saveError: null,
  };
}

function mergeDocuments(previous: EditableDocumentRecord[], incoming: DocumentRecord[]): EditableDocumentRecord[] {
  const previousById = new Map(previous.map(doc => [doc.id, doc]));
  const mergedDocuments = incoming.map(doc => {
    const existing = previousById.get(doc.id);
    if (!existing) {
      return createLocalDocument(doc);
    }

    if (existing.pendingSave || existing.isSaving || existing.saveError) {
      return {
        ...existing,
        jobId: doc.jobId,
        originalFilename: doc.originalFilename,
        mimeType: doc.mimeType,
        storagePath: doc.storagePath,
        status: doc.status,
        extractionError: doc.extractionError,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    }

    return {
      ...createLocalDocument(doc),
      isSaving: existing.isSaving,
      pendingSave: existing.pendingSave,
      saveError: existing.saveError,
    };
  });

  const pendingTempDocuments = previous.filter(doc => doc.id.startsWith('temp-'));
  return [...pendingTempDocuments, ...mergedDocuments];
}

function fileTitleFallback(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}

function documentKindLabel(mimeType: string) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  return 'File';
}

function isImageDocument(mimeType: string) {
  return mimeType.startsWith('image/');
}

function canViewDocument(mimeType: string) {
  return mimeType === 'application/pdf' || isImageDocument(mimeType);
}

function documentStatusLabel(status: DocumentRecord['status']) {
  if (status === 'failed') return 'Extraction failed';
  if (status === 'ready') return 'Ready';
  return 'Processing';
}

function documentStatusColor(status: DocumentRecord['status']) {
  if (status === 'failed') return 'text-rose-600';
  if (status === 'ready') return 'text-emerald-600';
  return 'text-amber-600';
}

function documentFileUrl(documentId: string) {
  return `/api/backend/documents/${documentId}/file`;
}

export default function JobDocumentsView({ jobId }: { jobId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latestDocuments = useRef<EditableDocumentRecord[]>([]);
  const [dragging, setDragging] = useState(false);
  const [documents, setDocuments] = useState<EditableDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [viewerDocument, setViewerDocument] = useState<EditableDocumentRecord | null>(null);

  useEffect(() => {
    latestDocuments.current = documents;
  }, [documents]);

  useEffect(() => {
    if (!viewerDocument) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewerDocument(null);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [viewerDocument]);

  const hasProcessingDocuments = useMemo(
    () => documents.some(doc => doc.status === 'processing'),
    [documents],
  );

  const fetchDocuments = useCallback(async (showLoading: boolean) => {
    if (!jobId) return;
    if (showLoading) setLoading(true);

    try {
      const response = await fetch(`/api/backend/jobs/${jobId}/documents`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Could not load documents.');
      }

      const payload: ApiDocumentRecord[] = await response.json() as ApiDocumentRecord[];
      setDocuments(prev => mergeDocuments(prev, payload.map(mapApiDocument)));
      setPageError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load documents.';
      setPageError(message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void fetchDocuments(true);
  }, [fetchDocuments]);

  useEffect(() => {
    if (!hasProcessingDocuments) return;

    const interval = setInterval(() => {
      void fetchDocuments(false);
    }, 2500);

    return () => clearInterval(interval);
  }, [fetchDocuments, hasProcessingDocuments]);

  useEffect(() => () => {
    Object.values(saveTimers.current).forEach(timer => clearTimeout(timer));
  }, []);

  const persistDocument = useCallback(async (documentId: string) => {
    const current = latestDocuments.current.find(doc => doc.id === documentId);
    if (!current || documentId.startsWith('temp-')) return;

    setDocuments(prev => prev.map(doc =>
      doc.id === documentId
        ? { ...doc, isSaving: true, pendingSave: false, saveError: null }
        : doc,
    ));

    try {
      const response = await fetch(`/api/backend/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: current.title,
          communication_date: current.communicationDate || null,
          description: current.description,
          transcript: current.transcript,
        }),
      });

      if (!response.ok) {
        throw new Error('Could not save document.');
      }

      const updated = createLocalDocument(mapApiDocument(await response.json() as ApiDocumentRecord));
      setDocuments(prev => prev.map(doc =>
        doc.id === documentId
          ? { ...updated, isSaving: false, pendingSave: false, saveError: null }
          : doc,
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save document.';
      setDocuments(prev => prev.map(doc =>
        doc.id === documentId
          ? { ...doc, isSaving: false, pendingSave: false, saveError: message }
          : doc,
      ));
    }
  }, []);

  const scheduleSave = useCallback((documentId: string) => {
    const existingTimer = saveTimers.current[documentId];
    if (existingTimer) clearTimeout(existingTimer);

    saveTimers.current[documentId] = setTimeout(() => {
      void persistDocument(documentId);
      delete saveTimers.current[documentId];
    }, SAVE_DEBOUNCE_MS);
  }, [persistDocument]);

  const flushSave = useCallback((documentId: string) => {
    const existingTimer = saveTimers.current[documentId];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete saveTimers.current[documentId];
    }
    void persistDocument(documentId);
  }, [persistDocument]);

  const updateDocumentField = useCallback((documentId: string, field: EditableField, value: string) => {
    setDocuments(prev => prev.map(doc =>
      doc.id === documentId
        ? { ...doc, [field]: value, pendingSave: true, saveError: null }
        : doc,
    ));
    scheduleSave(documentId);
  }, [scheduleSave]);

  const uploadFile = useCallback(async (file: File) => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    setDocuments(prev => [
      {
        id: tempId,
        jobId,
        originalFilename: file.name,
        mimeType: file.type || 'application/octet-stream',
        storagePath: '',
        status: 'processing',
        title: fileTitleFallback(file.name),
        communicationDate: '',
        description: '',
        transcript: '',
        extractionError: null,
        createdAt: now,
        updatedAt: now,
        isSaving: false,
        pendingSave: false,
        saveError: null,
      },
      ...prev,
    ]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`/api/backend/jobs/${jobId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Could not upload document.');
      }

      const created = createLocalDocument(mapApiDocument(await response.json() as ApiDocumentRecord));
      setDocuments(prev => prev.map(doc => (doc.id === tempId ? created : doc)));
      setPageError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload document.';
      setDocuments(prev => prev.filter(doc => doc.id !== tempId));
      setPageError(message);
    }
  }, [jobId]);

  const addFiles = useCallback(async (incoming: FileList | null) => {
    if (!incoming || !jobId) return;
    setUploading(true);
    await Promise.all(Array.from(incoming).map(uploadFile));
    setUploading(false);
  }, [jobId, uploadFile]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  }, [addFiles]);

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  return (
    <>
      <div className="flex flex-col h-full p-6" style={{ minHeight: 'calc(100vh - 64px)' }}>
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
            disabled={uploading}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
          >
            {uploading ? 'Uploading...' : 'Browse'}
          </button>
          <p className="text-xs text-gray-400">PDF or images</p>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto space-y-3">
          {pageError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</p>
          )}
          {loading && documents.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Loading documents...</p>
          )}
          {!loading && documents.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No documents uploaded yet.</p>
          )}
          {documents.map(doc => (
            <div
              key={doc.id}
              className="grid overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.15fr)]"
            >
              <div className="flex min-h-[220px] flex-col justify-between bg-gray-100 px-4 py-4 text-center">
                <p className="truncate text-[11px] font-medium text-gray-500">{doc.originalFilename}</p>

                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4">
                  <svg className="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{documentKindLabel(doc.mimeType)}</p>
                    <p className={`text-xs font-medium ${documentStatusColor(doc.status)}`}>{documentStatusLabel(doc.status)}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewerDocument(doc)}
                  disabled={!canViewDocument(doc.mimeType)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  View
                </button>
              </div>

              <div className="border-t border-gray-100 p-4 lg:border-r lg:border-t-0">
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">Title</span>
                    <input
                      value={doc.title}
                      onChange={event => updateDocumentField(doc.id, 'title', event.target.value)}
                      onBlur={() => flushSave(doc.id)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
                    <input
                      type="date"
                      value={doc.communicationDate}
                      onChange={event => updateDocumentField(doc.id, 'communicationDate', event.target.value)}
                      onBlur={() => flushSave(doc.id)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">Description</span>
                    <textarea
                      value={doc.description}
                      onChange={event => updateDocumentField(doc.id, 'description', event.target.value)}
                      onBlur={() => flushSave(doc.id)}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa]"
                    />
                  </label>
                </div>
              </div>

              <div className="flex min-h-[220px] flex-col border-t border-gray-100 p-4 lg:border-t-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="block text-xs font-medium text-gray-500">Transcript</span>
                  <p className={`text-xs ${
                    doc.saveError ? 'text-rose-600' : doc.isSaving ? 'text-gray-500' : doc.pendingSave ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {doc.saveError ? doc.saveError : doc.isSaving ? 'Saving...' : doc.pendingSave ? 'Unsaved changes' : 'Saved'}
                  </p>
                </div>
                <textarea
                  value={doc.transcript}
                  onChange={event => updateDocumentField(doc.id, 'transcript', event.target.value)}
                  onBlur={() => flushSave(doc.id)}
                  rows={11}
                  className="mt-1 min-h-[172px] w-full flex-1 resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa]"
                />
                {doc.extractionError && (
                  <p className="mt-3 text-xs text-rose-600">{doc.extractionError}</p>
                )}
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
          onChange={event => { void addFiles(event.target.files); event.target.value = ''; }}
        />
      </div>

      {viewerDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6" onClick={() => setViewerDocument(null)}>
          <div
            className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{viewerDocument.originalFilename}</p>
                <p className="mt-1 text-xs text-gray-500">{viewerDocument.title || 'Document viewer'}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewerDocument(null)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-gray-950/95 p-4">
              {isImageDocument(viewerDocument.mimeType) ? (
                <img
                  src={documentFileUrl(viewerDocument.id)}
                  alt={viewerDocument.originalFilename}
                  className="mx-auto max-h-full max-w-full rounded-lg object-contain"
                />
              ) : (
                <iframe
                  title={viewerDocument.originalFilename}
                  src={documentFileUrl(viewerDocument.id)}
                  className="h-full w-full rounded-lg bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
