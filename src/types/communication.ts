export type CommCategory =
  | 'due-date'
  | 'collexis-handover'
  | 'chase'
  | 'conversation'
  | 'letter'
  | 'other';

export type ChaseSubtype =
  | 'email'
  | 'text'
  | 'whatsapp'
  | 'facebook'
  | 'voicemail'
  | 'home-visit';

export type ConversationSubtype =
  | 'email'
  | 'text'
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
}
