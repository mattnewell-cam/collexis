'use client';

import { useEffect, useState } from 'react';
import { Communication, CommCategory, CommSubtype } from '@/types/communication';
import { CATEGORIES, getCategoryDef } from './categoryConfig';

interface Props {
  editing: Communication | null;
  onSave: (comm: Communication) => void;
  onCancelEdit: () => void;
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const today = new Date().toISOString().slice(0, 10);

export default function CommForm({ editing, onSave, onCancelEdit }: Props) {
  const isEditing = editing !== null;

  const [category, setCategory] = useState<CommCategory>(editing?.category ?? 'chase');
  const [subtype, setSubtype] = useState<CommSubtype | ''>(editing?.subtype ?? '');
  const [date, setDate] = useState(editing?.date ?? today);
  const [shortDescription, setShortDescription] = useState(editing?.shortDescription ?? '');
  const [details, setDetails] = useState(editing?.details ?? '');

  useEffect(() => {
    setCategory(editing?.category ?? 'chase');
    setSubtype(editing?.subtype ?? '');
    setDate(editing?.date ?? today);
    setShortDescription(editing?.shortDescription ?? '');
    setDetails(editing?.details ?? '');
  }, [editing]);

  const catDef = getCategoryDef(category);
  const hasSubtypes = !!catDef.subtypes;
  const wordCount = shortDescription.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    if (isEditing) return;
    const def = getCategoryDef(category);
    if (!def.subtypes) setSubtype('');
  }, [category, isEditing]);

  const handleSave = () => {
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      jobId: editing?.jobId ?? '',
      category,
      subtype: hasSubtypes && subtype ? (subtype as CommSubtype) : undefined,
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 flex items-center justify-between shrink-0 min-h-[90px]">
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
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <Field label="Category">
          <select
            className={inputCls}
            value={category}
            onChange={e => setCategory(e.target.value as CommCategory)}
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

        <Field label="Date">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </Field>

        <Field label="Short description">
          <div>
            <input
              className={inputCls}
              value={shortDescription}
              onChange={e => setShortDescription(e.target.value)}
              placeholder="e.g. First chase email sent"
            />
            <p className={`text-xs mt-1 ${wordCount > 10 ? 'text-amber-500' : 'text-gray-400'}`}>
              {wordCount}/10 words
            </p>
          </div>
        </Field>

        <Field label="Details">
          <textarea
            className={inputCls + ' resize-none'}
            rows={6}
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Full details, email text, transcript, notes..."
          />
        </Field>
      </div>

      {/* Save bar pinned to bottom */}
      <div className="shrink-0 px-5 py-4 border-t border-gray-200 bg-gray-100 flex gap-2">
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
