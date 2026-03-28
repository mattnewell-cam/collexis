'use client';

import { useState } from 'react';
import { Communication } from '@/types/communication';
import { mockJobs } from '@/data/mockJobs';
import { mockCommunications } from '@/data/mockCommunications';
import CommForm from './comms/CommForm';
import Timeline from './comms/Timeline';

const selectCls =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors';

export default function CommunicationsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [commsMap, setCommsMap] = useState<Record<string, Communication[]>>(mockCommunications);
  const [editingComm, setEditingComm] = useState<Communication | null>(null);

  const currentComms = selectedJobId ? commsMap[selectedJobId] ?? [] : [];

  const handleSave = (comm: Communication) => {
    if (!selectedJobId) return;
    const updated = { ...comm, jobId: selectedJobId };
    setCommsMap(prev => {
      const list = prev[selectedJobId] ?? [];
      const idx = list.findIndex(c => c.id === updated.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = updated;
        return { ...prev, [selectedJobId]: next };
      }
      return { ...prev, [selectedJobId]: [...list, updated] };
    });
    setEditingComm(null);
  };

  const handleDelete = (id: string) => {
    if (!selectedJobId) return;
    setCommsMap(prev => ({
      ...prev,
      [selectedJobId]: (prev[selectedJobId] ?? []).filter(c => c.id !== id),
    }));
    if (editingComm?.id === id) setEditingComm(null);
  };

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* Sidebar */}
      <aside className="w-1/4 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
        {selectedJobId ? (
          <CommForm
            editing={editingComm}
            onSave={handleSave}
            onCancelEdit={() => setEditingComm(null)}
          />
        ) : (
          <>
            <div className="px-5 shrink-0 min-h-[90px] flex items-center">
              <h3 className="text-sm font-semibold text-gray-900">Add Communication</h3>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
              Select a job to add communications
            </div>
          </>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-8 border-b border-gray-100 bg-white shrink-0 min-h-[90px] flex items-center">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Communications</h1>
              <p className="text-sm text-gray-500 mt-0.5">View and manage communications for each job</p>
            </div>
            <select
              className={selectCls}
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
            >
              <option value="">Select a job...</option>
              {mockJobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.name} — {j.jobDescription}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body */}
        {!selectedJobId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <svg className="w-16 h-16 mb-4 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">Select a job to view its communications</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-10 py-8">
            <div className="max-w-2xl mx-auto">
              <Timeline
                comms={currentComms}
                onEdit={setEditingComm}
                onDelete={handleDelete}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
