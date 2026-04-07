'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  communications: CachedResource<Communication[]>;
  setCommunications: (next: Communication[] | ((current: Communication[]) => Communication[])) => void;
  documents: CachedResource<DocumentRecord[]>;
  setDocuments: (next: DocumentRecord[] | ((current: DocumentRecord[]) => DocumentRecord[])) => void;
  outreachPlan: CachedResource<PostNowStep[]>;
  setOutreachPlan: (next: PostNowStep[] | ((current: PostNowStep[]) => PostNowStep[])) => void;
}

const JobRouteCacheContext = createContext<JobRouteCacheContextValue | null>(null);

function createEmptyCache<T>(data: T): CachedResource<T> {
  return { data, loaded: false };
}

export function JobRouteCacheProvider({
  initialJob,
  children,
}: {
  initialJob: Job;
  children: ReactNode;
}) {
  const [job, setJobState] = useState(initialJob);
  const [communications, setCommunicationsState] = useState<CachedResource<Communication[]>>(() => createEmptyCache([]));
  const [documents, setDocumentsState] = useState<CachedResource<DocumentRecord[]>>(() => createEmptyCache([]));
  const [outreachPlan, setOutreachPlanState] = useState<CachedResource<PostNowStep[]>>(() => createEmptyCache([]));

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

  const value = useMemo<JobRouteCacheContextValue>(() => ({
    job,
    setJob,
    communications,
    setCommunications,
    documents,
    setDocuments,
    outreachPlan,
    setOutreachPlan,
  }), [communications, documents, job, outreachPlan, setCommunications, setDocuments, setJob, setOutreachPlan]);

  return <JobRouteCacheContext.Provider value={value}>{children}</JobRouteCacheContext.Provider>;
}

export function useJobRouteCache() {
  const context = useContext(JobRouteCacheContext);

  if (!context) {
    throw new Error('useJobRouteCache must be used within a JobRouteCacheProvider.');
  }

  return context;
}
