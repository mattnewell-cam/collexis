import { NextResponse } from 'next/server';
import {
  LOG_HEADER_ACTION_ID,
  LOG_HEADER_REQUEST_ID,
  LOG_HEADER_SESSION_ID,
  LOG_HEADER_TRACE_ORIGIN,
  createRequestId,
  sanitizeLogContext,
  serializeError,
  type LogContext,
  type LogEntry,
  type LogLevel,
  type LogSource,
  type TraceContext,
} from './shared';
import { persistLogEntry } from './persistence';

export interface RequestLogger {
  route: string;
  trace: Required<Pick<TraceContext, 'requestId'>> & TraceContext;
  info: (event: string, context?: LogContext) => void;
  warn: (event: string, context?: LogContext) => void;
  error: (event: string, context?: LogContext) => void;
  complete: (response: Response, context?: LogContext) => Response;
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

function writeServerLog(level: LogLevel, entry: LogEntry) {
  consoleMethod(level)(JSON.stringify(entry));
  void persistLogEntry(entry);
}

export function logServerEvent(
  level: LogLevel,
  source: LogSource,
  event: string,
  context?: LogContext,
  trace?: TraceContext,
) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    event,
    requestId: trace?.requestId,
    actionId: trace?.actionId,
    sessionId: trace?.sessionId,
    context: sanitizeLogContext(context),
  };

  writeServerLog(level, entry);
}

export function createRouteLogger(route: string, request: Request): RequestLogger {
  const startedAt = Date.now();
  const trace = {
    requestId: request.headers.get(LOG_HEADER_REQUEST_ID) || createRequestId(),
    actionId: request.headers.get(LOG_HEADER_ACTION_ID) || undefined,
    sessionId: request.headers.get(LOG_HEADER_SESSION_ID) || undefined,
  };
  const { pathname } = new URL(request.url);
  const baseContext = {
    route,
    method: request.method,
    path: pathname,
  };

  const write = (level: LogLevel, event: string, context?: LogContext) => {
    logServerEvent(level, 'next-api', event, { ...baseContext, ...context }, trace);
  };

  return {
    route,
    trace,
    info(event, context) {
      write('info', event, context);
    },
    warn(event, context) {
      write('warn', event, context);
    },
    error(event, context) {
      write('error', event, context);
    },
    complete(response, context) {
      response.headers.set(LOG_HEADER_REQUEST_ID, trace.requestId);
      response.headers.set(LOG_HEADER_TRACE_ORIGIN, 'next-api');
      write(response.ok ? 'info' : 'warn', `${route}.completed`, {
        status: response.status,
        durationMs: Date.now() - startedAt,
        ...context,
      });
      return response;
    },
  };
}

type RouteHandler<TRequest extends Request, TContext> = (
  request: TRequest,
  context: TContext,
  log: RequestLogger,
) => Promise<Response>;

export function withRouteLogging<TRequest extends Request = Request, TContext = unknown>(
  route: string,
  handler: RouteHandler<TRequest, TContext>,
) {
  return async (request: TRequest, context: TContext) => {
    const log = createRouteLogger(route, request);
    log.info(`${route}.received`);

    try {
      const response = await handler(request, context, log);
      return log.complete(response);
    } catch (error) {
      log.error(`${route}.unhandled_error`, { error: serializeError(error) });
      return log.complete(
        NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 }),
        { outcome: 'unhandled_error' },
      );
    }
  };
}
