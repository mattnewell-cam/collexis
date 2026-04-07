'use client';

import { useEffect, useState, KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useJobRouteCache } from '@/components/JobRouteCacheProvider';
import { runClientAction } from '@/lib/logging/client';
import { loggedFetch } from '@/lib/logging/fetch';
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

const currencyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const XIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PencilIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
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
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 transition-colors focus-within:border-[#2abfaa] focus-within:ring-1 focus-within:ring-[#2abfaa]">
      {values.map(v => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          {v}
          <button type="button" onClick={() => onChange(values.filter(x => x !== v))} className="text-gray-400 hover:text-gray-600">
            <XIcon />
          </button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
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
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function SectionCard({
  title,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-slate-200/40 ${className}`.trim()}>
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{title}</h3>
      <div className={`mt-4 space-y-4 ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

function EditableStatCard({
  label,
  value,
  isEditing,
  onToggleEdit,
  children,
}: {
  label: string;
  value: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-slate-200/40">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
        <button
          type="button"
          onClick={onToggleEdit}
          aria-label={`Edit ${label}`}
          className="rounded-full border border-gray-200 p-1.5 text-gray-400 transition-colors hover:border-[#2abfaa] hover:text-[#1e9bb8]"
        >
          <PencilIcon />
        </button>
      </div>
      <div className="mt-3 text-2xl font-semibold text-gray-900">{value}</div>
      {isEditing ? <div className="mt-4 border-t border-gray-100 pt-4">{children}</div> : null}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa]';

type EditableStatKey = 'status' | 'price' | 'amountPaid' | 'daysOverdue';

export default function JobDetailsForm({ job }: { job: Job }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setJob } = useJobRouteCache();
  const [draft, setDraft] = useState<Job>({ ...job });
  const [editingStat, setEditingStat] = useState<EditableStatKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showProcessedNotice, setShowProcessedNotice] = useState(searchParams.get('notice') === 'docs-processed');

  const set = <K extends keyof Job>(key: K, value: Job[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  useEffect(() => {
    setDraft({ ...job });
  }, [job]);

  useEffect(() => {
    setShowProcessedNotice(searchParams.get('notice') === 'docs-processed');
  }, [searchParams]);

  const clearNotice = () => {
    setShowProcessedNotice(false);
    router.replace(pathname);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      await runClientAction('jobs.save_details', async trace => {
        const response = await loggedFetch(`/api/jobs/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        }, {
          name: 'jobs.save_details_request',
          context: {
            jobId: draft.id,
            status: draft.status,
            emailCount: draft.emails.length,
            phoneCount: draft.phones.length,
          },
          trace,
        });

        if (!response.ok) {
          throw new Error('Could not save job details.');
        }

        const payload = await response.json() as { job: Job };
        setJob(payload.job);
        router.push(`/console/jobs/${draft.id}/communications`);
        router.refresh();
      }, {
        jobId: draft.id,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save job details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-[#f8fbfc] px-6 py-6 lg:px-8 lg:py-8">
        {saveError ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {saveError}
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <EditableStatCard
          label="Status"
          value={draft.status}
          isEditing={editingStat === 'status'}
          onToggleEdit={() => setEditingStat(current => (current === 'status' ? null : 'status'))}
        >
          <select className={inputCls} value={draft.status} onChange={e => set('status', e.target.value as JobStatus)}>
            {JOB_STATUSES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </EditableStatCard>
        <EditableStatCard
          label="Invoice total"
          value={currencyFormatter.format(draft.price || 0)}
          isEditing={editingStat === 'price'}
          onToggleEdit={() => setEditingStat(current => (current === 'price' ? null : 'price'))}
        >
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">&pound;</span>
            <input
              type="number"
              className={inputCls + ' pl-6'}
              value={draft.price}
              onChange={e => set('price', parseFloat(e.target.value) || 0)}
            />
          </div>
        </EditableStatCard>
        <EditableStatCard
          label="Amount paid"
          value={currencyFormatter.format(draft.amountPaid || 0)}
          isEditing={editingStat === 'amountPaid'}
          onToggleEdit={() => setEditingStat(current => (current === 'amountPaid' ? null : 'amountPaid'))}
        >
          <input
            type="number"
            className={inputCls}
            value={draft.amountPaid}
            onChange={e => set('amountPaid', parseFloat(e.target.value) || 0)}
          />
        </EditableStatCard>
        <EditableStatCard
          label="Days overdue"
          value={`${draft.daysOverdue} days`}
          isEditing={editingStat === 'daysOverdue'}
          onToggleEdit={() => setEditingStat(current => (current === 'daysOverdue' ? null : 'daysOverdue'))}
        >
          <input
            type="number"
            className={inputCls}
            value={draft.daysOverdue}
            onChange={e => set('daysOverdue', parseInt(e.target.value) || 0)}
          />
        </EditableStatCard>
      </div>

      <div className="mt-6 grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]">
        <div>
          <SectionCard title="Job" className="h-full" bodyClassName="flex h-full flex-col">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <Field label="Description">
                  <input className={inputCls} value={draft.jobDescription} onChange={e => set('jobDescription', e.target.value)} />
                </Field>
              </div>
              <div>
                <Field label="Due date">
                  <input className={inputCls} type="date" value={draft.dueDate} onChange={e => set('dueDate', e.target.value)} />
                </Field>
              </div>
              <div className="lg:col-span-2 flex flex-1 flex-col">
                <Field label="Job detail">
                  <textarea
                    className={inputCls + ' h-full min-h-[420px] resize-none'}
                    rows={10}
                    value={draft.jobDetail}
                    onChange={e => set('jobDetail', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="grid h-full gap-6 xl:grid-rows-[auto_minmax(0,1fr)]">
          <SectionCard title="Contact">
            <Field label="Email addresses">
              <TagListEditor values={draft.emails} onChange={v => set('emails', v)} placeholder="Add email, press Enter" />
            </Field>
            <Field label="Phone numbers">
              <TagListEditor values={draft.phones} onChange={v => set('phones', v)} placeholder="Add phone, press Enter" />
            </Field>
            <Field label="Address">
              <input
                className={inputCls}
                value={draft.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Add address"
              />
            </Field>
          </SectionCard>

          <SectionCard title="Context / Instructions" className="h-full" bodyClassName="flex h-full flex-col">
            <div className="flex flex-1 flex-col">
              <Field label="Internal notes">
                <textarea
                  className={inputCls + ' h-full min-h-[300px] resize-none'}
                  rows={10}
                  value={draft.contextInstructions}
                  onChange={e => set('contextInstructions', e.target.value)}
                />
              </Field>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="sticky bottom-4 z-10 mt-6 ml-auto flex w-fit justify-end gap-2 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/50 backdrop-blur">
        <button
          onClick={() => setDraft({ ...job })}
          className="rounded-lg px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          Discard
        </button>
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      </div>

      {showProcessedNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35"
            aria-label="Close processed documents notice"
            onClick={clearNotice}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-3xl border border-teal-100 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-[#1e9bb8]">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Documents processed</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Docs have been automatically processed. Check all is correct, then click Save.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={clearNotice}
                className="rounded-xl px-4 py-2 text-sm font-medium text-[#1e9bb8] transition-colors hover:bg-[#e7f7fb]"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
