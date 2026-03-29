import { PostNowStep } from '@/types/postNowPlan';

export const mockPostNowPlans: Record<string, PostNowStep[]> = {
  '1': [
    { id: 'p1-1', kind: 'email', sender: 'collexis', delayDays: 2 },
    { id: 'p1-2', kind: 'message', sender: 'collexis', delayDays: 3 },
    { id: 'p1-3', kind: 'letter', sender: 'collexis', delayDays: 7 },
    { id: 'p1-4', kind: 'legal-escalation', sender: 'collexis', delayDays: 14 },
  ],
  '2': [
    { id: 'p2-1', kind: 'email', sender: 'you', delayDays: 3 },
    { id: 'p2-2', kind: 'legal-escalation', sender: 'you', delayDays: 10 },
  ],
  '3': [
    { id: 'p3-1', kind: 'message', sender: 'you', delayDays: 2 },
    { id: 'p3-2', kind: 'email', sender: 'you', delayDays: 5 },
  ],
};

export function clonePostNowPlans() {
  return Object.fromEntries(
    Object.entries(mockPostNowPlans).map(([jobId, steps]) => [
      jobId,
      steps.map(step => ({ ...step })),
    ]),
  );
}
