import { CommSender } from './communication';

export type PostNowStepKind =
  | 'email'
  | 'message'
  | 'letter'
  | 'legal-escalation';

export interface PostNowStep {
  id: string;
  kind: PostNowStepKind;
  sender: CommSender;
  delayDays: number;
}
