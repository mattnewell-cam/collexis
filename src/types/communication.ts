export type CommCategory =
  | 'due-date'
  | 'handover-letter'
  | 'chase'
  | 'conversation'
  | 'letter'
  | 'other';

export type ChaseSubtype =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'facebook'
  | 'voicemail'
  | 'home-visit';

export type ConversationSubtype =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'facebook'
  | 'phone'
  | 'in-person';

export type CommSubtype = ChaseSubtype | ConversationSubtype;

export type CommSender = 'you' | 'collexis';

export interface Communication {
  id: string;
  jobId: string;
  category: CommCategory;
  subtype?: CommSubtype;
  sender?: CommSender;
  date: string; // ISO date string
  shortDescription: string; // <10 words, displayed inline
  details: string; // free-text, can be lengthy
  linkedDocumentIds?: string[];
}
