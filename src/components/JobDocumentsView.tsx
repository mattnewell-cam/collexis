'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJobRouteCache } from '@/components/JobRouteCacheProvider';
import { documentBackendPath } from '@/lib/documentBackend';
import { applyReviewedJobIntakeSummary } from '@/lib/jobStore';
import { runClientAction, type ClientActionTrace } from '@/lib/logging/client';
import { loggedFetch } from '@/lib/logging/fetch';
import { toUserFacingErrorMessage } from '@/lib/userFacingError';
import type { DocumentRecord } from '@/types/document';
import type { Job, JobIntakeSummary } from '@/types/job';

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

type ApiJobIntakeReviewRequest = {
  current_job: {
    name: string;
    address: string;
    job_description: string;
    job_detail: string;
    due_date: string | null;
    price: number | null;
    amount_paid: number | null;
    emails: string[];
    phones: string[];
    context_instructions: string;
  };
  document_ids: string[];
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

function createIntakeReviewRequest(job: Job, documentIds: string[]): ApiJobIntakeReviewRequest {
  return {
    current_job: {
      name: job.name,
      address: job.address,
      job_description: job.jobDescription,
      job_detail: job.jobDetail,
      due_date: job.dueDate || null,
      price: Number.isFinite(job.price) ? job.price : null,
      amount_paid: Number.isFinite(job.amountPaid) ? job.amountPaid : null,
      emails: job.emails,
      phones: job.phones,
      context_instructions: job.contextInstructions,
    },
    document_ids: documentIds,
  };
}

function serializeEditableDocument(document: EditableDocumentRecord): DocumentRecord {
  return {
    id: document.id,
    jobId: document.jobId,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    storagePath: document.storagePath,
    status: document.status,
    title: document.title,
    communicationDate: document.communicationDate,
    description: document.description,
    transcript: document.transcript,
    extractionError: document.extractionError,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
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
  return documentBackendPath(`/documents/${documentId}/file`);
}

function displayExtractionError(message: string | null) {
  if (!message) {
    return null;
  }

  return toUserFacingErrorMessage(
    message,
    'We could not add this document to the timeline automatically. Please review it manually or try uploading it again.',
  );
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function jobChanged(current: Job, next: Job) {
  return current.jobDescription !== next.jobDescription
    || current.jobDetail !== next.jobDetail
    || current.dueDate !== next.dueDate
    || current.price !== next.price
    || current.amountPaid !== next.amountPaid
    || current.daysOverdue !== next.daysOverdue
    || current.contextInstructions !== next.contextInstructions
    || JSON.stringify(current.emails) !== JSON.stringify(next.emails)
    || JSON.stringify(current.phones) !== JSON.stringify(next.phones);
}

export default function JobDocumentsView({ jobId }: { jobId: string }) {
  const { job, setJob, documents: cachedDocuments, setDocuments: setCachedDocuments } = useJobRouteCache();
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latestDocuments = useRef<EditableDocumentRecord[]>([]);
  const latestJob = useRef(job);
  const documentsFetchRef = useRef<Promise<void> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [documents, setDocuments] = useState<EditableDocumentRecord[]>(() =>
    cachedDocuments.loaded ? cachedDocuments.data.map(createLocalDocument) : [],
  );
  const [loading, setLoading] = useState(!cachedDocuments.loaded);
  const [uploading, setUploading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [viewerDocument, setViewerDocument] = useState<EditableDocumentRecord | null>(null);
  const [viewerImageStatus, setViewerImageStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    latestDocuments.current = documents;
  }, [documents]);

  useEffect(() => {
    latestJob.current = job;
  }, [job]);

  useEffect(() => {
    if (!viewerDocument) {
      setViewerImageStatus('idle');
      return;
    }

    setViewerImageStatus(isImageDocument(viewerDocument.mimeType) ? 'loading' : 'ready');
  }, [viewerDocument]);

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
  const viewerIsImage = viewerDocument ? isImageDocument(viewerDocument.mimeType) : false;

  const fetchDocuments = useCallback(async (showLoading: boolean) => {
    if (!jobId) return;
    if (documentsFetchRef.current) {
      return documentsFetchRef.current;
    }

    const request = (async () => {
      if (showLoading) setLoading(true);

      try {
        const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/documents`), { cache: 'no-store' }, {
          name: 'documents.fetch_view',
          context: { jobId, showLoading },
        });
        if (!response.ok) {
          throw new Error('Could not load documents.');
        }

        const payload: ApiDocumentRecord[] = await response.json() as ApiDocumentRecord[];
        const nextDocuments = payload.map(mapApiDocument);
        setDocuments(prev => mergeDocuments(prev, nextDocuments));
        setCachedDocuments(nextDocuments);
        setPageError(null);
      } catch (error) {
        const message = toUserFacingErrorMessage(error, 'Could not load documents.');
        setPageError(message);
      } finally {
        if (showLoading) setLoading(false);
      }
    })();

    documentsFetchRef.current = request.finally(() => {
      if (documentsFetchRef.current === request) {
        documentsFetchRef.current = null;
      }
    });

    return documentsFetchRef.current;
  }, [jobId, setCachedDocuments]);

  useEffect(() => {
    if (cachedDocuments.loaded) {
      setLoading(false);
      return;
    }

    void fetchDocuments(true);
  }, [cachedDocuments.loaded, fetchDocuments]);

  useEffect(() => {
    if (!hasProcessingDocuments) return;

    const interval = setInterval(() => {
      void fetchDocuments(false);
    }, 2500);

    return () => clearInterval(interval);
  }, [fetchDocuments, hasProcessingDocuments]);

  useEffect(() => () => {
    Object.values(saveTimers.current).forEach(timer => clearTimeout(timer));
  }, [jobId]);

  useEffect(() => {
    if (!cachedDocuments.loaded && documents.length === 0) return;
    setCachedDocuments(documents.map(serializeEditableDocument));
  }, [cachedDocuments.loaded, documents, setCachedDocuments]);

  const persistDocument = useCallback(async (documentId: string) => {
    const current = latestDocuments.current.find(doc => doc.id === documentId);
    if (!current || documentId.startsWith('temp-')) return;

    setDocuments(prev => prev.map(doc =>
      doc.id === documentId
        ? { ...doc, isSaving: true, pendingSave: false, saveError: null }
        : doc,
    ));

    try {
      const response = await loggedFetch(documentBackendPath(`/documents/${documentId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: current.title,
          communication_date: current.communicationDate || null,
          description: current.description,
          transcript: current.transcript,
        }),
      }, {
        name: 'documents.save_metadata',
        context: {
          jobId,
          documentId,
        },
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
      const message = toUserFacingErrorMessage(error, 'Could not save document.');
      setDocuments(prev => prev.map(doc =>
        doc.id === documentId
          ? { ...doc, isSaving: false, pendingSave: false, saveError: message }
          : doc,
      ));
    }
  }, [jobId]);

  const waitForDocumentsToSettle = useCallback(async (documentIds: string[], trace?: ClientActionTrace) => {
    if (documentIds.length === 0 || !jobId) return;

    while (true) {
      const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/documents`), { cache: 'no-store' }, {
        name: 'documents.poll_processing_status',
        context: {
          jobId,
          documentCount: documentIds.length,
        },
        trace,
      });

      if (!response.ok) {
        throw new Error('Could not check document processing.');
      }

      const payload: ApiDocumentRecord[] = await response.json() as ApiDocumentRecord[];
      const nextDocuments = payload.map(mapApiDocument);
      const trackedDocuments = nextDocuments.filter(document => documentIds.includes(document.id));
      const pendingDocuments = trackedDocuments.some(document => document.status === 'processing') || trackedDocuments.length < documentIds.length;

      setDocuments(prev => mergeDocuments(prev, nextDocuments));
      setCachedDocuments(nextDocuments);

      if (!pendingDocuments) {
        return;
      }

      await sleep(1500);
    }
  }, [jobId, setCachedDocuments]);

  const syncJobFromProcessedDocuments = useCallback(async (documentIds: string[], trace?: ClientActionTrace) => {
    if (!jobId || documentIds.length === 0) return;

    await waitForDocumentsToSettle(documentIds, trace);

    const summaryResponse = await loggedFetch(documentBackendPath(`/jobs/${jobId}/intake-summary/review`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createIntakeReviewRequest(latestJob.current, documentIds)),
      cache: 'no-store',
    }, {
      name: 'jobs.fetch_intake_summary',
      context: {
        jobId,
        documentCount: documentIds.length,
      },
      trace,
    });

    if (!summaryResponse.ok) {
      throw new Error('Could not refresh the job details from the uploaded documents.');
    }

    const summary = mapApiJobIntakeSummary(await summaryResponse.json() as ApiJobIntakeSummary);
    const refreshedJob = applyReviewedJobIntakeSummary(latestJob.current, summary);

    if (!jobChanged(latestJob.current, refreshedJob)) {
      return;
    }

    const persistResponse = await loggedFetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(refreshedJob),
    }, {
      name: 'jobs.persist_processed_details',
      context: {
        jobId,
        documentCount: documentIds.length,
      },
      trace,
    });

    if (!persistResponse.ok) {
      throw new Error('Could not save the refreshed job details.');
    }

    const payload = await persistResponse.json() as { job: Job };
    setJob(payload.job);
  }, [jobId, setJob, waitForDocumentsToSettle]);

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

  const uploadFile = useCallback(async (file: File, trace?: ClientActionTrace) => {
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
    formData.append('processing_profile', 'job-intake');

    try {
      const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/documents`), {
        method: 'POST',
        body: formData,
      }, {
        name: 'documents.upload_from_view',
        context: {
          jobId,
          fileSize: file.size,
          mimeType: file.type || null,
        },
        trace,
      });

      if (!response.ok) {
        throw new Error('Could not upload document.');
      }

      const created = createLocalDocument(mapApiDocument(await response.json() as ApiDocumentRecord));
      setDocuments(prev => prev.map(doc => (doc.id === tempId ? created : doc)));
      setPageError(null);
      return created;
    } catch (error) {
      const message = toUserFacingErrorMessage(error, 'Could not upload document.');
      setDocuments(prev => prev.filter(doc => doc.id !== tempId));
      setPageError(message);
      throw new Error(message);
    }
  }, [jobId]);

  const addFiles = useCallback(async (incoming: FileList | null) => {
    if (!incoming || !jobId) return;
    setUploading(true);
    try {
      await runClientAction('documents.upload_from_documents_view', async trace => {
        const results = await Promise.allSettled(Array.from(incoming).map(file => uploadFile(file, trace)));
        const uploadedDocumentIds = results
          .filter((result): result is PromiseFulfilledResult<EditableDocumentRecord> => result.status === 'fulfilled')
          .map(result => result.value.id)
          .filter(documentId => !documentId.startsWith('temp-'));

        if (uploadedDocumentIds.length > 0) {
          await syncJobFromProcessedDocuments(uploadedDocumentIds, trace);
        }

        const firstRejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (firstRejected) {
          throw firstRejected.reason instanceof Error
            ? firstRejected.reason
            : new Error('Could not upload document.');
        }
      }, {
        jobId,
        fileCount: incoming.length,
      });
      setPageError(null);
    } catch (error) {
      setPageError(toUserFacingErrorMessage(
        error,
        'Uploaded documents could not refresh the job details automatically. Please review the details page manually.',
      ));
    } finally {
      setUploading(false);
    }
  }, [jobId, syncJobFromProcessedDocuments, uploadFile]);

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
          {documents.map(doc => {
            const extractionErrorMessage = displayExtractionError(doc.extractionError);

            return (
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
                {extractionErrorMessage && (
                  <p className="mt-3 text-xs text-rose-600">{extractionErrorMessage}</p>
                )}
              </div>
            </div>
            );
          })}
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
              {viewerIsImage ? (
                <div className="flex min-h-full items-center justify-center">
                  <div className="relative flex min-h-[240px] w-full items-center justify-center rounded-2xl bg-white px-4 py-5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.75)]">
                    {viewerImageStatus === 'loading' ? (
                      <p className="text-sm font-medium text-gray-500">Loading preview...</p>
                    ) : null}
                    {viewerImageStatus === 'error' ? (
                      <p className="max-w-sm text-center text-sm text-gray-500">
                        Could not load this image preview. Close the viewer and try again.
                      </p>
                    ) : null}
                    <img
                      src={documentFileUrl(viewerDocument.id)}
                      alt={viewerDocument.originalFilename}
                      onLoad={() => setViewerImageStatus('ready')}
                      onError={() => setViewerImageStatus('error')}
                      className={`max-h-[calc(88vh-10rem)] max-w-full rounded-xl object-contain transition-opacity ${
                        viewerImageStatus === 'ready' ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </div>
                </div>
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
