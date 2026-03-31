import { CommSender } from './communication';

export type PostNowStepType =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'call'
  | 'letter-warning'
  | 'letter-of-claim'
  | 'initiate-legal-action';

export interface PostNowDraft {
  id: string;
  planStepId: string;
  subject?: string;
  body: string;
  isUserEdited: boolean;
}

export interface PostNowStep {
  id: string;
  type: PostNowStepType;
  sender: CommSender;
  headline: string;
  scheduledFor: string;
  draft?: PostNowDraft;
}
