import type { LogEntry } from './shared';

const LOG_INSERT_PATH = '/rest/v1/app_logs';
const FAILURE_THROTTLE_MS = 60_000;

let missingConfigWarned = false;
let lastPersistenceWarningAt = 0;

function maybeWarn(message: string, detail?: string) {
  const now = Date.now();
  if (now - lastPersistenceWarningAt < FAILURE_THROTTLE_MS) {
    return;
  }

  lastPersistenceWarningAt = now;
  if (detail) {
    console.warn(`[logging.persistence] ${message}`, detail);
    return;
  }

  console.warn(`[logging.persistence] ${message}`);
}

function supabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    if (!missingConfigWarned) {
      missingConfigWarned = true;
      maybeWarn('Persistent log storage is disabled because Supabase service-role config is missing.');
    }
    return null;
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    serviceRoleKey,
  };
}

function normalizeError(entry: LogEntry) {
  const error = entry.context && typeof entry.context === 'object'
    ? (entry.context as Record<string, unknown>).error
    : undefined;

  if (error == null) {
    return null;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function persistLogEntry(entry: LogEntry) {
  if (typeof window !== 'undefined' || process.env.NODE_ENV === 'test') {
    return;
  }

  const config = supabaseConfig();
  if (!config) {
    return;
  }

  try {
    const response = await fetch(`${config.supabaseUrl}${LOG_INSERT_PATH}`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.level,
        source: entry.source,
        event: entry.event,
        request_id: entry.requestId ?? null,
        action_id: entry.actionId ?? null,
        session_id: entry.sessionId ?? null,
        context: entry.context ?? null,
        error: normalizeError(entry),
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim().slice(0, 240);
      maybeWarn(`Supabase log write failed with status ${response.status}.`, detail || undefined);
    }
  } catch (error) {
    maybeWarn('Supabase log write threw an exception.', error instanceof Error ? error.message : String(error));
  }
}
