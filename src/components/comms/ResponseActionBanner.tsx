'use client';

import type { DebtorResponseActionResult } from '@/types/communication';

interface Props {
  action: DebtorResponseActionResult;
  onConfirmHandover: () => void;
  onCancelHandover: () => void;
  onConfirmPaymentReceived: () => void;
  onPaymentNotReceived: () => void;
  onConfirmLegal?: () => void;
  onCancelLegal?: () => void;
  loading?: boolean;
}

const classificationLabels: Record<string, string> = {
  'dispute': 'Disputed',
  'refusal': 'Refused',
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
  onConfirmLegal,
  onCancelLegal,
  loading = false,
}: Props) {
  const label = classificationLabels[action.classification] ?? action.classification;

  const bannerColors: Record<string, string> = {
    'suggest-handover': 'border-red-200 bg-red-50',
    'go-legal': 'border-red-200 bg-red-50',
    'continue-legal': 'border-red-200 bg-red-50',
    'demand-evidence': 'border-orange-200 bg-orange-50',
    'threaten-deadline': 'border-red-200 bg-red-50',
    'set-deadline': 'border-amber-200 bg-amber-50',
    'ask-for-timeline': 'border-amber-200 bg-amber-50',
    'negotiate': 'border-blue-200 bg-blue-50',
    'pause-until-deadline': 'border-emerald-200 bg-emerald-50',
    'await-payment-confirmation': 'border-purple-200 bg-purple-50',
    'auto-check-payment': 'border-purple-200 bg-purple-50',
    'replan': 'border-gray-200 bg-gray-50',
    'none': 'border-gray-200 bg-gray-50',
  };

  const textColors: Record<string, string> = {
    'suggest-handover': 'text-red-800',
    'go-legal': 'text-red-800',
    'continue-legal': 'text-red-800',
    'demand-evidence': 'text-orange-800',
    'threaten-deadline': 'text-red-800',
    'set-deadline': 'text-amber-800',
    'ask-for-timeline': 'text-amber-800',
    'negotiate': 'text-blue-800',
    'pause-until-deadline': 'text-emerald-800',
    'await-payment-confirmation': 'text-purple-800',
    'auto-check-payment': 'text-purple-800',
    'replan': 'text-gray-700',
    'none': 'text-gray-700',
  };

  const border = bannerColors[action.action] ?? 'border-gray-200 bg-gray-50';
  const text = textColors[action.action] ?? 'text-gray-700';

  const phaseLabel =
    action.phase === 'friendly' ? 'Friendly' :
    action.phase === 'post-handover' ? 'Post-handover' :
    'Post-LoA';

  return (
    <div className={`rounded-xl border ${border} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${text}`}>
            Debtor response: {label}
          </span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
            {phaseLabel}
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

      {(action.action === 'go-legal' || action.action === 'demand-evidence') && onConfirmLegal && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onConfirmLegal}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 bg-red-600"
          >
            {loading ? 'Processing...' : action.action === 'demand-evidence' ? 'Go legal' : 'Confirm legal action'}
          </button>
          <button
            onClick={onCancelLegal}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}

      {(action.action === 'await-payment-confirmation' || action.action === 'auto-check-payment') && (
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

      {(action.action === 'set-deadline' || action.action === 'threaten-deadline') && action.computedDeadline && (
        <div className={`text-xs ${text} opacity-75`}>
          Deadline: {new Date(action.computedDeadline).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      )}

      {action.action === 'ask-for-timeline' && action.computedDeadline && (
        <div className={`text-xs ${text} opacity-75`}>
          Fallback deadline: {new Date(action.computedDeadline).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      )}

      {action.action === 'pause-until-deadline' && action.statedDeadline && (
        <div className={`text-xs ${text} opacity-75`}>
          Paused until: {action.statedDeadline}
        </div>
      )}

      {action.action === 'negotiate' && (
        <div className={`text-xs ${text} opacity-75`}>
          Negotiation will aim for maximum recovery at maximum speed.
        </div>
      )}
    </div>
  );
}
