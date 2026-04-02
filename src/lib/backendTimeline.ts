import type { Communication } from '@/types/communication';
import { normalizeCommunicationDate } from './communicationDates';
import { documentBackendPath } from './documentBackend';
import { loggedFetch } from './logging/fetch';
import type { TraceContext } from './logging/shared';

export type ApiTimelineItem = {
  id: string;
  job_id: string;
  category: Communication['category'];
  subtype: Communication['subtype'] | 'text' | null;
  sender: Communication['sender'] | null;
  date: string;
  short_description: string;
  details: string;
  linked_document_ids: string[];
  created_at: string;
  updated_at: string;
};

function ensureResponseOk(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
}

export function mapApiTimelineItem(item: ApiTimelineItem): Communication {
  return {
    id: item.id,
    jobId: item.job_id,
    category: item.category,
    subtype: item.subtype === 'text' ? 'sms' : item.subtype ?? undefined,
    sender: item.sender ?? undefined,
    date: normalizeCommunicationDate(item.date),
    shortDescription: item.short_description,
    details: item.details,
    linkedDocumentIds: item.linked_document_ids,
  };
}

function toApiPayload(comm: Communication) {
  return {
    category: comm.category,
    subtype: comm.subtype ?? null,
    sender: comm.sender ?? null,
    date: comm.date,
    short_description: comm.shortDescription,
    details: comm.details,
  };
}

export async function fetchTimelineItems(jobId: string, trace?: TraceContext): Promise<Communication[]> {
  const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/timeline-items`), {
    cache: 'no-store',
  }, {
    name: 'timeline.fetch',
    context: { jobId },
    trace,
  });
  ensureResponseOk(response, 'Could not load timeline items.');
  const payload = await response.json() as ApiTimelineItem[];
  return payload.map(mapApiTimelineItem);
}

export async function createTimelineItem(jobId: string, comm: Communication, trace?: TraceContext): Promise<Communication> {
  const response = await loggedFetch(documentBackendPath(`/jobs/${jobId}/timeline-items`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApiPayload(comm)),
  }, {
    name: 'timeline.create',
    context: { jobId, category: comm.category, subtype: comm.subtype ?? null },
    trace,
  });
  ensureResponseOk(response, 'Could not create timeline item.');
  return mapApiTimelineItem(await response.json() as ApiTimelineItem);
}

export async function updateTimelineItem(comm: Communication, trace?: TraceContext): Promise<Communication> {
  const response = await loggedFetch(documentBackendPath(`/timeline-items/${comm.id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApiPayload(comm)),
  }, {
    name: 'timeline.update',
    context: { timelineItemId: comm.id, jobId: comm.jobId, category: comm.category, subtype: comm.subtype ?? null },
    trace,
  });
  ensureResponseOk(response, 'Could not save timeline item.');
  return mapApiTimelineItem(await response.json() as ApiTimelineItem);
}

export async function linkDocumentToTimelineItem(
  timelineItemId: string,
  documentId: string,
  trace?: TraceContext,
): Promise<Communication> {
  const response = await loggedFetch(documentBackendPath(`/timeline-items/${timelineItemId}/documents/${documentId}`), {
    method: 'POST',
  }, {
    name: 'timeline.link_document',
    context: { timelineItemId, documentId },
    trace,
  });
  ensureResponseOk(response, 'Could not relate document.');
  return mapApiTimelineItem(await response.json() as ApiTimelineItem);
}

export async function deleteTimelineItem(timelineItemId: string, trace?: TraceContext): Promise<void> {
  const response = await loggedFetch(documentBackendPath(`/timeline-items/${timelineItemId}`), {
    method: 'DELETE',
  }, {
    name: 'timeline.delete',
    context: { timelineItemId },
    trace,
  });
  ensureResponseOk(response, 'Could not delete timeline item.');
}
