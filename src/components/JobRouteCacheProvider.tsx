'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchJobDocuments } from '@/lib/backendDocuments';
import { fetchOutreachPlan } from '@/lib/backendOutreachPlan';
import { fetchTimelineItems } from '@/lib/backendTimeline';
import type { Communication } from '@/types/communication';
import type { DocumentRecord } from '@/types/document';
import type { Job } from '@/types/job';
import type { PostNowStep } from '@/types/postNowPlan';

interface CachedResource<T> {
  data: T;
  loaded: boolean;
}

interface JobRouteCacheContextValue {
  job: Job;
  setJob: (next: Job | ((current: Job) => Job)) => void;
  isBundlePrefetching: boolean;
  communications: CachedResource<Communication[]>;
  setCommunications: (next: Communication[] | ((current: Communication[]) => Communication[])) => void;
  documents: CachedResource<DocumentRecord[]>;
  setDocuments: (next: DocumentRecord[] | ((current: DocumentRecord[]) => DocumentRecord[])) => void;
  outreachPlan: CachedResource<PostNowStep[]>;
  setOutreachPlan: (next: PostNowStep[] | ((current: PostNowStep[]) => PostNowStep[])) => void;
}

const JobRouteCacheContext = createContext<JobRouteCacheContextValue | null>(null);

interface JobRouteCacheEntry {
  job: Job;
  communications: CachedResource<Communication[]>;
  documents: CachedResource<DocumentRecord[]>;
  outreachPlan: CachedResource<PostNowStep[]>;
  prefetchPromise: Promise<void> | null;
}

const jobRouteCacheStore = new Map<string, JobRouteCacheEntry>();

function createEmptyCache<T>(data: T): CachedResource<T> {
  return { data, loaded: false };
}

function createJobRouteCacheEntry(job: Job): JobRouteCacheEntry {
  return {
    job,
    communications: createEmptyCache([]),
    documents: createEmptyCache([]),
    outreachPlan: createEmptyCache([]),
    prefetchPromise: null,
  };
}

function getJobRouteCacheEntry(job: Job) {
  const existing = jobRouteCacheStore.get(job.id);
  if (existing) {
    return existing;
  }

  const created = createJobRouteCacheEntry(job);
  jobRouteCacheStore.set(job.id, created);
  return created;
}

function isJobBundleLoaded(entry: JobRouteCacheEntry) {
  return entry.communications.loaded
    && entry.documents.loaded
    && entry.outreachPlan.loaded;
}

export function JobRouteCacheProvider({
  initialJob,
  children,
}: {
  initialJob: Job;
  children: ReactNode;
}) {
  const cacheEntry = getJobRouteCacheEntry(initialJob);
  const [job, setJobState] = useState(cacheEntry.job);
  const [isBundlePrefetching, setIsBundlePrefetching] = useState(() => !isJobBundleLoaded(cacheEntry));
  const [communications, setCommunicationsState] = useState<CachedResource<Communication[]>>(() => cacheEntry.communications);
  const [documents, setDocumentsState] = useState<CachedResource<DocumentRecord[]>>(() => cacheEntry.documents);
  const [outreachPlan, setOutreachPlanState] = useState<CachedResource<PostNowStep[]>>(() => cacheEntry.outreachPlan);

  const setJob = useCallback((next: Job | ((current: Job) => Job)) => {
    setJobState(current => (typeof next === 'function' ? next(current) : next));
  }, []);

  const setCommunications = useCallback((next: Communication[] | ((current: Communication[]) => Communication[])) => {
    setCommunicationsState(current => ({
      data: typeof next === 'function' ? next(current.data) : next,
      loaded: true,
    }));
  }, []);

  const setDocuments = useCallback((next: DocumentRecord[] | ((current: DocumentRecord[]) => DocumentRecord[])) => {
    setDocumentsState(current => ({
      data: typeof next === 'function' ? next(current.data) : next,
      loaded: true,
    }));
  }, []);

  const setOutreachPlan = useCallback((next: PostNowStep[] | ((current: PostNowStep[]) => PostNowStep[])) => {
    setOutreachPlanState(current => ({
      data: typeof next === 'function' ? next(current.data) : next,
      loaded: true,
    }));
  }, []);

  useEffect(() => {
    const entry = getJobRouteCacheEntry(job);
    entry.job = job;
    entry.communications = communications;
    entry.documents = documents;
    entry.outreachPlan = outreachPlan;
  }, [communications, documents, job, outreachPlan]);

  useEffect(() => {
    const entry = getJobRouteCacheEntry(initialJob);

    if (isJobBundleLoaded(entry)) {
      return;
    }

    if (!entry.prefetchPromise) {
      const startedRequest = (async () => {
        const [nextCommunications, nextDocuments, nextOutreachPlan] = await Promise.all([
          entry.communications.loaded ? entry.communications.data : fetchTimelineItems(initialJob.id),
          entry.documents.loaded ? entry.documents.data : fetchJobDocuments(initialJob.id),
          entry.outreachPlan.loaded ? entry.outreachPlan.data : fetchOutreachPlan(initialJob.id),
        ]);

        entry.communications = { data: nextCommunications, loaded: true };
        entry.documents = { data: nextDocuments, loaded: true };
        entry.outreachPlan = { data: nextOutreachPlan, loaded: true };
      })();
      const trackedRequest = startedRequest.finally(() => {
        if (entry.prefetchPromise === trackedRequest) {
          entry.prefetchPromise = null;
        }
      });
      entry.prefetchPromise = trackedRequest;
    }

    let cancelled = false;

    void entry.prefetchPromise
      .then(() => {
        if (cancelled) return;
        setCommunicationsState(entry.communications);
        setDocumentsState(entry.documents);
        setOutreachPlanState(entry.outreachPlan);
      })
      .catch(() => {
        if (cancelled) return;
      })
      .finally(() => {
        if (cancelled) return;
        setIsBundlePrefetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialJob]);

  const value = useMemo<JobRouteCacheContextValue>(() => ({
    job,
    setJob,
    isBundlePrefetching,
    communications,
    setCommunications,
    documents,
    setDocuments,
    outreachPlan,
    setOutreachPlan,
  }), [
    communications,
    documents,
    isBundlePrefetching,
    job,
    outreachPlan,
    setCommunications,
    setDocuments,
    setJob,
    setOutreachPlan,
  ]);

  return <JobRouteCacheContext.Provider value={value}>{children}</JobRouteCacheContext.Provider>;
}

export function useJobRouteCache() {
  const context = useContext(JobRouteCacheContext);

  if (!context) {
    throw new Error('useJobRouteCache must be used within a JobRouteCacheProvider.');
  }

  return context;
}
