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
  responseClassification?: DebtorResponseClassification;
  responseAction?: DebtorResponseAction;
  statedDeadline?: string | null;
  computedDeadline?: string | null;
}

export type DebtorResponseClassification =
  | 'dispute'
  | 'refusal'
  | 'agreed-with-deadline'
  | 'agreed-without-deadline'
  | 'cant-afford'
  | 'claims-paid'
  | 'unclear';

export type DebtorResponseAction =
  | 'await-payment-confirmation'
  | 'auto-check-payment'
  | 'pause-until-deadline'
  | 'negotiate'
  | 'set-deadline'
  | 'ask-for-timeline'
  | 'threaten-deadline'
  | 'demand-evidence'
  | 'suggest-handover'
  | 'go-legal'
  | 'continue-legal'
  | 'replan'
  | 'none';

export type DebtRecoveryPhase = 'friendly' | 'post-handover' | 'post-loa';

export interface DebtorResponseActionResult {
  classification: DebtorResponseClassification;
  action: DebtorResponseAction;
  phase: DebtRecoveryPhase;
  statedDeadline: string | null;
  computedDeadline: string | null;
  hasMissedDeadlines: boolean;
  isFirstOffence: boolean;
  confidence: number;
  reasoning: string;
  userMessage: string;
  guidanceNotes: string;
}
