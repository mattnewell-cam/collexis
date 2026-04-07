'use client';

import { useState } from 'react';
import { runClientAction } from '@/lib/logging/client';
import { normalizeCommunicationDate } from '@/lib/communicationDates';
import { generateTimelineShortDescription } from '@/lib/backendTimeline';
import type { Communication, CommSubtype } from '@/types/communication';
import type { Job } from '@/types/job';
import { getSubtypeLabel } from './categoryConfig';

interface Props {
  job: Job;
  editing: Communication | null;
  onSave: (comm: Communication) => Promise<void>;
  onCancelEdit: () => void;
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors';

const manualMediums: CommSubtype[] = [
  'email',
  'sms',
  'whatsapp',
  'facebook',
  'voicemail',
  'home-visit',
  'phone',
  'in-person',
];

const today = new Date().toISOString().slice(0, 10);

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function defaultSubtype(editing: Communication | null): CommSubtype | '' {
  return editing?.subtype && manualMediums.includes(editing.subtype) ? editing.subtype : '';
}

function communicationCategory(subtype: CommSubtype) {
  return subtype === 'phone' || subtype === 'in-person' ? 'conversation' : 'chase';
}

export default function CommForm({
  job,
  editing,
  onSave,
  onCancelEdit,
}: Props) {
  const isEditing = editing !== null;
  const [subtype, setSubtype] = useState<CommSubtype | ''>(defaultSubtype(editing));
  const [date, setDate] = useState(editing ? normalizeCommunicationDate(editing.date) : today);
  const [details, setDetails] = useState(editing?.details ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const canSave = Boolean(subtype && date && details.trim());

  const resetComposer = () => {
    setSubtype('');
    setDate(today);
    setDetails('');
    setSaveError('');
  };

  const handleSave = async () => {
    if (!subtype || !details.trim()) return;

    setIsSaving(true);
    setSaveError('');

    try {
      const shortDescription = await runClientAction(
        'communications.generate_short_description',
        trace => generateTimelineShortDescription(job.id, {
          details: details.trim(),
          subtype,
        }, trace),
        {
          jobId: job.id,
          subtype,
          detailsLength: details.trim().length,
        },
      );

      await onSave({
        id: editing?.id ?? crypto.randomUUID(),
        jobId: editing?.jobId ?? job.id,
        category: communicationCategory(subtype),
        subtype,
        sender: 'you',
        recipient: 'debtor',
        date,
        shortDescription,
        details: details.trim(),
        linkedDocumentIds: editing?.linkedDocumentIds ?? [],
      });

      if (!isEditing) {
        resetComposer();
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save communication.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex min-h-[72px] items-center justify-between px-5">
        <h3 className="text-sm font-semibold text-gray-900">
          {isEditing ? 'Edit Communication' : 'Add Communication'}
        </h3>
        {isEditing ? (
          <button
            onClick={onCancelEdit}
            className="text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-3 pt-4">
        <Field id="manual-comm-medium" label="Medium">
          <select
            id="manual-comm-medium"
            name="manual-comm-medium"
            className={inputCls}
            value={subtype}
            onChange={event => setSubtype(event.target.value as CommSubtype)}
          >
            <option value="">Select medium...</option>
            {manualMediums.map(option => (
              <option key={option} value={option}>{getSubtypeLabel(option)}</option>
            ))}
          </select>
        </Field>

        <Field id="manual-comm-date" label="Date">
          <input
            id="manual-comm-date"
            name="manual-comm-date"
            type="date"
            className={inputCls}
            value={date}
            onChange={event => setDate(event.target.value)}
          />
        </Field>

        <Field id="manual-comm-details" label="Details">
          <textarea
            id="manual-comm-details"
            name="manual-comm-details"
            className={`${inputCls} resize-none`}
            rows={8}
            value={details}
            onChange={event => setDetails(event.target.value)}
            placeholder="What happened, what was said, and any useful context..."
          />
        </Field>

        {saveError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {saveError}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-gray-200 bg-gray-100 px-5 py-3">
        {isEditing ? (
          <button
            onClick={onCancelEdit}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-200"
          >
            Cancel
          </button>
        ) : null}
        <button
          onClick={() => { void handleSave(); }}
          disabled={!canSave || isSaving}
          className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
        >
          {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Add'}
        </button>
      </div>
    </div>
  );
}
