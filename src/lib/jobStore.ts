import type { SupabaseClient } from '@supabase/supabase-js';
import type { Job, JobIntakeSummary, JobUpdatePayload } from '@/types/job';
import { normalizePhoneForComparison } from './phoneNumbers';
import { normalizeEmail } from './authSession';

interface DbJobRow {
  id: string;
  user_id: string;
  name: string;
  address: string;
  job_description: string;
  job_detail: string;
  due_date: string;
  price: number;
  amount_paid: number;
  status: string;
  emails: string[];
  phones: string[];
  invoice_documents: string[];
  context_instructions: string;
  handover_days: number;
  planned_handover_at: string | null;
  created_at: string;
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

function rowToJob(row: DbJobRow): Job {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    jobDescription: row.job_description,
    jobDetail: row.job_detail,
    dueDate: row.due_date,
    price: Number(row.price),
    amountPaid: Number(row.amount_paid),
    daysOverdue: calculateDaysOverdue(row.due_date),
    status: row.status as Job['status'],
    emails: row.emails ?? [],
    phones: row.phones ?? [],
    invoiceDocuments: row.invoice_documents ?? [],
    contextInstructions: row.context_instructions,
    handoverDays: row.handover_days,
    plannedHandoverAt: row.planned_handover_at,
  };
}

export async function getAllJobs(supabase: SupabaseClient): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data as DbJobRow[]).map(rowToJob);
}

export async function findJobById(jobId: string, supabase: SupabaseClient): Promise<Job | undefined> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single<DbJobRow>();

  if (error || !data) return undefined;

  return rowToJob(data);
}

export async function findJobsByEmail(email: string, supabase: SupabaseClient): Promise<Job[]> {
  const normalizedTarget = normalizeEmail(email);
  if (!normalizedTarget) return [];

  const jobs = await getAllJobs(supabase);
  return jobs.filter(job =>
    job.emails.some(candidate => normalizeEmail(candidate) === normalizedTarget),
  );
}

export async function findJobsByPhone(phone: string, supabase: SupabaseClient): Promise<Job[]> {
  const normalizedTarget = normalizePhoneForComparison(phone);
  if (!normalizedTarget) return [];

  const jobs = await getAllJobs(supabase);
  return jobs.filter(job =>
    job.phones.some(candidate => normalizePhoneForComparison(candidate) === normalizedTarget),
  );
}

interface CreateJobInput {
  name: string;
  address: string;
  documents: string[];
}

export async function createJob(
  supabase: SupabaseClient,
  userId: string,
  input: CreateJobInput,
): Promise<Job> {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      user_id: userId,
      name: input.name,
      address: input.address,
      job_description: '',
      job_detail: '',
      due_date: '',
      price: 0,
      amount_paid: 0,
      status: 'Initial wait',
      emails: [],
      phones: [],
      invoice_documents: input.documents,
      context_instructions: '',
      handover_days: 14,
      planned_handover_at: null,
    })
    .select()
    .single<DbJobRow>();

  if (error || !data) throw error ?? new Error('Failed to create job');

  return rowToJob(data);
}

function normalizeJobUpdate(payload: unknown): JobUpdatePayload {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const update: JobUpdatePayload = {};

  const str = (key: string) =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined;
  const num = (key: string) =>
    typeof record[key] === 'number' && Number.isFinite(record[key])
      ? (record[key] as number)
      : undefined;
  const int = (key: string) => {
    const v = num(key);
    return v !== undefined ? Math.max(0, Math.floor(v)) : undefined;
  };
  const arr = (key: string) =>
    Array.isArray(record[key])
      ? (record[key] as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined;

  const name = str('name'); if (name !== undefined) update.name = name;
  const address = str('address'); if (address !== undefined) update.address = address;
  const jobDescription = str('jobDescription'); if (jobDescription !== undefined) update.jobDescription = jobDescription;
  const jobDetail = str('jobDetail'); if (jobDetail !== undefined) update.jobDetail = jobDetail;
  const dueDate = str('dueDate'); if (dueDate !== undefined) update.dueDate = dueDate;
  const price = num('price'); if (price !== undefined) update.price = price;
  const amountPaid = num('amountPaid'); if (amountPaid !== undefined) update.amountPaid = amountPaid;
  const daysOverdue = num('daysOverdue'); if (daysOverdue !== undefined) update.daysOverdue = Math.max(0, Math.floor(daysOverdue));
  const status = str('status'); if (status !== undefined) update.status = status as Job['status'];
  const emails = arr('emails'); if (emails !== undefined) update.emails = emails;
  const phones = arr('phones'); if (phones !== undefined) update.phones = phones;
  const invoiceDocuments = arr('invoiceDocuments'); if (invoiceDocuments !== undefined) update.invoiceDocuments = invoiceDocuments;
  const contextInstructions = str('contextInstructions'); if (contextInstructions !== undefined) update.contextInstructions = contextInstructions;
  const handoverDays = int('handoverDays'); if (handoverDays !== undefined) update.handoverDays = handoverDays;

  if (record.plannedHandoverAt === null) {
    update.plannedHandoverAt = null;
  } else {
    const plannedHandoverAt = str('plannedHandoverAt');
    if (plannedHandoverAt !== undefined) update.plannedHandoverAt = plannedHandoverAt.trim() || null;
  }

  return update;
}

export async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  payload: unknown,
): Promise<Job> {
  const update = normalizeJobUpdate(payload);

  const dbUpdate: Record<string, unknown> = {};
  if (update.name !== undefined) dbUpdate.name = update.name;
  if (update.address !== undefined) dbUpdate.address = update.address;
  if (update.jobDescription !== undefined) dbUpdate.job_description = update.jobDescription;
  if (update.jobDetail !== undefined) dbUpdate.job_detail = update.jobDetail;
  if (update.dueDate !== undefined) dbUpdate.due_date = update.dueDate;
  if (update.price !== undefined) dbUpdate.price = update.price;
  if (update.amountPaid !== undefined) dbUpdate.amount_paid = update.amountPaid;
  if (update.status !== undefined) dbUpdate.status = update.status;
  if (update.emails !== undefined) dbUpdate.emails = update.emails;
  if (update.phones !== undefined) dbUpdate.phones = update.phones;
  if (update.invoiceDocuments !== undefined) dbUpdate.invoice_documents = update.invoiceDocuments;
  if (update.contextInstructions !== undefined) dbUpdate.context_instructions = update.contextInstructions;
  if (update.handoverDays !== undefined) dbUpdate.handover_days = update.handoverDays;
  if ('plannedHandoverAt' in update) dbUpdate.planned_handover_at = update.plannedHandoverAt;
  dbUpdate.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('jobs')
    .update(dbUpdate)
    .eq('id', jobId)
    .select()
    .single<DbJobRow>();

  if (error || !data) throw error ?? new Error('Failed to update job');

  return rowToJob(data);
}

