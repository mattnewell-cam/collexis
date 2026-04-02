import {
  createRequestId,
  sanitizeLogContext,
  serializeError,
  type LogContext,
  type LogEntry,
  type LogLevel,
} from './shared';

const CLIENT_LOG_ENDPOINT = '/api/client-logs';
const CLIENT_LOG_SESSION_KEY = 'collexis.logging.sessionId';

export interface ClientActionTrace {
  actionId: string;
  sessionId?: string;
}

interface ClientLogOptions {
  sendToServer?: boolean;
}

function consoleMethod(level: LogLevel) {
  switch (level) {
    case 'debug':
      return console.debug;
    case 'warn':
      return console.warn;
    case 'error':
      return console.error;
    default:
      return console.info;
  }
}

function browserSessionId() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const existing = window.sessionStorage.getItem(CLIENT_LOG_SESSION_KEY);
  if (existing) {
    return existing;
  }

  const created = createRequestId();
  window.sessionStorage.setItem(CLIENT_LOG_SESSION_KEY, created);
  return created;
}

function shipClientLog(entry: LogEntry) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload = JSON.stringify(entry);
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const queued = navigator.sendBeacon(CLIENT_LOG_ENDPOINT, new Blob([payload], { type: 'application/json' }));
    if (queued) {
      return;
    }
  }

  void fetch(CLIENT_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

export function logClientEvent(
  level: LogLevel,
  event: string,
  context?: LogContext,
  options: ClientLogOptions = {},
) {
  const actionId = typeof context?.actionId === 'string' ? context.actionId : undefined;
  const requestId = typeof context?.requestId === 'string' ? context.requestId : undefined;
  const sessionId = typeof context?.sessionId === 'string' ? context.sessionId : browserSessionId();
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source: 'client',
    event,
    requestId,
    actionId,
    sessionId,
    context: sanitizeLogContext(context),
  };

  consoleMethod(level)(`[client:${event}]`, entry);

  if (options.sendToServer) {
    shipClientLog(entry);
  }

  return entry;
}

export function createClientActionTrace(actionId = createRequestId()): ClientActionTrace {
  return {
    actionId,
    sessionId: browserSessionId(),
  };
}

export async function runClientAction<T>(
  action: string,
  work: (trace: ClientActionTrace) => Promise<T> | T,
  context?: LogContext,
): Promise<T> {
  const trace = createClientActionTrace();
  const startedAt = Date.now();
  const baseContext = sanitizeLogContext(context);

  logClientEvent('info', `${action}.started`, {
    ...baseContext,
    actionId: trace.actionId,
  }, { sendToServer: true });

  try {
    const result = await work(trace);
    logClientEvent('info', `${action}.succeeded`, {
      ...baseContext,
      actionId: trace.actionId,
      durationMs: Date.now() - startedAt,
    }, { sendToServer: true });
    return result;
  } catch (error) {
    logClientEvent('error', `${action}.failed`, {
      ...baseContext,
      actionId: trace.actionId,
      durationMs: Date.now() - startedAt,
      error: serializeError(error),
    }, { sendToServer: true });
    throw error;
  }
}
