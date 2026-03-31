import { LEGACY_JOBS_OWNER_EMAIL, normalizeEmail, readAuthenticatedEmail } from '@/lib/authSession';
import { mockJobs } from '@/data/mockJobs';
import { Job, JobIntakeSummary, JobUpdatePayload } from '@/types/job';
import { normalizePhoneForComparison } from './phoneNumbers';

export const ADDED_JOBS_COOKIE = 'collexis-added-jobs';
export const DELETED_JOBS_COOKIE = 'collexis-deleted-jobs';

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

interface CreateJobInput {
  name: string;
  address: string;
  documents: string[];
}

function getOwnerCookieSuffix(ownerEmail: string) {
  return normalizeEmail(ownerEmail)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getAddedJobsCookieName(ownerEmail: string) {
  if (normalizeEmail(ownerEmail) === LEGACY_JOBS_OWNER_EMAIL) {
    return ADDED_JOBS_COOKIE;
  }

  return `${ADDED_JOBS_COOKIE}-${getOwnerCookieSuffix(ownerEmail)}`;
}

export function getDeletedJobsCookieName(ownerEmail: string) {
  if (normalizeEmail(ownerEmail) === LEGACY_JOBS_OWNER_EMAIL) {
    return DELETED_JOBS_COOKIE;
  }

  return `${DELETED_JOBS_COOKIE}-${getOwnerCookieSuffix(ownerEmail)}`;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function normalizeJob(value: unknown): Job | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;

  return {
    id: record.id,
    name: record.name,
    address: typeof record.address === 'string' ? record.address : '',
    jobDescription: typeof record.jobDescription === 'string' ? record.jobDescription : '',
    jobDetail: typeof record.jobDetail === 'string' ? record.jobDetail : '',
    dueDate: typeof record.dueDate === 'string' ? record.dueDate : '',
    price: typeof record.price === 'number' ? record.price : 0,
    amountPaid: typeof record.amountPaid === 'number' ? record.amountPaid : 0,
    daysOverdue: typeof record.daysOverdue === 'number' ? record.daysOverdue : 0,
    status:
      typeof record.status === 'string'
        ? record.status as Job['status']
        : 'Initial wait',
    emails: normalizeStringArray(record.emails),
    phones: normalizeStringArray(record.phones),
    invoiceDocuments: normalizeStringArray(record.invoiceDocuments),
    contextInstructions:
      typeof record.contextInstructions === 'string' ? record.contextInstructions : '',
  };
}

function normalizeJobUpdate(value: unknown): JobUpdatePayload {
  if (!value || typeof value !== 'object') return {};

  const record = value as Record<string, unknown>;
  const update: JobUpdatePayload = {};

  const address = normalizeOptionalString(record.address);
  if (address !== undefined) update.address = address;

  const jobDescription = normalizeOptionalString(record.jobDescription);
  if (jobDescription !== undefined) update.jobDescription = jobDescription;

  const jobDetail = normalizeOptionalString(record.jobDetail);
  if (jobDetail !== undefined) update.jobDetail = jobDetail;

  const dueDate = normalizeOptionalString(record.dueDate);
  if (dueDate !== undefined) update.dueDate = dueDate;

  const name = normalizeOptionalString(record.name);
  if (name !== undefined) update.name = name;

  const price = normalizeOptionalNumber(record.price);
  if (price !== undefined) update.price = price;

  const amountPaid = normalizeOptionalNumber(record.amountPaid);
  if (amountPaid !== undefined) update.amountPaid = amountPaid;

  const daysOverdue = normalizeOptionalNumber(record.daysOverdue);
  if (daysOverdue !== undefined) update.daysOverdue = Math.max(0, Math.floor(daysOverdue));

  const status = normalizeOptionalString(record.status);
  if (status !== undefined) update.status = status as Job['status'];

  if (Array.isArray(record.emails)) update.emails = normalizeStringArray(record.emails);
  if (Array.isArray(record.phones)) update.phones = normalizeStringArray(record.phones);
  if (Array.isArray(record.invoiceDocuments)) update.invoiceDocuments = normalizeStringArray(record.invoiceDocuments);

  const contextInstructions = normalizeOptionalString(record.contextInstructions);
  if (contextInstructions !== undefined) update.contextInstructions = contextInstructions;

  return update;
}

export function parseAddedJobsCookieValue(value?: string) {
  if (!value) return [] as Job[];

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeJob)
      .filter((job): job is Job => job !== null);
  } catch {
    return [];
  }
}

export function getAddedJobs(cookieStore: CookieReader) {
  const ownerEmail = readAuthenticatedEmail(cookieStore);
  if (!ownerEmail) {
    return [];
  }

  return parseAddedJobsCookieValue(cookieStore.get(getAddedJobsCookieName(ownerEmail))?.value);
}

export function parseDeletedJobsCookieValue(value?: string) {
  if (!value) return [] as string[];

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(parsed.filter((jobId): jobId is string => typeof jobId === 'string')),
    );
  } catch {
    return [];
  }
}

export function getDeletedJobIds(cookieStore: CookieReader) {
  const ownerEmail = readAuthenticatedEmail(cookieStore);
  if (!ownerEmail) {
    return [];
  }

  return parseDeletedJobsCookieValue(cookieStore.get(getDeletedJobsCookieName(ownerEmail))?.value);
}

export function serializeDeletedJobIds(jobIds: string[]) {
  return encodeURIComponent(JSON.stringify(Array.from(new Set(jobIds))));
}