export async function deleteJob(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  if (error) throw error;
}

export function isOutstandingJob(status: Job['status']) {
  return status !== 'Paid' && status !== 'Abandoned';
}

function isBlankString(value: string) {
  return value.trim() === '';
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)));
}

function mergeTextBlock(currentValue: string, incomingValue: string) {
  const current = currentValue.trim();
  const incoming = incomingValue.trim();

  if (!incoming) return current;
  if (!current) return incoming;
  if (current.includes(incoming)) return current;
  if (incoming.includes(current)) return incoming;

  return `${current}\n\n${incoming}`;
}

export function mergeJobWithIntakeSummary(job: Job, summary: JobIntakeSummary, referenceDate = new Date()): Job {
  const nextJob = { ...job };

  if (isBlankString(nextJob.address) && !isBlankString(summary.address))
    nextJob.address = summary.address.trim();

  if (isBlankString(nextJob.jobDescription) && !isBlankString(summary.jobDescription))
    nextJob.jobDescription = summary.jobDescription.trim();

  if (isBlankString(nextJob.jobDetail) && !isBlankString(summary.jobDetail))
    nextJob.jobDetail = summary.jobDetail.trim();

  if (isBlankString(nextJob.dueDate) && summary.dueDate) {
    nextJob.dueDate = summary.dueDate;
    nextJob.daysOverdue = calculateDaysOverdue(summary.dueDate, referenceDate);
  }

  if (nextJob.price === 0 && summary.price !== null)
    nextJob.price = summary.price;

  if (nextJob.amountPaid === 0 && summary.amountPaid !== null)
    nextJob.amountPaid = summary.amountPaid;

  if (summary.emails.length > 0)
    nextJob.emails = uniqueNonEmpty([...nextJob.emails, ...summary.emails]);

  if (summary.phones.length > 0)
    nextJob.phones = uniqueNonEmpty([...nextJob.phones, ...summary.phones]);

  return nextJob;
}

export function refreshJobFromIntakeSummary(job: Job, summary: JobIntakeSummary, referenceDate = new Date()): Job {
  const nextJob = mergeJobWithIntakeSummary(job, summary, referenceDate);

  nextJob.jobDetail = mergeTextBlock(nextJob.jobDetail, summary.jobDetail);

  return nextJob;
}

function chooseReviewedText(currentValue: string, reviewedValue: string) {
  const trimmedReviewedValue = reviewedValue.trim();
  return trimmedReviewedValue || currentValue;
}

export function applyReviewedJobIntakeSummary(job: Job, summary: JobIntakeSummary, referenceDate = new Date()): Job {
  const dueDate = summary.dueDate || job.dueDate;

  return {
    ...job,
    address: chooseReviewedText(job.address, summary.address),
    jobDescription: chooseReviewedText(job.jobDescription, summary.jobDescription),
    jobDetail: chooseReviewedText(job.jobDetail, summary.jobDetail),
    dueDate,
    price: summary.price ?? job.price,
    amountPaid: summary.amountPaid ?? job.amountPaid,
    daysOverdue: calculateDaysOverdue(dueDate, referenceDate),
    emails: summary.emails.length > 0 ? uniqueNonEmpty([...job.emails, ...summary.emails]) : job.emails,
    phones: summary.phones.length > 0 ? uniqueNonEmpty([...job.phones, ...summary.phones]) : job.phones,
    contextInstructions: job.contextInstructions,
  };
}
