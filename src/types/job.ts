export interface Job {
  id: string;
  address: string;
  jobDescription: string;
  name: string;
  price: number;
  daysOverdue: number;
  emails: string[];
  phones: string[];
  invoiceDocuments: string[];
  contextInstructions: string;
}
