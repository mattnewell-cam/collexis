'use client';

import { useEffect, useRef, useState } from 'react';
import { Communication } from '@/types/communication';
import { PostNowStep } from '@/types/postNowPlan';
import { mockCommunications } from '@/data/mockCommunications';
import { clonePostNowPlans } from '@/data/mockPostNowPlans';
import CommForm from './comms/CommForm';
import Timeline from './comms/Timeline';
import PostNowTimeline from './comms/PostNowTimeline';

const deleteUndoWindowMs = 6000;

interface PendingUndoDelete {
  comm: Communication;
}

export default function JobCommsView({ jobId }: { jobId: string }) {
  const [comms, setComms] = useState<Communication[]>(() => mockCommunications[jobId] ?? []);
  const [postNowSteps, setPostNowSteps] = useState<PostNowStep[]>(() => clonePostNowPlans()[jobId] ?? []);
  const [editingComm, setEditingComm] = useState<Communication | null>(null);
  const [deleteConfirmComm, setDeleteConfirmComm] = useState<Communication | null>(null);
  const [pendingUndoDelete, setPendingUndoDelete] = useState<PendingUndoDelete | null>(null);
  const deleteUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultPostNowSender = comms.some(c => c.category === 'collexis-handover') ? 'collexis' : 'you';

  useEffect(() => {
    return () => {
      if (deleteUndoTimeoutRef.current) clearTimeout(deleteUndoTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!deleteConfirmComm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeleteConfirmComm(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deleteConfirmComm]);

  const handleSave = (comm: Communication) => {
    const updated = { ...comm, jobId };
    setComms(prev => {
      const idx = prev.findIndex(c => c.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    setEditingComm(null);
  };

  const removeComm = (id: string) => {
    setComms(prev => prev.filter(c => c.id !== id));
    if (editingComm?.id === id) setEditingComm(null);
  };

  const queueUndoToast = (comm: Communication) => {
    if (deleteUndoTimeoutRef.current) clearTimeout(deleteUndoTimeoutRef.current);
    setPendingUndoDelete({ comm });
    deleteUndoTimeoutRef.current = setTimeout(() => {
      setPendingUndoDelete(current => (current?.comm.id === comm.id ? null : current));
      deleteUndoTimeoutRef.current = null;
    }, deleteUndoWindowMs);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmComm) return;
    removeComm(deleteConfirmComm.id);
    queueUndoToast(deleteConfirmComm);
    setDeleteConfirmComm(null);
  };

  const handleUndoDelete = () => {
    if (!pendingUndoDelete) return;
    if (deleteUndoTimeoutRef.current) {
      clearTimeout(deleteUndoTimeoutRef.current);
      deleteUndoTimeoutRef.current = null;
    }
    setComms(prev => [...prev, pendingUndoDelete.comm]);
    setPendingUndoDelete(null);
  };

  const handlePostNowDelayChange = (id: string, delayDays: number) => {
    setPostNowSteps(prev => prev.map(s => s.id === id ? { ...s, delayDays } : s));
  };

  const handlePostNowSenderChange = (id: string, sender: 'you' | 'collexis') => {
    setPostNowSteps(prev => prev.map(s => s.id === id ? { ...s, sender } : s));
  };

  const handleInsertPostNowStep = (index: number, step: PostNowStep) => {
    setPostNowSteps(prev => [...prev.slice(0, index), step, ...prev.slice(index)]);
  };

  return (
    <>
      <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
        {/* CommForm sidebar */}
        <aside className="w-[22rem] shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
          <CommForm
            key={editingComm?.id ?? `new-${jobId}`}
            editing={editingComm}
            onSave={handleSave}
            onCancelEdit={() => setEditingComm(null)}
          />
        </aside>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div className="space-y-4 max-w-2xl mx-auto">
            <Timeline
              comms={comms}
              onEdit={setEditingComm}
              onDelete={comm => setDeleteConfirmComm(comm)}
            />
            <PostNowTimeline
              steps={postNowSteps}
              defaultSender={defaultPostNowSender}
              onDelayChange={handlePostNowDelayChange}
              onSenderChange={handlePostNowSenderChange}
              onInsertStep={handleInsertPostNowStep}
            />
          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
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
              Delete &ldquo;{deleteConfirmComm.shortDescription}&rdquo; from this communications timeline? You&rsquo;ll be able to undo it for 6 seconds afterwards.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirmComm(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmDelete} className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600">
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Undo toast */}
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
                <p className="mt-1 text-sm text-gray-500">&ldquo;{pendingUndoDelete.comm.shortDescription}&rdquo; was removed.</p>
              </div>
              <button type="button" onClick={handleUndoDelete} className="rounded-xl px-3 py-2 text-sm font-medium text-[#1e9bb8] transition-colors hover:bg-[#e7f7fb]">
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
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </>
  );
}
