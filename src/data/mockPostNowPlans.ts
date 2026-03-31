import type { PostNowStep } from '@/types/postNowPlan';

function atLocalTime(baseDate: Date, dayOffset: number, hour: number, minute: number) {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + dayOffset);
  nextDate.setHours(hour, minute, 0, 0);
  return nextDate.toISOString();
}

const mockPostNowPlanTemplates: Record<string, (Omit<PostNowStep, 'scheduledFor'> & { dayOffset: number; hour: number; minute: number })[]> = {
  '1': [
    { id: 'p1-1', type: 'sms', sender: 'collexis', headline: 'SMS for insurer update', dayOffset: 1, hour: 10, minute: 15 },
    { id: 'p1-2', type: 'call', sender: 'collexis', headline: 'Morning call for payment update', dayOffset: 2, hour: 9, minute: 30 },
    { id: 'p1-3', type: 'letter-warning', sender: 'collexis', headline: 'Final warning before legal action', dayOffset: 14, hour: 9, minute: 0 },
  ],
  '2': [
    { id: 'p2-1', type: 'email', sender: 'you', headline: 'Email on signed quote dispute', dayOffset: 1, hour: 11, minute: 0 },
    { id: 'p2-2', type: 'letter-of-claim', sender: 'you', headline: 'Formal letter of claim', dayOffset: 7, hour: 9, minute: 0 },
  ],
  '3': [
    { id: 'p3-1', type: 'email', sender: 'you', headline: 'Friendly email reminder', dayOffset: 1, hour: 11, minute: 0 },
    { id: 'p3-2', type: 'call', sender: 'you', headline: 'Call for balance update', dayOffset: 3, hour: 14, minute: 0 },
  ],
};

export function clonePostNowPlans() {
  const today = new Date();

  return Object.fromEntries(
    Object.entries(mockPostNowPlanTemplates).map(([jobId, steps]) => ([
      jobId,
      steps.map(step => ({
        id: step.id,
        type: step.type,
        sender: step.sender,
        headline: step.headline,
        scheduledFor: atLocalTime(today, step.dayOffset, step.hour, step.minute),
      })),
    ])),
  );
}
