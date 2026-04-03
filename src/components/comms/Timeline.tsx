'use client';

import { Communication } from '@/types/communication';
import { DocumentRecord } from '@/types/document';
import { parseCommunicationDate } from '@/lib/communicationDates';
import TimelineItem from './TimelineItem';

interface Props {
  comms: Communication[];
  documents: DocumentRecord[];
  plannedHandoverAt?: string | null;
  onEdit: (comm: Communication) => void;
  onDelete: (comm: Communication) => void;
  onLinkDocument: (comm: Communication, documentId: string) => Promise<void>;
  onUploadDocuments: (comm: Communication, files: FileList) => Promise<void>;
}

const nowDividerLineStyle = {
  background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)',
};

function formatInterval(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

function Connector({
  days,
  alwaysShowLabel = false,
}: {
  days: number;
  alwaysShowLabel?: boolean;
}) {
  return (
    <div className="flex h-5">
      <div className="w-8 shrink-0" />
      <div className="relative w-32 shrink-0">
        <div className="absolute left-1/2 h-full w-px -translate-x-px bg-gray-200" />
        {(alwaysShowLabel || days > 0) && (
          <span className="absolute right-1/2 top-1/2 -translate-y-1/2 whitespace-nowrap pr-1.5 text-sm text-gray-400">
            {formatInterval(days)}
          </span>
        )}
      </div>
      <div className="flex-1" />
    </div>
  );
}

function NowDivider() {
  return (
    <div className="relative flex h-12 items-center">
      <div className="w-8 shrink-0" />
      <div className="relative w-32 shrink-0 self-stretch">
        <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-px bg-gray-200" />
      </div>
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-3">
        <div className="h-0.5 flex-1" style={nowDividerLineStyle} />
        <span
          className="bg-white px-3 text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#1e9bb8' }}
        >
          Now
        </span>
        <div className="h-0.5 flex-1" style={nowDividerLineStyle} />
      </div>
    </div>
  );
}

function HandoverDivider({ label }: { label: string }) {
  return (
    <div className="relative flex h-10 items-center">
      <div className="w-8 shrink-0" />
      <div className="relative w-32 shrink-0 self-stretch">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-teal-200/80" />
      </div>
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-teal-200 to-transparent" />
        <span className="rounded-full border border-teal-200 bg-teal-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
          {label}
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-teal-200 to-transparent" />
      </div>
    </div>
  );
}

export default function Timeline({
  comms,
  documents,
  plannedHandoverAt = null,
  onEdit,
  onDelete,
  onLinkDocument,
  onUploadDocuments,
}: Props) {
  const sorted = [...comms].sort(
    (a, b) => (parseCommunicationDate(a.date)?.getTime() ?? 0) - (parseCommunicationDate(b.date)?.getTime() ?? 0),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const handoverDate = plannedHandoverAt ? parseCommunicationDate(plannedHandoverAt) : null;
  const lastComm = sorted.at(-1);
  const lastCommDate = lastComm ? parseCommunicationDate(lastComm.date) : null;
  const daysFromLastActionToNow = lastComm
    && lastCommDate
    ? Math.max(
        0,
        Math.round(
          (today.getTime() - lastCommDate.getTime()) / 86400000,
        ),
      )
    : 0;
  const showTrailingHandoverDivider = Boolean(
    handoverDate
    && lastCommDate
    && lastCommDate.getTime() < handoverDate.getTime()
    && handoverDate.getTime() <= today.getTime(),
  );

  return (
    <div className="flex-1 min-h-[300px]">
      {sorted.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center py-16 text-gray-400">
          <svg
            className="mb-3 h-12 w-12 text-gray-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-sm">No communications yet</p>
          <p className="mt-1 text-xs">Use the form on the left to add one</p>
        </div>
      ) : (
        <>
          {sorted.map((comm, i) => {
            const prev = sorted[i - 1];
            const currentDate = parseCommunicationDate(comm.date);
            const previousDate = prev ? parseCommunicationDate(prev.date) : null;
            const showHandoverDivider = handoverDate
              && currentDate
              && (
                (!previousDate && handoverDate.getTime() <= currentDate.getTime())
                || (previousDate && previousDate.getTime() < handoverDate.getTime() && handoverDate.getTime() <= currentDate.getTime())
              );
            const intervalDays = prev
              && currentDate
              && previousDate
              ? Math.round(
                  (currentDate.getTime() - previousDate.getTime()) /
                    86400000,
                )
              : 0;

            return (
              <div key={comm.id}>
                {i > 0 && <Connector days={intervalDays} />}
                {showHandoverDivider ? <HandoverDivider label="Handover" /> : null}
                <TimelineItem
                  comm={comm}
                  documents={documents}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onLinkDocument={onLinkDocument}
                  onUploadDocuments={onUploadDocuments}
                />
              </div>
            );
          })}

          {showTrailingHandoverDivider ? <HandoverDivider label="Handover" /> : null}
          <Connector days={daysFromLastActionToNow} alwaysShowLabel />
          <NowDivider />
        </>
      )}
    </div>
  );
}
