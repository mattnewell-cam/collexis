import type { DocumentRecord } from '@/types/document';
import { documentBackendPath } from './documentBackend';
import { loggedFetch } from './logging/fetch';
import type { TraceContext } from './logging/shared';

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
  linked_timeline_item_ids: string[];
  created_at: string;
  updated_at: string;
};

function ensureResponseOk(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
}

export function mapApiDocument(document: ApiDocumentRecord): DocumentRecord {
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
    linkedTimelineItemIds: document.linked_timeline_item_ids,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

export async function fetchJobDocuments(jobId: string, trace?: TraceContext): Promise<DocumentRecord[]> {
  const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/documents`), { cache: 'no-store' }, {
    name: 'documents.fetch',
    context: { jobId },
    trace,
  });
  ensureResponseOk(response, 'Could not load documents.');
  const payload = await response.json() as ApiDocumentRecord[];
  return payload.map(mapApiDocument);
}

export async function uploadJobDocument(
  jobId: string,
  file: File,
  timelineItemId?: string,
  trace?: TraceContext,
): Promise<DocumentRecord> {
  const formData = new FormData();
  formData.append('file', file);
  if (timelineItemId) {
    formData.append('timeline_item_id', timelineItemId);
  }

  const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/documents`), {
    method: 'POST',
    body: formData,
  }, {
    name: 'documents.upload',
    context: {
      jobId,
      timelineItemId: timelineItemId ?? null,
      fileSize: file.size,
      mimeType: file.type || null,
    },
    trace,
  });
  ensureResponseOk(response, 'Could not upload document.');
  return mapApiDocument(await response.json() as ApiDocumentRecord);
}
