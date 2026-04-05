import { createAdminClient } from '@/lib/supabase/admin';

export type AuditAction =
  | 'job.created'
  | 'job.updated'
  | 'job.deleted'
  | 'communication.sent'
  | 'timeline_item.deleted'
  | 'outreach_plan.generated';

export type AuditEntityType = 'job' | 'communication' | 'timeline_item' | 'outreach_plan';

interface AuditEventInput {
  occurredAt?: string;
  actorUserId?: string | null;
  action: AuditAction;
  jobId?: string | null;
  entityType: AuditEntityType;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

function compactMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

export async function recordAuditEvent(input: AuditEventInput) {
  const supabase = createAdminClient();
  const payload: {
    occurred_at?: string;
    actor_user_id: string | null;
    action: AuditAction;
    job_id: string | null;
    entity_type: AuditEntityType;
    entity_id: string | null;
    metadata: Record<string, unknown>;
  } = {
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    job_id: input.jobId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: compactMetadata(input.metadata),
  };

  if (input.occurredAt) {
    payload.occurred_at = input.occurredAt;
  }

  const { error } = await supabase.from('audit_events').insert(payload);
  if (error) {
    throw error;
  }
}
