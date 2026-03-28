'use client';

import { useEffect, useState } from 'react';
import { Communication, CommCategory, CommSubtype } from '@/types/communication';
import { CATEGORIES, getCategoryDef } from './categoryConfig';

interface Props {
  comm: Communication | null; // null = new item
  defaultCategory?: CommCategory;
  onSave: (comm: Communication) => void;
  onClose: () => void;
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

export default function CommModal({ comm, defaultCategory, onSave, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const isNew = comm === null;

  const [category, setCategory] = useState<CommCategory>(comm?.category ?? defaultCategory ?? 'chase');
  const [subtype, setSubtype] = useState<CommSubtype | ''>(comm?.subtype ?? '');
  const [date, setDate] = useState(comm?.date ?? new Date().toISOString().slice(0, 10));
  const [shortDescription, setShortDescription] = useState(comm?.shortDescription ?? '');
  const [details, setDetails] = useState(comm?.details ?? '');

  const catDef = getCategoryDef(category);
  const hasSubtypes = !!catDef.subtypes;

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Reset subtype when category changes
  useEffect(() => {
    if (!isNew) return;
    const def = getCategoryDef(category);
    if (!def.subtypes) {
      setSubtype('');
    } else if (subtype && !def.subtypes.find(s => s.value === subtype)) {
      setSubtype('');
    }
  }, [category, isNew, subtype]);

  const wordCount = shortDescription.trim().split(/\s+/).filter(Boolean).length;

  const handleSave = () => {
    onSave({
      id: comm?.id ?? crypto.randomUUID(),
      jobId: comm?.jobId ?? '',
      category,
      subtype: hasSubtypes && subtype ? (subtype as CommSubtype) : undefined,
      date,
      shortDescription: shortDescription.trim(),
      details,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className={`relative w-full max-w-lg h-full bg-white shadow-xl overflow-y-auto transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isNew ? 'Add Communication' : 'Edit Communication'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <section className="p-6 space-y-4">
          <Field label="Category">
            <select
              className={inputCls}
              value={category}
              onChange={e => setCategory(e.target.value as CommCategory)}
              disabled={!isNew}
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
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
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
              rows={8}
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Full details, email text, transcript, notes..."
            />
          </Field>
        </section>

        {/* Save bar */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
          >
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
