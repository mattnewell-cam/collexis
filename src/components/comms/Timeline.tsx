'use client';

import { Communication } from '@/types/communication';
import TimelineItem from './TimelineItem';

interface Props {
  comms: Communication[];
  onEdit: (comm: Communication) => void;
  onDelete: (id: string) => void;
}

function formatInterval(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

function Connector({ days }: { days: number }) {
  return (
    <div className="flex h-10">
      <div className="w-8 shrink-0" />
      <div className="w-32 shrink-0 relative">
        {/* Vertical line — same positioning as TimelineItem */}
        <div className="absolute left-1/2 -translate-x-px w-px h-full bg-gray-200" />
        {/* Interval label — vertically centred, hugging the left of the line */}
        {days > 0 && (
          <span className="absolute right-1/2 pr-1.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 whitespace-nowrap">
            {formatInterval(days)}
          </span>
        )}
      </div>
      <div className="flex-1" />
    </div>
  );
}

export default function Timeline({ comms, onEdit, onDelete }: Props) {
  const sorted = [...comms].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <div className="flex-1 min-h-[300px]">
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
          <svg className="w-12 h-12 mb-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-sm">No communications yet</p>
          <p className="text-xs mt-1">Use the form on the left to add one</p>
        </div>
      ) : (
        <>
          {sorted.map((comm, i) => {
            const prev = sorted[i - 1];
            const intervalDays = prev
              ? Math.round(
                  (new Date(comm.date + 'T00:00:00').getTime() -
                    new Date(prev.date + 'T00:00:00').getTime()) /
                    86400000,
                )
              : 0;

            return (
              <div key={comm.id}>
                {i > 0 && <Connector days={intervalDays} />}
                <TimelineItem comm={comm} onEdit={onEdit} onDelete={onDelete} />
              </div>
            );
          })}

          {/* Trailing line + NOW */}
          <div className="flex h-8">
            <div className="w-8 shrink-0" />
            <div className="w-32 shrink-0 flex justify-center">
              <div className="w-px h-full bg-gray-200" />
            </div>
            <div className="flex-1" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-0.5 flex-1" style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1e9bb8' }}>Now</span>
            <div className="h-0.5 flex-1" style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }} />
          </div>
        </>
      )}
    </div>
  );
}
