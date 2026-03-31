'use client';

import type { ReactNode } from 'react';
import type { CommSender } from '@/types/communication';
import type { PostNowStepType } from '@/types/postNowPlan';
import { getSenderLabel } from './categoryConfig';

export interface PostNowStepDefinition {
  type: PostNowStepType;
  label: string;
  color: string;
  textClassName: string;
  dotClassName: string;
  timelineLabelLines?: string[];
  timelineBadgeClassName?: string;
}

export const POST_NOW_STEP_DEFINITIONS: PostNowStepDefinition[] = [
  {
    type: 'email',
    label: 'Email',
    color: 'bg-sky-100 text-sky-700',
    textClassName: 'text-sky-700',
    dotClassName: 'bg-sky-400',
  },
  {
    type: 'sms',
    label: 'SMS',
    color: 'bg-emerald-100 text-emerald-700',
    textClassName: 'text-emerald-700',
    dotClassName: 'bg-emerald-400',
  },
  {
    type: 'whatsapp',
    label: 'WhatsApp',
    color: 'bg-green-100 text-green-700',
    textClassName: 'text-green-700',
    dotClassName: 'bg-green-500',
  },
  {
    type: 'call',
    label: 'Call',
    color: 'bg-orange-100 text-orange-700',
    textClassName: 'text-orange-700',
    dotClassName: 'bg-orange-400',
  },
  {
    type: 'letter-warning',
    label: 'Warning Letter',
    color: 'bg-violet-100 text-violet-700',
    textClassName: 'text-violet-700',
    dotClassName: 'bg-violet-400',
    timelineLabelLines: ['Warning', 'Letter'],
    timelineBadgeClassName: 'min-w-[5.625rem]',
  },
  {
    type: 'letter-of-claim',
    label: 'Letter Of Claim',
    color: 'bg-fuchsia-100 text-fuchsia-700',
    textClassName: 'text-fuchsia-700',
    dotClassName: 'bg-fuchsia-400',
    timelineLabelLines: ['Letter Of', 'Claim'],
    timelineBadgeClassName: 'min-w-[5.625rem]',
  },
  {
    type: 'initiate-legal-action',
    label: 'Initiate Legal Action',
    color: 'bg-amber-100 text-amber-800',
    textClassName: 'text-amber-800',
    dotClassName: 'bg-amber-500',
    timelineLabelLines: ['Initiate', 'Legal Action'],
    timelineBadgeClassName: 'min-w-[6.5rem]',
  },
];

export function getPostNowStepDefinition(type: PostNowStepType) {
  return POST_NOW_STEP_DEFINITIONS.find(step => step.type === type)!;
}

export function PostNowStepCard({
  type,
  sender,
  compact = false,
  detail,
}: {
  type: PostNowStepType;
  sender?: CommSender;
  compact?: boolean;
  detail?: ReactNode;
}) {
  const definition = getPostNowStepDefinition(type);

  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className={`flex items-center ${compact ? 'gap-2' : 'gap-2.5'}`}>
        <div className={`shrink-0 rounded-full ${definition.dotClassName} ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} />
        <div className="min-w-0 flex flex-1 items-center">
          <p className={`truncate text-sm font-medium ${definition.textClassName}`}>
            {definition.label}
          </p>
          {!compact && sender ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {getSenderLabel(sender)}
            </span>
          ) : null}
        </div>
        {detail}
      </div>
    </div>
  );
}