export function mergeJobs(baseJobs: Job[], addedJobs: Job[]) {
  const jobsById = new Map(baseJobs.map(job => [job.id, job]));
  for (const job of addedJobs) jobsById.set(job.id, job);

  return Array.from(jobsById.values()).sort((left, right) => {
    const leftId = Number(left.id);
    const rightId = Number(right.id);

    if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
      return leftId - rightId;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getAllJobs(cookieStore?: CookieReader) {
  if (!cookieStore) {
    return [...mockJobs];
  }

  const ownerEmail = readAuthenticatedEmail(cookieStore);
  const deletedJobIds = new Set(getDeletedJobIds(cookieStore));
  const baseJobs = ownerEmail === LEGACY_JOBS_OWNER_EMAIL ? mockJobs : [];
  const visibleBaseJobs = baseJobs.filter(job => !deletedJobIds.has(job.id));

  return mergeJobs(visibleBaseJobs, getAddedJobs(cookieStore));
}

export function findJobById(jobId: string, cookieStore?: CookieReader) {
  return getAllJobs(cookieStore).find(job => job.id === jobId);
}

export function findJobsByEmail(email: string, jobs: Job[]) {
  const normalizedTarget = normalizeEmail(email);
  if (!normalizedTarget) return [];

  return jobs.filter(job =>
    job.emails.some(candidate => normalizeEmail(candidate) === normalizedTarget),
  );
}

export function findJobsByPhone(phone: string, jobs: Job[]) {
  const normalizedTarget = normalizePhoneForComparison(phone);
  if (!normalizedTarget) return [];

  return jobs.filter(job =>
    job.phones.some(candidate => normalizePhoneForComparison(candidate) === normalizedTarget),
  );
}

export function isOutstandingJob(status: Job['status']) {
  return status !== 'Paid' && status !== 'Abandoned';
}

export function createStoredJob(input: CreateJobInput, existingJobs: Job[]): Job {
  const maxExistingId = existingJobs.reduce((maxId, job) => {
    const numericId = Number(job.id);
    return Number.isFinite(numericId) ? Math.max(maxId, numericId) : maxId;
  }, 0);

  return {
    id: String(maxExistingId + 1),
    name: input.name,
    address: input.address,
    jobDescription: '',
    jobDetail: '',
    dueDate: '',
    price: 0,
    amountPaid: 0,
    daysOverdue: 0,
    status: 'Initial wait',
    emails: [],
    phones: [],
    invoiceDocuments: input.documents,
    contextInstructions: '',
  };
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function calculateDaysOverdue(dueDate: string, referenceDate = new Date()) {
  if (!dueDate) return 0;

  const parsedDueDate = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(parsedDueDate.getTime())) return 0;

  const utcToday = startOfUtcDay(referenceDate);
  const utcDueDate = startOfUtcDay(parsedDueDate);
  const differenceMs = utcToday.getTime() - utcDueDate.getTime();
  if (differenceMs <= 0) return 0;

  return Math.floor(differenceMs / (1000 * 60 * 60 * 24));
}

function isBlankString(value: string) {
  return value.trim() === '';
}

function shouldFillString(value: string) {
  return isBlankString(value);
}

function shouldFillNumeric(value: number) {
  return value === 0;
}

function shouldFillArray(value: string[]) {
  return value.length === 0;
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

export function mergeJobWithIntakeSummary(job: Job, summary: JobIntakeSummary, referenceDate = new Date()): Job {
  const nextJob = { ...job };

  if (shouldFillString(nextJob.jobDescription) && !isBlankString(summary.jobDescription)) {
    nextJob.jobDescription = summary.jobDescription.trim();
  }

  if (shouldFillString(nextJob.jobDetail) && !isBlankString(summary.jobDetail)) {
    nextJob.jobDetail = summary.jobDetail.trim();
  }

  if (shouldFillString(nextJob.dueDate) && summary.dueDate) {
    nextJob.dueDate = summary.dueDate;
    nextJob.daysOverdue = calculateDaysOverdue(summary.dueDate, referenceDate);
  }

  if (shouldFillNumeric(nextJob.price) && summary.price !== null) {
    nextJob.price = summary.price;
  }

  if (shouldFillNumeric(nextJob.amountPaid) && summary.amountPaid !== null) {
    nextJob.amountPaid = summary.amountPaid;
  }

  if (shouldFillArray(nextJob.emails) && summary.emails.length > 0) {
    nextJob.emails = uniqueNonEmpty(summary.emails);
  }

  if (shouldFillArray(nextJob.phones) && summary.phones.length > 0) {
    nextJob.phones = uniqueNonEmpty(summary.phones);
  }

  if (shouldFillString(nextJob.contextInstructions) && !isBlankString(summary.contextInstructions)) {
    nextJob.contextInstructions = summary.contextInstructions.trim();
  }

  return nextJob;
}

export function applyJobUpdate(job: Job, payload: unknown): Job {
  const update = normalizeJobUpdate(payload);
  const nextJob = {
    ...job,
    ...update,
  };

  if (update.dueDate !== undefined) {
    nextJob.daysOverdue = calculateDaysOverdue(nextJob.dueDate);
  } else if (update.daysOverdue !== undefined) {
    nextJob.daysOverdue = update.daysOverdue;
  }

  return nextJob;
}

export function upsertAddedJob(addedJobs: Job[], job: Job) {
  const index = addedJobs.findIndex(candidate => candidate.id === job.id);
  if (index === -1) return [...addedJobs, job];

  return addedJobs.map(candidate => (candidate.id === job.id ? job : candidate));
}

export function serializeAddedJobs(addedJobs: Job[]) {
  return encodeURIComponent(JSON.stringify(addedJobs));
}
