'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { logClientEvent, runClientAction, type ClientActionTrace } from '@/lib/logging/client';
import { loggedFetch } from '@/lib/logging/fetch';
import type { Communication } from '@/types/communication';
import type { DocumentRecord } from '@/types/document';
import type { Job } from '@/types/job';
import type { PostNowDraft, PostNowStep } from '@/types/postNowPlan';
import {
  ensureOutreachPlanDrafts,
  fetchOutreachPlan,
  generateOutreachPlan,
  updateOutreachPlanDraft,
} from '@/lib/backendOutreachPlan';
import { fetchJobDocuments, uploadJobDocument } from '@/lib/backendDocuments';
import {
  createTimelineItem,
  deleteTimelineItem,
  fetchTimelineItems,
  linkDocumentToTimelineItem,
  updateTimelineItem,
} from '@/lib/backendTimeline';
import CommForm from './comms/CommForm';
import Timeline from './comms/Timeline';
import PostNowTimeline from './comms/PostNowTimeline';

const deleteUndoWindowMs = 6000;
const defaultHandoverDays = 14;
const draftablePlanStepTypes = new Set<PostNowStep['type']>([
  'email',
  'sms',
  'whatsapp',
  'call',
  'letter-warning',
  'letter-of-claim',
]);

interface PendingUndoDelete {
  comm: Communication;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function sanitizeHandoverDays(value: string, fallback = defaultHandoverDays) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, parsed);
}

