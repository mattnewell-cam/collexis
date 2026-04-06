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

export type CommRecipient = 'debtor' | 'creditor' | 'collexis';

export interface Communication {
  id: string;
  jobId: string;
  category: CommCategory;
  subtype?: CommSubtype;
  sender?: CommSender;
  recipient?: CommRecipient;
  date: string; // ISO date string
  shortDescription: string; // <10 words, displayed inline
  details: string; // free-text, can be lengthy
  linkedDocumentIds?: string[];
}

export type DebtorResponseClassification =
  | 'refused-or-disputed'
  | 'agreed-with-deadline'
  | 'agreed-without-deadline'
  | 'cant-afford'
  | 'claims-paid'
  | 'unclear';

export type DebtorResponseAction =
  | 'suggest-handover'
  | 'set-deadline'
  | 'offer-payment-plan'
  | 'pause-until-deadline'
  | 'await-payment-confirmation'
  | 'replan'
  | 'none';

export interface DebtorResponseActionResult {
  classification: DebtorResponseClassification;
  action: DebtorResponseAction;
  statedDeadline: string | null;
  computedDeadline: string | null;
  hasMissedDeadlines: boolean;
  confidence: number;
  reasoning: string;
  userMessage: string;
}
