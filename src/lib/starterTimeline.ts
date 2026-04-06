import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { mockCommunications } from '@/data/mockCommunications';
import { mockJobs } from '@/data/mockJobs';
import { logServerEvent } from '@/lib/logging/server';
import type { TraceContext } from '@/lib/logging/shared';
import type { Communication } from '@/types/communication';
import type { Job } from '@/types/job';

interface StarterTimelineTemplate {
  key: string;
  job: Job;
  comms: Communication[];
}

const starterTimelineTemplates: StarterTimelineTemplate[] = mockJobs
  .map(job => ({
    key: job.id,
    job,
    comms: mockCommunications[job.id] ?? [],
  }))
  .filter(template => template.comms.length > 0);

function normalizeList(values: string[]) {
  return [...values]
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function sameValues(left: string[], right: string[]) {
  const normalizedLeft = normalizeList(left);
  const normalizedRight = normalizeList(right);

  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function matchesStarterTemplate(job: Job, templateJob: Job) {
  return job.name === templateJob.name
    && job.address === templateJob.address
    && job.price === templateJob.price
    && sameValues(job.emails, templateJob.emails)
    && sameValues(job.phones, templateJob.phones);
}

function buildSeededTimelineItemId(jobId: string, templateCommId: string) {
  return `starter-${jobId}-${templateCommId}`;
}

function buildSeededTimestamp(date: string, index: number) {
  const parsed = new Date(`${date}T09:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(2026, 0, 1, 9, index, 0)).toISOString();
  }

  parsed.setUTCMinutes(parsed.getUTCMinutes() + index);
  return parsed.toISOString();
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function ensureStarterTimeline(job: Job, trace?: TraceContext) {
  const template = starterTimelineTemplates.find(candidate => matchesStarterTemplate(job, candidate.job));
  if (!template) {
    return 0;
  }

  const supabase = createAdminClient();
  if (!supabase) {
    logServerEvent('warn', 'server-component', 'console.job_communications.starter_timeline.skipped', {
      jobId: job.id,
      reason: 'missing_service_role',
    }, trace);
    return 0;
  }

  const { count, error: countError } = await supabase
    .from('timeline_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id);

  if (countError) {
    throw countError;
  }

  if ((count ?? 0) > 0) {
    return 0;
  }

  const rows = template.comms.map((comm, index) => {
    const timestamp = buildSeededTimestamp(comm.date, index);

    return {
      id: buildSeededTimelineItemId(job.id, comm.id),
      job_id: job.id,
      category: comm.category,
      subtype: comm.subtype ?? null,
      sender: comm.sender ?? null,
      date: comm.date,
      short_description: comm.shortDescription,
      details: comm.details,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });

  const { error: insertError } = await supabase
    .from('timeline_items')
    .upsert(rows, { onConflict: 'id' });

  if (insertError) {
    throw insertError;
  }

  logServerEvent('info', 'server-component', 'console.job_communications.starter_timeline.seeded', {
    jobId: job.id,
    starterTemplateId: template.key,
    insertedCount: rows.length,
  }, trace);

  return rows.length;
}
