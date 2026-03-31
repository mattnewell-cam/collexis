'use client';

import { useState } from 'react';
import { getSenderLabel } from './categoryConfig';
import { getPostNowStepDefinition } from './postNowPlannerConfig';
import type { PostNowDraft, PostNowStep } from '@/types/postNowPlan';

interface Props {
  steps: PostNowStep[];
  loading?: boolean;
  savingDraftId?: string | null;
  onSaveDraft?: (draftId: string, payload: { subject?: string; body: string }) => Promise<PostNowDraft>;
}

const stepDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatScheduledFor(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return stepDateFormatter.format(parsed);
}

function draftBodyLabel(stepType: PostNowStep['type']) {
  if (stepType === 'email') return 'Email body';
  if (stepType === 'call') return 'Call script';
  if (stepType.includes('letter')) return 'Letter text';
  return 'Message';
}

function StepDraftDetail({
  step,
  saving,
  onSaveDraft,
}: {
  step: PostNowStep;
  saving: boolean;
  onSaveDraft?: (draftId: string, payload: { subject?: string; body: string }) => Promise<PostNowDraft>;
}) {
  const draft = step.draft;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  if (!draft) {
    return null;
  }

  const isEmailDraft = step.type === 'email';

  const handleSave = async () => {
    if (!onSaveDraft) return;

    try {
      await onSaveDraft(draft.id, {
        subject: isEmailDraft ? subject.trim() : undefined,
        body,
      });
      setEditing(false);
    } catch {
      // The parent view already surfaces the error state.
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setExpanded(current => !current);
            if (expanded) setEditing(false);
          }}
          className="text-xs text-[#1e9bb8] transition-opacity hover:opacity-80"
        >
          {expanded ? 'Hide draft' : 'Review draft'}
        </button>
        {draft.isUserEdited ? (
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700">
            Edited
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-2 rounded-lg bg-gray-50 p-3">
          {editing ? (
            <div className="space-y-3">
              {isEmailDraft ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Subject</label>
                  <input
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa]"
                    value={subject}
                    onChange={event => setSubject(event.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">
                  {draftBodyLabel(step.type)}
                </label>
                <textarea
                  className="min-h-[180px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa]"
                  value={body}
                  onChange={event => setBody(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void handleSave(); }}
                  disabled={saving}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
                >
                  {saving ? 'Saving...' : 'Save draft'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubject(draft.subject ?? '');
                    setBody(draft.body);
                    setEditing(false);
                  }}
                  disabled={saving}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {draft.subject ? (
                <div>
                  <div className="text-xs font-medium text-gray-500">Subject</div>
                  <p className="mt-1 text-sm font-medium text-gray-800">{draft.subject}</p>
                </div>
              ) : null}
              <div>
                <div className="text-xs font-medium text-gray-500">
                  {draftBodyLabel(step.type)}
                </div>
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-sm leading-relaxed text-gray-700">
                  {draft.body}
                </pre>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubject(draft.subject ?? '');
                  setBody(draft.body);
                  setEditing(true);
                }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
              >
                Edit draft
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function PostNowTimeline({
  steps,
  loading = false,
  savingDraftId = null,
  onSaveDraft,
}: Props) {
  if (loading) {
    return (
      <div className="flex py-3">
        <div className="w-8 shrink-0" />
        <div className="relative w-32 shrink-0 self-stretch">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-gray-200" />
        </div>
        <div className="min-w-0 flex-1 py-4 pl-3 text-sm text-gray-400">
          Loading outreach plan...
        </div>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="flex py-3">
        <div className="w-8 shrink-0" />
        <div className="relative w-32 shrink-0 self-stretch">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-gray-200" />
        </div>
        <div className="min-w-0 flex-1 py-4 pl-3 text-sm text-gray-400">
          Generate a plan to schedule the next outreach steps.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {steps.map(step => {
        const definition = getPostNowStepDefinition(step.type);
        const timelineLabelLines = definition.timelineLabelLines ?? [definition.label];
        const senderLabel = getSenderLabel(step.sender);

        return (
          <div key={step.id} className="flex">
            <div className="w-8 shrink-0" />
            <div className="relative w-32 shrink-0 self-stretch">
              <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-px bg-gray-200" />
              <div className="absolute inset-0 z-10 grid place-items-center">
                <span className={`inline-grid justify-items-center gap-0.5 rounded-full px-2.5 py-1 text-center text-sm font-medium leading-tight ${definition.timelineBadgeClassName ?? ''} ${definition.color}`}>
                  {timelineLabelLines.map(line => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1 py-3 pl-3">
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">
                    {formatScheduledFor(step.scheduledFor)}
                  </span>
                  <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                    {senderLabel}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900">{step.headline}</p>
                <StepDraftDetail
                  step={step}
                  saving={savingDraftId === step.draft?.id}
                  onSaveDraft={onSaveDraft}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
