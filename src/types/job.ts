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
