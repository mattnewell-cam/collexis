import { logClientEvent } from './client';
import { logServerEvent } from './server';
import {
  LOG_HEADER_ACTION_ID,
  LOG_HEADER_REQUEST_ID,
  LOG_HEADER_SESSION_ID,
  LOG_HEADER_TRACE_ORIGIN,
  createRequestId,
  sanitizeUrlForLogs,
  serializeError,
  type LogContext,
  type TraceContext,
} from './shared';

interface LoggedFetchOptions {
  name: string;
  context?: LogContext;
  trace?: TraceContext;
  source?: 'client' | 'next-api';
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function buildHeaders(headers: HeadersInit | undefined, trace: TraceContext | undefined, source: 'client' | 'next-api') {
  const nextHeaders = new Headers(headers);
  const requestId = trace?.requestId || createRequestId();

  nextHeaders.set(LOG_HEADER_REQUEST_ID, requestId);
  nextHeaders.set(LOG_HEADER_TRACE_ORIGIN, source);

  if (trace?.actionId) {
    nextHeaders.set(LOG_HEADER_ACTION_ID, trace.actionId);
  }

  if (trace?.sessionId) {
    nextHeaders.set(LOG_HEADER_SESSION_ID, trace.sessionId);
  }

  return { headers: nextHeaders, requestId };
}

function writeFetchLog(
  level: 'info' | 'warn' | 'error',
  source: 'client' | 'next-api',
  event: string,
  context: LogContext,
  trace: TraceContext,
) {
  if (source === 'client') {
    logClientEvent(level, event, {
      ...context,
      requestId: trace.requestId,
      actionId: trace.actionId,
    }, { sendToServer: true });
    return;
  }

  logServerEvent(level, 'next-api', event, context, trace);
}

export async function loggedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: LoggedFetchOptions,
) {
  const source = options.source ?? (typeof window === 'undefined' ? 'next-api' : 'client');
  const method = (init.method || 'GET').toUpperCase();
  const startedAt = Date.now();
  const url = requestUrl(input);
  const { headers, requestId } = buildHeaders(init.headers, options.trace, source);
  const trace = {
    ...options.trace,
    requestId,
  };
  const baseContext = {
    requestName: options.name,
    method,
    target: sanitizeUrlForLogs(url),
    ...options.context,
  };

  writeFetchLog('info', source, 'http.request.started', baseContext, trace);

  try {
    const response = await fetch(input, {
      ...init,
      headers,
    });

    writeFetchLog(response.ok ? 'info' : 'warn', source, 'http.request.completed', {
      ...baseContext,
      status: response.status,
      durationMs: Date.now() - startedAt,
    }, trace);

    return response;
  } catch (error) {
    writeFetchLog('error', source, 'http.request.failed', {
      ...baseContext,
      durationMs: Date.now() - startedAt,
      error: serializeError(error),
    }, trace);
    throw error;
  }
}
