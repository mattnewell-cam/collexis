export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface DocumentRecord {
  id: string;
  jobId: string;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  status: DocumentStatus;
  title: string;
  communicationDate: string;
  description: string;
  transcript: string;
  extractionError: string | null;
  linkedTimelineItemIds?: string[];
  createdAt: string;
  updatedAt: string;
}