function isPastHandover(plannedHandoverAt: string | null) {
  if (!plannedHandoverAt) return false;
  const parsed = new Date(plannedHandoverAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}

function nextPlannedHandoverAt(currentJob: Job, handoverDays: number) {
  if (currentJob.plannedHandoverAt && isPastHandover(currentJob.plannedHandoverAt)) {
    return currentJob.plannedHandoverAt;
  }
  return new Date(Date.now() + handoverDays * 24 * 60 * 60 * 1000).toISOString();
}

function planNeedsDraftRefresh(steps: PostNowStep[]) {
  const now = Date.now();
  const draftWindowEnd = now + (7 * 24 * 60 * 60 * 1000);

  return steps.some(step => {
    if (!draftablePlanStepTypes.has(step.type) || step.draft) return false;
    const scheduledFor = new Date(step.scheduledFor);
    const scheduledTime = scheduledFor.getTime();
    return !Number.isNaN(scheduledTime) && scheduledTime > now && scheduledTime <= draftWindowEnd;
  });
}

export default function JobCommsView({ job }: { job: Job }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [jobState, setJobState] = useState<Job>(job);
  const [comms, setComms] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [postNowSteps, setPostNowSteps] = useState<PostNowStep[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planGenerating, setPlanGenerating] = useState(false);
  const [savingHandoverDays, setSavingHandoverDays] = useState(false);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [editingComm, setEditingComm] = useState<Communication | null>(null);
  const [deleteConfirmComm, setDeleteConfirmComm] = useState<Communication | null>(null);
  const [showRegeneratePlanConfirm, setShowRegeneratePlanConfirm] = useState(false);
  const [pendingUndoDelete, setPendingUndoDelete] = useState<PendingUndoDelete | null>(null);
  const [showTimelineNotice, setShowTimelineNotice] = useState(searchParams.get('notice') === 'timeline-review');
  const [handoverDaysInput, setHandoverDaysInput] = useState(String(job.handoverDays ?? defaultHandoverDays));
  const deleteUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobIdRef = useRef(job.id);

  const hasProcessingDocuments = documents.some(document => document.status === 'processing');
  const hasGeneratedPlan = postNowSteps.length > 0;
  const hasPhoneContact = jobState.phones.some(phone => phone.trim().length > 0);

  useEffect(() => {
    setJobState(job);
    setHandoverDaysInput(String(job.handoverDays ?? defaultHandoverDays));
  }, [job]);

  useEffect(() => {
    activeJobIdRef.current = jobState.id;
  }, [jobState.id]);

  const loadComms = useCallback(async () => {
    setLoading(true);
    try {
      const nextComms = await fetchTimelineItems(jobState.id);
      setComms(nextComms);
      setPageError(null);
    } catch (error) {
      setPageError(errorMessage(error, 'Could not load communications.'));
      setComms([]);
    } finally {
      setLoading(false);
    }
  }, [jobState.id]);

  const loadDocuments = useCallback(async () => {
    try {
      const nextDocuments = await fetchJobDocuments(jobState.id);
      setDocuments(nextDocuments);
    } catch (error) {
      setPageError(errorMessage(error, 'Could not load documents.'));
      setDocuments([]);
    }
  }, [jobState.id]);

  const refreshPlanDrafts = useCallback(async (draftJob: Job) => {
    try {
      const nextPlan = await ensureOutreachPlanDrafts(draftJob);
      if (activeJobIdRef.current !== draftJob.id) return;
      setPostNowSteps(nextPlan);
    } catch (error) {
      if (activeJobIdRef.current !== draftJob.id) return;
      setPageError(errorMessage(error, 'Could not refresh outreach plan drafts.'));
    }
  }, []);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    try {
      const existingPlan = await fetchOutreachPlan(jobState.id);
      if (activeJobIdRef.current !== jobState.id) return;

      setPageError(null);
      setPostNowSteps(existingPlan);

      if (planNeedsDraftRefresh(existingPlan)) {
        void refreshPlanDrafts(jobState);
      }
    } catch (error) {
      if (activeJobIdRef.current !== jobState.id) return;
      setPageError(errorMessage(error, 'Could not load outreach plan.'));
      setPostNowSteps([]);
    } finally {
      if (activeJobIdRef.current !== jobState.id) return;
      setPlanLoading(false);
    }
  }, [jobState, refreshPlanDrafts]);

  useEffect(() => {
    setEditingComm(null);
    setDeleteConfirmComm(null);
    setShowRegeneratePlanConfirm(false);
    setPendingUndoDelete(null);
    if (deleteUndoTimeoutRef.current) {
      clearTimeout(deleteUndoTimeoutRef.current);
      deleteUndoTimeoutRef.current = null;
    }
    void loadComms();
    void loadDocuments();
    void loadPlan();
  }, [jobState.id, loadComms, loadDocuments, loadPlan]);

  useEffect(() => {
    return () => {
      if (deleteUndoTimeoutRef.current) clearTimeout(deleteUndoTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hasProcessingDocuments) return;

    const interval = setInterval(() => {
      void loadDocuments();
    }, 2500);

    return () => clearInterval(interval);
  }, [hasProcessingDocuments, loadDocuments]);

  useEffect(() => {
    setShowTimelineNotice(searchParams.get('notice') === 'timeline-review');
  }, [searchParams]);

  useEffect(() => {
    if (!deleteConfirmComm) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteConfirmComm(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deleteConfirmComm]);

  useEffect(() => {
    if (!showRegeneratePlanConfirm) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowRegeneratePlanConfirm(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showRegeneratePlanConfirm]);

  const persistJobPatch = useCallback(async (payload: Partial<Job>, trace?: ClientActionTrace) => {
    const response = await loggedFetch(`/api/jobs/${jobState.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, {
      name: 'jobs.patch_from_comms',
      context: {
        jobId: jobState.id,
        changedFields: Object.keys(payload),
      },
      trace,
    });
    if (!response.ok) {
      throw new Error('Could not save handover settings.');
    }
    const result = await response.json() as { job: Job };
    setJobState(result.job);
    return result.job;
  }, [jobState.id]);

  const commitHandoverDays = useCallback(async (trace?: ClientActionTrace) => {
    const nextDays = sanitizeHandoverDays(handoverDaysInput, jobState.handoverDays ?? defaultHandoverDays);
    setHandoverDaysInput(String(nextDays));
    if (nextDays === jobState.handoverDays) return jobState;

    setSavingHandoverDays(true);
    try {
      const updatedJob = trace
        ? await persistJobPatch({ handoverDays: nextDays }, trace)
        : await runClientAction('jobs.save_handover_days', async actionTrace =>
          persistJobPatch({ handoverDays: nextDays }, actionTrace), {
          jobId: jobState.id,
          handoverDays: nextDays,
        });
      setPageError(null);
      return updatedJob;
    } catch (error) {
      setPageError(errorMessage(error, 'Could not save handover settings.'));
      throw error;
    } finally {
      setSavingHandoverDays(false);
    }
  }, [handoverDaysInput, jobState, persistJobPatch]);

  const upsertComm = useCallback((saved: Communication) => {
    setComms(prev => {
      const index = prev.findIndex(candidate => candidate.id === saved.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = saved;
        return next;
      }
      return [...prev, saved];
    });
  }, []);

  const handleSave = useCallback(async (comm: Communication) => {
    const updated = { ...comm, jobId: jobState.id };
    try {
      const saved = await runClientAction('communications.save', async trace =>
        editingComm
          ? updateTimelineItem(updated, trace)
          : createTimelineItem(jobState.id, updated, trace), {
        jobId: jobState.id,
        timelineItemId: editingComm?.id ?? null,
        category: updated.category,
        subtype: updated.subtype ?? null,
      });

      upsertComm(saved);
      setEditingComm(null);
      setPageError(null);
    } catch (error) {
      setPageError(errorMessage(error, 'Could not save communication.'));
    }
  }, [editingComm, jobState.id, upsertComm]);

  const removeComm = (id: string) => {
    setComms(prev => prev.filter(comm => comm.id !== id));
    if (editingComm?.id === id) setEditingComm(null);
  };

  const queueUndoToast = (comm: Communication, trace: ClientActionTrace) => {
    if (deleteUndoTimeoutRef.current) clearTimeout(deleteUndoTimeoutRef.current);
    setPendingUndoDelete({ comm });
    deleteUndoTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          logClientEvent('info', 'communications.delete_committed', {
            jobId: comm.jobId,
            timelineItemId: comm.id,
            actionId: trace.actionId,
          }, { sendToServer: true });
          await deleteTimelineItem(comm.id, trace);
          setPageError(null);
        } catch (error) {
          setComms(prev => (prev.some(item => item.id === comm.id) ? prev : [...prev, comm]));
          setPageError(errorMessage(error, 'Could not delete communication.'));
        } finally {
          setPendingUndoDelete(current => (current?.comm.id === comm.id ? null : current));
          deleteUndoTimeoutRef.current = null;
        }
      })();
    }, deleteUndoWindowMs);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmComm) return;
    void runClientAction('communications.delete_requested', async trace => {
      removeComm(deleteConfirmComm.id);
      queueUndoToast(deleteConfirmComm, trace);
      setDeleteConfirmComm(null);
    }, {
      jobId: deleteConfirmComm.jobId,
      timelineItemId: deleteConfirmComm.id,
      category: deleteConfirmComm.category,
      subtype: deleteConfirmComm.subtype ?? null,
    });
  };

  const handleUndoDelete = () => {
    if (!pendingUndoDelete) return;
    if (deleteUndoTimeoutRef.current) {
      clearTimeout(deleteUndoTimeoutRef.current);
      deleteUndoTimeoutRef.current = null;
    }
    setComms(prev => [...prev, pendingUndoDelete.comm]);
    setPendingUndoDelete(null);
    logClientEvent('info', 'communications.delete_undone', {
      jobId: pendingUndoDelete.comm.jobId,
      timelineItemId: pendingUndoDelete.comm.id,
    }, { sendToServer: true });
  };

  const handleGeneratePlan = useCallback(async () => {
    setPlanGenerating(true);
    try {
      await runClientAction('outreach_plan.generate', async trace => {
        const normalizedDays = sanitizeHandoverDays(handoverDaysInput, jobState.handoverDays ?? defaultHandoverDays);
        let nextJob = jobState;
        const patch: Partial<Job> = {};

        if (normalizedDays !== jobState.handoverDays) {
          patch.handoverDays = normalizedDays;
        }

        const nextHandoverAt = nextPlannedHandoverAt(jobState, normalizedDays);
        if (nextHandoverAt !== jobState.plannedHandoverAt) {
          patch.plannedHandoverAt = nextHandoverAt;
        }

        if (Object.keys(patch).length > 0) {
          nextJob = await persistJobPatch(patch, trace);
        }

        setHandoverDaysInput(String(nextJob.handoverDays));
        const generatedPlan = await generateOutreachPlan(nextJob, trace);
        if (activeJobIdRef.current !== nextJob.id) return;
        setPostNowSteps(generatedPlan);
        if (planNeedsDraftRefresh(generatedPlan)) {
          void refreshPlanDrafts(nextJob);
        }
        setShowRegeneratePlanConfirm(false);
        setPageError(null);
      }, {
        jobId: jobState.id,
        hadExistingPlan: hasGeneratedPlan,
      });
    } catch (error) {
      setPageError(errorMessage(error, 'Could not generate outreach plan.'));
    } finally {
      setPlanGenerating(false);
      setPlanLoading(false);
    }
  }, [handoverDaysInput, hasGeneratedPlan, jobState, persistJobPatch, refreshPlanDrafts]);

  const handleLinkDocument = useCallback(async (comm: Communication, documentId: string) => {
    try {
      const updated = await runClientAction('documents.link_to_timeline', async trace =>
        linkDocumentToTimelineItem(comm.id, documentId, trace), {
        jobId: comm.jobId,
        timelineItemId: comm.id,
        documentId,
      });
      setComms(prev => prev.map(item => item.id === updated.id ? updated : item));
      setDocuments(prev => prev.map(document =>
        document.id === documentId
          ? {
              ...document,
              linkedTimelineItemIds: Array.from(new Set([...(document.linkedTimelineItemIds ?? []), comm.id])),
            }
          : document,
      ));
      setPageError(null);
    } catch (error) {
      const message = errorMessage(error, 'Could not relate document.');
      setPageError(message);
      throw new Error(message);
    }
  }, []);

  const handleUploadDocuments = useCallback(async (comm: Communication, files: FileList) => {
    try {
      const uploadedDocuments = await runClientAction('documents.upload_to_timeline', async trace =>
        Promise.all(
          Array.from(files).map(file => uploadJobDocument(jobState.id, file, comm.id, trace)),
        ), {
        jobId: jobState.id,
        timelineItemId: comm.id,
        fileCount: files.length,
      });

      setDocuments(prev => {
        const nextById = new Map(prev.map(document => [document.id, document]));
        uploadedDocuments.forEach(document => nextById.set(document.id, document));
        return Array.from(nextById.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      });
      setComms(prev => prev.map(item =>
        item.id === comm.id
          ? {
              ...item,
              linkedDocumentIds: Array.from(new Set([...(item.linkedDocumentIds ?? []), ...uploadedDocuments.map(document => document.id)])),
            }
          : item,
      ));
      setPageError(null);
    } catch (error) {
      const message = errorMessage(error, 'Could not upload documents.');
      setPageError(message);
      throw new Error(message);
    }
  }, [jobState.id]);

  const handleSavePlanDraft = useCallback(async (draftId: string, payload: { subject?: string; body: string }): Promise<PostNowDraft> => {
    setSavingDraftId(draftId);
    try {
      const savedDraft = await runClientAction('outreach_plan.save_draft', async trace =>
        updateOutreachPlanDraft(draftId, payload, trace), {
        draftId,
        hasSubject: Boolean(payload.subject?.trim()),
      });
      setPostNowSteps(prev => prev.map(step =>
        step.draft?.id === draftId
          ? {
              ...step,
              draft: savedDraft,
            }
          : step,
      ));
      setPageError(null);
      return savedDraft;
    } catch (error) {
      const message = errorMessage(error, 'Could not save outreach plan draft.');
      setPageError(message);
      throw new Error(message);
    } finally {
      setSavingDraftId(current => (current === draftId ? null : current));
    }
  }, []);

  const clearTimelineNotice = () => {
    setShowTimelineNotice(false);
    router.replace(pathname);
  };

  return (
    <>
      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        <aside className="w-[22rem] shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
          <CommForm
            key={editingComm?.id ?? `new-${jobState.id}`}
            job={jobState}
            editing={editingComm}
            onSave={comm => { void handleSave(comm); }}
            onSent={upsertComm}
            onCancelEdit={() => setEditingComm(null)}
          />
        </aside>

        <div className="flex-1 min-w-0 overflow-hidden px-10 py-8">
          <div className="mx-auto flex h-full max-w-2xl flex-col">
            <div className="mb-3 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Timeline</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="space-y-6 pb-2">
                {pageError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {pageError}
                  </div>
                ) : null}
                {loading ? (
                  <div className="py-16 text-center text-sm text-gray-400">Loading communications...</div>
                ) : (
                  <div className="space-y-0">
                    <Timeline
                      comms={comms}
                      documents={documents}
                      plannedHandoverAt={jobState.plannedHandoverAt}
                      onEdit={setEditingComm}
                      onDelete={comm => setDeleteConfirmComm(comm)}
                      onLinkDocument={handleLinkDocument}
                      onUploadDocuments={handleUploadDocuments}
                    />
                  </div>
                )}
                <div>
                  <div className="flex py-3">
                    <div className="w-8 shrink-0" />
                    <div className="relative w-32 shrink-0 self-stretch">
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-gray-200" />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-4 pl-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Outreach plan</p>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {hasGeneratedPlan
                            ? 'Regenerate to replace the saved future plan for this job.'
                            : 'Review the timeline, then generate the next-step plan.'}
                        </p>
                        {!hasPhoneContact ? (
                          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            Add a phone number before generating a plan. Collections are more likely to succeed when calls, SMS, and WhatsApp are available.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-end gap-3">
                        <label className="space-y-1">
                          <span className="block text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                            Days Before Handover
                          </span>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={handoverDaysInput}
                            onChange={event => setHandoverDaysInput(event.target.value)}
                            onBlur={() => { void commitHandoverDays(); }}
                            onKeyDown={event => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void commitHandoverDays();
                              }
                            }}
                            disabled={planGenerating || savingHandoverDays}
                            className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (planGenerating) return;
                            if (hasGeneratedPlan) {
                              setShowRegeneratePlanConfirm(true);
                              return;
                            }
                            void handleGeneratePlan();
                          }}
                          disabled={planGenerating || savingHandoverDays}
                          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium text-white ${(planGenerating || savingHandoverDays) ? 'cursor-wait opacity-70' : 'transition-opacity hover:opacity-90'}`}
                          style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
                        >
                          {planGenerating
                            ? 'Generating...'
                            : hasGeneratedPlan
                              ? 'Regenerate plan'
                              : 'Generate Plan'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <PostNowTimeline
                    steps={postNowSteps}
                    plannedHandoverAt={jobState.plannedHandoverAt}
                    loading={planLoading || planGenerating}
                    savingDraftId={savingDraftId}
                    onSaveDraft={handleSavePlanDraft}
                  />
                </div>
              </div>
            </div>
          </div>
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

      {showRegeneratePlanConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35"
            aria-label="Close regenerate plan confirmation"
            onClick={() => setShowRegeneratePlanConfirm(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regenerate-plan-title"
            className="relative w-full max-w-md rounded-3xl border border-teal-100 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-[#1e9bb8]">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15.55-6.36L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15.55 6.36L3 16" />
              </svg>
            </div>
            <h2 id="regenerate-plan-title" className="mt-4 text-lg font-semibold text-gray-900">Are you sure?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Regenerating the outreach plan will replace the current future steps for this job.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRegeneratePlanConfirm(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleGeneratePlan(); }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
              >
                Regenerate plan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTimelineNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35"
            aria-label="Close timeline review notice"
            onClick={clearTimelineNotice}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-3xl border border-teal-100 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-[#1e9bb8]">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Review the timeline</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              We&apos;ve tried to process your documentation into an accurate timeline, but we cannot guarantee it&apos;s correct. You can upload more documents on the Documents tab if you wish. Once you&apos;ve checked it, and added any communications not included in the uploaded documentation, hit Generate Plan to create an optimised Collexis outreach plan.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={clearTimelineNotice}
                className="rounded-xl px-4 py-2 text-sm font-medium text-[#1e9bb8] transition-colors hover:bg-[#e7f7fb]"
              >
                Understood
              </button>
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
