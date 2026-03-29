'use client';

import { useEffect, useState, KeyboardEvent } from 'react';
import { Job, JobStatus } from '@/types/job';

const JOB_STATUSES: JobStatus[] = [
  'Initial wait',
  'Polite chase',
  'Stern chase',
  'Letter of Action sent',
  'Awaiting judgment',
  'Judgment granted',
  'Paid',
  'Abandoned',
];

interface Props {
  job: Job;
  onClose: () => void;
}

const XIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

function TagListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const val = draft.trim();
    if (val && !values.includes(val)) onChange([...values, val]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center rounded-lg border border-gray-200 bg-white px-2.5 py-2 focus-within:border-[#2abfaa] focus-within:ring-1 focus-within:ring-[#2abfaa] transition-colors">
      {values.map(v => (
        <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
          {v}
          <button type="button" onClick={() => onChange(values.filter(x => x !== v))} className="text-gray-400 hover:text-gray-600">
            <XIcon />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent placeholder:text-gray-400"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : ''}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors";

export default function JobRowModal({ job, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Job>({ ...job });

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const set = <K extends keyof Job>(key: K, value: Job[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className={`relative w-full max-w-lg h-full bg-white shadow-xl overflow-y-auto transition-transform duration-300 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 mr-4 space-y-1.5">
            <input
              className={inputCls + ' text-base font-semibold'}
              value={draft.name}
              onChange={e => set('name', e.target.value)}
            />
            <input
              className={inputCls + ' text-gray-500'}
              value={draft.address}
              onChange={e => set('address', e.target.value)}
            />
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Contact */}
        <section className="p-6 border-b border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</h3>
          <Field label="Email addresses">
            <TagListEditor
              values={draft.emails}
              onChange={v => set('emails', v)}
              placeholder="Add email, press Enter"
            />
          </Field>
          <Field label="Phone numbers">
            <TagListEditor
              values={draft.phones}
              onChange={v => set('phones', v)}
              placeholder="Add phone, press Enter"
            />
          </Field>
        </section>

        {/* Job */}
        <section className="p-6 border-b border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Job</h3>
          <Field label="Description">
            <input
              className={inputCls}
              value={draft.jobDescription}
              onChange={e => set('jobDescription', e.target.value)}
            />
          </Field>
          <Field label="Job detail">
            <textarea
              className={inputCls + ' resize-none'}
              rows={4}
              value={draft.jobDetail}
              onChange={e => set('jobDetail', e.target.value)}
            />
          </Field>
          <Field label="Invoice total">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">£</span>
              <input
                type="number"
                className={inputCls + ' pl-6'}
                value={draft.price}
                onChange={e => set('price', parseFloat(e.target.value) || 0)}
              />
            </div>
          </Field>
        </section>

        {/* Job Details */}
        <section className="p-6 border-b border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Job Details</h3>
          <Field label="Status">
            <select
              className={inputCls}
              value={draft.status}
              onChange={e => set('status', e.target.value as JobStatus)}
            >
              {JOB_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Days overdue">
            <input
              type="number"
              className={inputCls}
              value={draft.daysOverdue}
              onChange={e => set('daysOverdue', parseInt(e.target.value) || 0)}
            />
          </Field>
          <Field label="Amount paid (£)">
            <input
              type="number"
              className={inputCls}
              value={draft.amountPaid}
              onChange={e => set('amountPaid', parseFloat(e.target.value) || 0)}
            />
          </Field>
        </section>

        {/* Context / Instructions */}
        <section className="p-6 border-b border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Context / Instructions</h3>
          <textarea
            className={inputCls + ' resize-none'}
            rows={4}
            value={draft.contextInstructions}
            onChange={e => set('contextInstructions', e.target.value)}
          />
        </section>

        {/* Invoice Documents */}
        <section className="p-6 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Invoice Documents</h3>
          <div className="space-y-2">
            {draft.invoiceDocuments.map((doc) => (
              <div key={doc} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className="text-sm text-gray-700">{doc}</span>
                </div>
                <div className="flex items-center gap-3">
                  <a href="#" onClick={e => e.preventDefault()} className="text-xs font-medium text-[#1e9bb8] hover:opacity-80 transition-opacity">
                    Download
                  </a>
                  <button
                    onClick={() => set('invoiceDocuments', draft.invoiceDocuments.filter(d => d !== doc))}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <XIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const name = prompt('Document name:');
              if (name?.trim()) set('invoiceDocuments', [...draft.invoiceDocuments, name.trim()]);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1e9bb8] hover:opacity-80 transition-opacity"
          >
            <PlusIcon /> Add document
          </button>
        </section>

        {/* Save bar */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            Discard
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
