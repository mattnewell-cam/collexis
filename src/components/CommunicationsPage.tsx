'use client';

import { useEffect, useRef, useState } from 'react';
import { Communication } from '@/types/communication';
import { PostNowStep } from '@/types/postNowPlan';
import { mockJobs } from '@/data/mockJobs';
import { mockCommunications } from '@/data/mockCommunications';
import { clonePostNowPlans } from '@/data/mockPostNowPlans';
import CommForm from './comms/CommForm';
import PostNowTimeline from './comms/PostNowTimeline';
import Timeline from './comms/Timeline';

const selectCls =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] transition-colors';
const timelineTrackCls = 'max-w-2xl mx-auto';
const headerSelectWidthCls = 'w-[31.25rem]';
const headerTitleCls = 'absolute top-0 right-[calc(31.25rem+1.5rem)] w-[21.75rem]';
const deleteUndoWindowMs = 6000;

interface PendingUndoDelete {
  jobId: string;
  comm: Communication;
}

export default function CommunicationsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [commsMap, setCommsMap] = useState<Record<string, Communication[]>>(mockCommunications);
  const [postNowMap, setPostNowMap] = useState<Record<string, PostNowStep[]>>(clonePostNowPlans);
  const [editingComm, setEditingComm] = useState<Communication | null>(null);
  const [deleteConfirmComm, setDeleteConfirmComm] = useState<Communication | null>(null);
  const [pendingUndoDelete, setPendingUndoDelete] = useState<PendingUndoDelete | null>(null);
  const deleteUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentComms = selectedJobId ? commsMap[selectedJobId] ?? [] : [];
  const currentPostNowSteps = selectedJobId ? postNowMap[selectedJobId] ?? [] : [];
  const defaultPostNowSender = currentComms.some(comm => comm.category === 'collexis-handover')
    ? 'collexis'
    : 'you';

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

  useEffect(() => {
    return () => {
      if (deleteUndoTimeoutRef.current) {
        clearTimeout(deleteUndoTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!deleteConfirmComm) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeleteConfirmComm(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirmComm]);

  const removeComm = (jobId: string, id: string) => {
    setCommsMap(prev => ({
      ...prev,
      [jobId]: (prev[jobId] ?? []).filter(c => c.id !== id),
    }));
    if (editingComm?.id === id) setEditingComm(null);
  };

  const queueUndoToast = (jobId: string, comm: Communication) => {
    if (deleteUndoTimeoutRef.current) {
      clearTimeout(deleteUndoTimeoutRef.current);
    }

    setPendingUndoDelete({ jobId, comm });
    deleteUndoTimeoutRef.current = setTimeout(() => {
      setPendingUndoDelete(current =>
        current?.jobId === jobId && current.comm.id === comm.id ? null : current,
      );
      deleteUndoTimeoutRef.current = null;
    }, deleteUndoWindowMs);
  };

  const handleDeleteRequest = (comm: Communication) => {
    setDeleteConfirmComm(comm);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmComm) return;

    removeComm(deleteConfirmComm.jobId, deleteConfirmComm.id);
    queueUndoToast(deleteConfirmComm.jobId, deleteConfirmComm);
    setDeleteConfirmComm(null);
  };

  const handleUndoDelete = () => {
    if (!pendingUndoDelete) return;

    if (deleteUndoTimeoutRef.current) {
      clearTimeout(deleteUndoTimeoutRef.current);
      deleteUndoTimeoutRef.current = null;
    }

    setCommsMap(prev => ({
      ...prev,
      [pendingUndoDelete.jobId]: [...(prev[pendingUndoDelete.jobId] ?? []), pendingUndoDelete.comm],
    }));
    setPendingUndoDelete(null);
  };

  const handlePostNowChange = (steps: PostNowStep[]) => {
    if (!selectedJobId) return;
    setPostNowMap(prev => ({
      ...prev,
      [selectedJobId]: steps,
    }));
  };

  const handlePostNowDelayChange = (id: string, delayDays: number) => {
    handlePostNowChange(
      currentPostNowSteps.map(step =>
        step.id === id ? { ...step, delayDays } : step,
      ),
    );
  };

  const handlePostNowSenderChange = (id: string, sender: 'you' | 'collexis') => {
    handlePostNowChange(
      currentPostNowSteps.map(step =>
        step.id === id ? { ...step, sender } : step,
      ),
    );
  };

  const handleInsertPostNowStep = (index: number, step: PostNowStep) => {
    handlePostNowChange([
      ...currentPostNowSteps.slice(0, index),
      step,
      ...currentPostNowSteps.slice(index),
    ]);
  };

  return (
    <>
      <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
        {/* Sidebar */}
        <aside className="w-[22rem] shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
          {selectedJobId ? (
            <div className="shrink-0">
              <CommForm
                key={editingComm?.id ?? `new-${selectedJobId}`}
                editing={editingComm}
                onSave={handleSave}
                onCancelEdit={() => setEditingComm(null)}
              />
            </div>
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
          <div className="px-10 border-b border-gray-100 bg-white shrink-0 py-6">
            <div className={`${timelineTrackCls} relative flex min-h-[3.5rem] items-start justify-end`}>
              <div className={headerTitleCls}>
                <h1 className="text-xl font-semibold text-gray-900">Communications</h1>
                <p className="text-sm text-gray-500 mt-0.5">View and manage communications for each job</p>
              </div>
              <select
                className={`${selectCls} ${headerSelectWidthCls} shrink-0`}
                value={selectedJobId}
                onChange={e => setSelectedJobId(e.target.value)}
              >
                <option value="">Select a job...</option>
                {mockJobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.name} - {j.jobDescription}
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
              <div className="space-y-4">
                <div className={timelineTrackCls}>
                  <Timeline
                    comms={currentComms}
                    onEdit={setEditingComm}
                    onDelete={handleDeleteRequest}
                  />
                </div>
                <div className={timelineTrackCls}>
                  <PostNowTimeline
                    steps={currentPostNowSteps}
                    defaultSender={defaultPostNowSender}
                    onDelayChange={handlePostNowDelayChange}
                    onSenderChange={handlePostNowSenderChange}
                    onInsertStep={handleInsertPostNowStep}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    
      {deleteConfirmComm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35"
            aria-label="Close delete confirmation"
            onClick={() => setDeleteConfirmComm(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-comm-title"
            className="relative w-full max-w-md rounded-3xl border border-red-100 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <h2 id="delete-comm-title" className="mt-4 text-lg font-semibold text-gray-900">Are you sure?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Delete &ldquo;{deleteConfirmComm.shortDescription}&rdquo; from this communications
              timeline? You&rsquo;ll be able to undo it for 6 seconds afterwards.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmComm(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingUndoDelete ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 w-full max-w-sm px-4 sm:px-0">
          <div className="pointer-events-auto overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex items-start gap-3 p-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Communication deleted</p>
                <p className="mt-1 text-sm text-gray-500">
                  &ldquo;{pendingUndoDelete.comm.shortDescription}&rdquo; was removed.
                </p>
              </div>
              <button
                type="button"
                onClick={handleUndoDelete}
                className="rounded-xl px-3 py-2 text-sm font-medium text-[#1e9bb8] transition-colors hover:bg-[#e7f7fb]"
              >
                Undo
              </button>
            </div>
            <div className="h-1 w-full bg-gray-100">
              <div
                key={pendingUndoDelete.comm.id}
                className="h-full origin-left bg-[linear-gradient(135deg,#2abfaa_0%,#1e9bb8_100%)]"
                style={{ animation: `shrink-width ${deleteUndoWindowMs}ms linear forwards` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        @keyframes shrink-width {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </>
  );
}
