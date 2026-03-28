'use client';

import { useState } from 'react';
import { Communication } from '@/types/communication';
import { getCategoryDef, getSubtypeLabel } from './categoryConfig';

interface Props {
  comm: Communication;
  onEdit: (comm: Communication) => void;
  onDelete: (id: string) => void;
}

export default function TimelineItem({ comm, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const catDef = getCategoryDef(comm.category);

  const dateStr = new Date(comm.date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex group">
      {/* Interval label spacer */}
      <div className="w-8 shrink-0" />

      {/* Category label on the line — full-height line, badge centred vertically */}
      <div className="w-32 shrink-0 self-stretch relative">
        {/* Full-height line */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-gray-200" />
        {/* Badge centred vertically */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${catDef.color}`}>
            {catDef.label}
          </span>
        </div>
      </div>

      {/* Card — py-3 gives breathing room so line extends slightly beyond card edges */}
      <div className="flex-1 py-3 pl-3 min-w-0">
        <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-medium text-gray-500">{dateStr}</span>
                {comm.subtype && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-gray-500 bg-gray-100">
                    {getSubtypeLabel(comm.subtype)}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800">{comm.shortDescription}</p>
              {comm.details && (
                <>
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs text-[#1e9bb8] hover:opacity-80 mt-1 transition-opacity"
                  >
                    {expanded ? 'Hide details' : 'Show details'}
                  </button>
                  {expanded && (
                    <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed">
                      {comm.details}
                    </pre>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => onEdit(comm)}
                className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Edit"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={() => onDelete(comm.id)}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                aria-label="Delete"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
