'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CommSender } from '@/types/communication';
import { PostNowStep, PostNowStepKind } from '@/types/postNowPlan';
import { getSenderLabel } from './categoryConfig';

export interface PostNowStepDefinition {
  kind: PostNowStepKind;
  label: string;
  color: string;
  textClassName: string;
  dotClassName: string;
  timelineLabelLines?: string[];
  timelineBadgeClassName?: string;
}

export type PostNowDragData =
  | { source: 'palette'; kind: PostNowStepKind }
  | { source: 'timeline'; stepId: string; kind: PostNowStepKind };

export const POST_NOW_DROPZONE_ID = 'post-now-dropzone';

export const POST_NOW_STEP_DEFINITIONS: PostNowStepDefinition[] = [
  {
    kind: 'email',
    label: 'Email',
    color: 'bg-sky-100 text-sky-700',
    textClassName: 'text-sky-700',
    dotClassName: 'bg-sky-400',
  },
  {
    kind: 'message',
    label: 'Message',
    color: 'bg-emerald-100 text-emerald-700',
    textClassName: 'text-emerald-700',
    dotClassName: 'bg-emerald-400',
  },
  {
    kind: 'letter',
    label: 'Letter',
    color: 'bg-violet-100 text-violet-700',
    textClassName: 'text-violet-700',
    dotClassName: 'bg-violet-400',
  },
  {
    kind: 'legal-escalation',
    label: 'Legal Escalation',
    color: 'bg-amber-100 text-amber-800',
    textClassName: 'text-amber-800',
    dotClassName: 'bg-amber-500',
    timelineLabelLines: ['Legal', 'Escalation'],
    timelineBadgeClassName: 'min-w-[5.625rem]',
  },
];

export function getPostNowStepDefinition(kind: PostNowStepKind) {
  return POST_NOW_STEP_DEFINITIONS.find(step => step.kind === kind)!;
}

export function getDefaultPostNowDelay(kind: PostNowStepKind) {
  switch (kind) {
    case 'message':
      return 1;
    case 'email':
      return 3;
    case 'letter':
      return 7;
    case 'legal-escalation':
      return 14;
    default:
      return 3;
  }
}

export function buildPostNowStep(
  kind: PostNowStepKind,
  sender: CommSender = 'you',
): PostNowStep {
  return {
    id: crypto.randomUUID(),
    kind,
    sender,
    delayDays: getDefaultPostNowDelay(kind),
  };
}

export function clampPostNowDelay(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(365, Math.max(0, value));
}

export function PostNowDragGrip({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-lg p-1.5 transition-colors hover:bg-gray-100 ${className ?? ''}`}
      aria-label="Drag step"
      {...props}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.5" />
        <circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" />
        <circle cx="15" cy="18" r="1.5" />
      </svg>
    </button>
  );
}

export function PostNowStepCard({
  kind,
  sender,
  compact = false,
  dragHandle,
}: {
  kind: PostNowStepKind;
  sender?: CommSender;
  compact?: boolean;
  dragHandle?: ReactNode;
}) {
  const definition = getPostNowStepDefinition(kind);

  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className={`flex items-center ${compact ? 'gap-2' : 'gap-2.5'}`}>
        <div className={`shrink-0 rounded-full ${definition.dotClassName} ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} />
        <div className="min-w-0 flex flex-1 items-center">
          <p className={`truncate text-sm font-medium ${definition.textClassName}`}>
            {definition.label}
          </p>
          {!compact && sender && (
            <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {getSenderLabel(sender)}
            </span>
          )}
        </div>
        {dragHandle}
      </div>
    </div>
  );
}
