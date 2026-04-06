'use client';

import { useState } from 'react';
import { runClientAction } from '@/lib/logging/client';
import { Communication, CommCategory, CommRecipient, CommSender, CommSubtype } from '@/types/communication';
import type { Job } from '@/types/job';
import { normalizeCommunicationDate } from '@/lib/communicationDates';
import { sendJobEmail } from '@/lib/jobEmail';
import { sendSms } from '@/lib/sms';
import {
  CATEGORIES,
  getCategoryDef,
  getDefaultSenderForCategory,
  getRecipientLabel,
  getSenderLabel,
} from './categoryConfig';

interface Props {
  job: Job;
  editing: Communication | null;
  onSave: (comm: Communication) => void;
  onSent: (comm: Communication) => void;
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

export default function CommForm({
  job,
  editing,
  onSave,
  onSent,
  onCancelEdit,
}: Props) {
  const isEditing = editing !== null;

  const [category, setCategory] = useState<CommCategory>(editing?.category ?? 'chase');
  const [subtype, setSubtype] = useState<CommSubtype | ''>(editing?.subtype ?? '');
  const [sender, setSender] = useState<CommSender>(
    editing?.sender ?? getDefaultSenderForCategory(editing?.category ?? 'chase'),
  );
  const [date, setDate] = useState(editing ? normalizeCommunicationDate(editing.date) : today);
  const [shortDescription, setShortDescription] = useState(editing?.shortDescription ?? '');
  const [details, setDetails] = useState(editing?.details ?? '');
  const [recipient, setRecipient] = useState<CommRecipient>(editing?.recipient ?? 'debtor');
  const [selectedEmail, setSelectedEmail] = useState(job.emails[0] ?? '');
  const [selectedPhone, setSelectedPhone] = useState(job.phones[0] ?? '');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState('');
  const [smsStatus, setSmsStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [smsError, setSmsError] = useState('');

  const catDef = getCategoryDef(category);
  const hasSubtypes = !!catDef.subtypes;
  const showSenderField = category !== 'due-date';
  const wordCount = shortDescription.trim().split(/\s+/).filter(Boolean).length;
  const isEmailSubtype = subtype === 'email';
  const isWhatsAppSubtype = subtype === 'whatsapp';
  const isSmsSubtype = subtype === 'sms';
  const canSendEmail = isEmailSubtype && !isEditing && !!selectedEmail && shortDescription.trim().length > 0 && details.trim().length > 0;
  const canSendSms = isSmsSubtype && !isEditing && !!selectedPhone && details.trim().length > 0;

  const buildCommunication = (fallbackShortDescription?: string) => ({
    id: editing?.id ?? crypto.randomUUID(),
    jobId: editing?.jobId ?? job.id,
    category,
    subtype: hasSubtypes && subtype ? (subtype as CommSubtype) : undefined,
    sender: showSenderField ? sender : undefined,
    recipient,
    date,
    shortDescription: shortDescription.trim() || fallbackShortDescription || '',
    details,
  });

  const clearDeliveryFeedback = () => {
    setEmailStatus('idle');
    setEmailError('');
    setSmsStatus('idle');
    setSmsError('');
  };

  const resetComposer = () => {
    setShortDescription('');
    setDetails('');
    setDate(today);
    setSelectedEmail(job.emails[0] ?? '');
    setSelectedPhone(job.phones[0] ?? '');
  };

  const handleSave = () => {
    onSave(buildCommunication());
    if (!isEditing) {
      resetComposer();
      clearDeliveryFeedback();
    }
  };

  const handleSendEmailAndLog = async () => {
    if (!canSendEmail) return;

    setEmailStatus('sending');
    setEmailError('');
    setSmsStatus('idle');
    setSmsError('');

    try {
      const sentCommunication = await runClientAction('communications.send_email', async trace =>
        sendJobEmail(job.id, {
          recipients: [selectedEmail],
          communication: buildCommunication(),
        }, trace), {
        jobId: job.id,
        recipientCount: 1,
      });

      onSent(sentCommunication);
      resetComposer();
      setEmailStatus('sent');
    } catch (error) {
      setEmailStatus('error');
      setEmailError(error instanceof Error ? error.message : 'Failed to send email.');
    }
  };

  const handleSendAndLog = async () => {
    if (!canSendSms) return;

    setSmsStatus('sending');
    setSmsError('');

    const result = await runClientAction('communications.send_sms', async trace =>
      sendSms({
        jobId: job.id,
        to: selectedPhone,
        text: details.trim(),
      }, trace), {
      jobId: job.id,
      hasPhone: Boolean(selectedPhone),
      textLength: details.trim().length,
    });

    if (!result.success) {
      setSmsStatus('error');
      setSmsError(result.error || 'Failed to send SMS.');
      return;
    }

    setSmsStatus('sent');
    onSave(buildCommunication('SMS sent'));
    resetComposer();
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
              clearDeliveryFeedback();
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
              onChange={e => {
                setSubtype(e.target.value as CommSubtype);
                clearDeliveryFeedback();
              }}
            >
              <option value="">Select type...</option>
              {catDef.subtypes!.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
        )}

        {showSenderField && (
          <Field label="From">
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

        {showSenderField && (
          <Field label="To">
            <select
              className={inputCls}
              value={recipient}
              onChange={e => setRecipient(e.target.value as CommRecipient)}
            >
              <option value="debtor">{getRecipientLabel('debtor')}</option>
              <option value="creditor">{getRecipientLabel('creditor')}</option>
              <option value="collexis">{getRecipientLabel('collexis')}</option>
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
          label={isEmailSubtype ? 'Subject' : 'Short description'}
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
            placeholder={isEmailSubtype ? 'e.g. Invoice #001 payment reminder' : 'e.g. First chase email sent'}
          />
        </Field>

        <Field label={isEmailSubtype ? 'Email body' : isWhatsAppSubtype ? 'WhatsApp body' : 'Details'}>
          <textarea
            className={inputCls + ' resize-none'}
            rows={5}
            value={details}
            onChange={e => {
              setDetails(e.target.value);
              if (emailStatus !== 'idle' || smsStatus !== 'idle') {
                clearDeliveryFeedback();
              }
            }}
            placeholder={isEmailSubtype ? 'Write the email body...' : isWhatsAppSubtype ? 'Write the WhatsApp message...' : isSmsSubtype ? 'Type the SMS message...' : 'Full details, email text, transcript, notes...'}
          />
          {isSmsSubtype ? (
            <p className="mt-1 text-xs text-gray-400">
              {details.length}/160 chars{details.length > 160 ? ` (${Math.ceil(details.length / 153)} parts)` : ''}
            </p>
          ) : null}
        </Field>

        {isEmailSubtype && !isEditing && job.emails.length > 0 ? (
          <Field label="Send to">
            <select
              className={inputCls}
              value={selectedEmail}
              onChange={e => {
                setSelectedEmail(e.target.value);
                if (emailStatus !== 'idle') {
                  setEmailStatus('idle');
                  setEmailError('');
                }
              }}
            >
              {job.emails.map(email => (
                <option key={email} value={email}>{email}</option>
              ))}
            </select>
          </Field>
        ) : null}

        {isSmsSubtype && !isEditing && job.phones.length > 0 ? (
          <Field label="Send to">
            <select
              className={inputCls}
              value={selectedPhone}
              onChange={e => setSelectedPhone(e.target.value)}
            >
              {job.phones.map(phone => (
                <option key={phone} value={phone}>{phone}</option>
              ))}
            </select>
          </Field>
        ) : null}

        {emailStatus === 'sent' ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Email sent successfully.
          </div>
        ) : null}
        {emailStatus === 'error' ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {emailError}
          </div>
        ) : null}
        {smsStatus === 'sent' ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            SMS sent successfully.
          </div>
        ) : null}
        {smsStatus === 'error' ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {smsError}
          </div>
        ) : null}
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
        {canSendEmail ? (
          <>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 transition-colors hover:bg-gray-200"
            >
              Log only
            </button>
            <button
              onClick={() => { void handleSendEmailAndLog(); }}
              disabled={emailStatus === 'sending'}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
            >
              {emailStatus === 'sending' ? 'Sending...' : 'Send & log'}
            </button>
          </>
        ) : canSendSms ? (
          <>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 transition-colors hover:bg-gray-200"
            >
              Log only
            </button>
            <button
              onClick={() => { void handleSendAndLog(); }}
              disabled={smsStatus === 'sending'}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
            >
              {smsStatus === 'sending' ? 'Sending...' : 'Send & log'}
            </button>
          </>
        ) : (
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
          >
            {isEditing ? 'Save changes' : 'Add'}
          </button>
        )}
      </div>
    </div>
  );
}
