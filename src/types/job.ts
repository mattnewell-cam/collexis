export type JobStatus =
  | 'Initial wait'
  | 'Polite chase'
  | 'Stern chase'
  | 'Letter of Action sent'
  | 'Awaiting judgment'
  | 'Judgment granted'
  | 'Paid'
  | 'Abandoned';

export interface Job {
  id: string;
  address: string;
  jobDescription: string;
  jobDetail: string;
  dueDate: string;
  name: string;
  price: number;
  amountPaid: number;
  daysOverdue: number;
  status: JobStatus;
  emails: string[];
  phones: string[];
  invoiceDocuments: string[];
  contextInstructions: string;
}

export interface JobIntakeSummary {
  jobDescription: string;
  jobDetail: string;
  dueDate: string | null;
  price: number | null;
  amountPaid: number | null;
  emails: string[];
  phones: string[];
  contextInstructions: string;
}

export type JobUpdatePayload = Partial<Omit<Job, 'id'>>;

export type JobProcessingNotice = 'docs-processed' | 'timeline-review';
