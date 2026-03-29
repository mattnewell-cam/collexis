'use client';

import { useState } from 'react';
import { Communication, CommCategory, CommSender, CommSubtype } from '@/types/communication';
import {
  CATEGORIES,
  getCategoryDef,
  getDefaultSenderForCategory,
  getSenderLabel,
} from './categoryConfig';

interface Props {
  editing: Communication | null;
  onSave: (comm: Communication) => void;
  onCancelEdit: () => void;
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors';

function Field({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        {meta}
      </div>
      {children}
    </div>
  );
}

const today = new Date().toISOString().slice(0, 10);

export default function CommForm({ editing, onSave, onCancelEdit }: Props) {
  const isEditing = editing !== null;

  const [category, setCategory] = useState<CommCategory>(editing?.category ?? 'chase');
  const [subtype, setSubtype] = useState<CommSubtype | ''>(editing?.subtype ?? '');
  const [sender, setSender] = useState<CommSender>(
    editing?.sender ?? getDefaultSenderForCategory(editing?.category ?? 'chase'),
  );
  const [date, setDate] = useState(editing?.date ?? today);
  const [shortDescription, setShortDescription] = useState(editing?.shortDescription ?? '');
  const [details, setDetails] = useState(editing?.details ?? '');

  const catDef = getCategoryDef(category);
  const hasSubtypes = !!catDef.subtypes;
  const showSenderField = category !== 'due-date';
  const wordCount = shortDescription.trim().split(/\s+/).filter(Boolean).length;

  const handleSave = () => {
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      jobId: editing?.jobId ?? '',
      category,
      subtype: hasSubtypes && subtype ? (subtype as CommSubtype) : undefined,
      sender: showSenderField ? sender : undefined,
      date,
      shortDescription: shortDescription.trim(),
      details,
    });
    if (!isEditing) {
      setShortDescription('');
      setDetails('');
      setDate(today);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-5 flex items-center justify-between shrink-0 min-h-[72px]">
        <h3 className="text-sm font-semibold text-gray-900">
          {isEditing ? 'Edit Communication' : 'Add Communication'}
        </h3>
        {isEditing && (
          <button
            onClick={onCancelEdit}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3 space-y-3">
        <Field label="Category">
          <select
            className={inputCls}
            value={category}
            onChange={e => {
              const nextCategory = e.target.value as CommCategory;
              const nextDef = getCategoryDef(nextCategory);
              setCategory(nextCategory);
              if (!nextDef.subtypes || (subtype && !nextDef.subtypes.find(s => s.value === subtype))) {
                setSubtype('');
              }
              if (!isEditing) {
                setSender(getDefaultSenderForCategory(nextCategory));
              }
            }}
            disabled={isEditing}
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>

        {hasSubtypes && (
          <Field label="Type">
            <select
              className={inputCls}
              value={subtype}
              onChange={e => setSubtype(e.target.value as CommSubtype)}
            >
              <option value="">Select type...</option>
              {catDef.subtypes!.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
        )}

        {showSenderField && (
          <Field label="Sender">
            <select
              className={inputCls}
              value={sender}
              onChange={e => setSender(e.target.value as CommSender)}
            >
              <option value="you">{getSenderLabel('you')}</option>
              <option value="collexis">{getSenderLabel('collexis')}</option>
            </select>
          </Field>
        )}

        <Field label="Date">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </Field>

        <Field
          label="Short description"
          meta={
            <span className={`text-xs ${wordCount > 10 ? 'text-amber-500' : 'text-gray-400'}`}>
              {wordCount}/10 words
            </span>
          }
        >
          <input
            className={inputCls}
            value={shortDescription}
            onChange={e => setShortDescription(e.target.value)}
            placeholder="e.g. First chase email sent"
          />
        </Field>

        <Field label="Details">
          <textarea
            className={inputCls + ' resize-none'}
            rows={5}
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Full details, email text, transcript, notes..."
          />
        </Field>
      </div>

      {/* Save bar pinned to bottom */}
      <div className="shrink-0 px-5 py-3 border-t border-gray-200 bg-gray-100 flex gap-2">
        {isEditing && (
          <button
            onClick={onCancelEdit}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
        >
          {isEditing ? 'Save changes' : 'Add'}
        </button>
      </div>
    </div>
  );
}
