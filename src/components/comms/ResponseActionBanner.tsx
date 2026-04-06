'use client';

import type { DebtorResponseActionResult } from '@/types/communication';

interface Props {
  action: DebtorResponseActionResult;
  onConfirmHandover: () => void;
  onCancelHandover: () => void;
  onConfirmPaymentReceived: () => void;
  onPaymentNotReceived: () => void;
  loading?: boolean;
}

const classificationLabels: Record<string, string> = {
  'refused-or-disputed': 'Refused / Disputed',
  'agreed-with-deadline': 'Agreed (with deadline)',
  'agreed-without-deadline': 'Agreed (no deadline)',
  'cant-afford': "Can't afford full amount",
  'claims-paid': 'Claims already paid',
  'unclear': 'Unclear response',
};

export default function ResponseActionBanner({
  action,
  onConfirmHandover,
  onCancelHandover,
  onConfirmPaymentReceived,
  onPaymentNotReceived,
  loading = false,
}: Props) {
  const label = classificationLabels[action.classification] ?? action.classification;

  const bannerColors: Record<string, string> = {
    'suggest-handover': 'border-red-200 bg-red-50',
    'set-deadline': 'border-amber-200 bg-amber-50',
    'offer-payment-plan': 'border-blue-200 bg-blue-50',
    'pause-until-deadline': 'border-emerald-200 bg-emerald-50',
    'await-payment-confirmation': 'border-purple-200 bg-purple-50',
    'replan': 'border-gray-200 bg-gray-50',
    'none': 'border-gray-200 bg-gray-50',
  };

  const textColors: Record<string, string> = {
    'suggest-handover': 'text-red-800',
    'set-deadline': 'text-amber-800',
    'offer-payment-plan': 'text-blue-800',
    'pause-until-deadline': 'text-emerald-800',
    'await-payment-confirmation': 'text-purple-800',
    'replan': 'text-gray-700',
    'none': 'text-gray-700',
  };

  const border = bannerColors[action.action] ?? 'border-gray-200 bg-gray-50';
  const text = textColors[action.action] ?? 'text-gray-700';

  return (
    <div className={`rounded-xl border ${border} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${text}`}>
            Debtor response: {label}
          </span>
          {action.confidence < 0.7 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              Low confidence
            </span>
          )}
        </div>
      </div>

      <p className={`text-sm ${text}`}>{action.userMessage}</p>

      {action.action === 'suggest-handover' && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onConfirmHandover}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 bg-red-600"
          >
            {loading ? 'Processing...' : 'Confirm handover'}
          </button>
          <button
            onClick={onCancelHandover}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}

      {action.action === 'await-payment-confirmation' && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onConfirmPaymentReceived}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
          >
            {loading ? 'Processing...' : 'Payment received'}
          </button>
          <button
            onClick={onPaymentNotReceived}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-60"
          >
            Not received
          </button>
        </div>
      )}

      {action.action === 'set-deadline' && action.computedDeadline && (
        <div className={`text-xs ${text} opacity-75`}>
          Deadline: {new Date(action.computedDeadline).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      )}

      {action.action === 'pause-until-deadline' && action.statedDeadline && (
        <div className={`text-xs ${text} opacity-75`}>
          Paused until: {action.statedDeadline}
        </div>
      )}

      {action.action === 'offer-payment-plan' && (
        <div className={`text-xs ${text} opacity-75`}>
          Payment plan will be offered (default 3 months, negotiable to 6 or 12).
        </div>
      )}
    </div>
  );
}
