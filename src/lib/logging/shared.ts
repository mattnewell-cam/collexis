export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSource = 'client' | 'next-api' | 'backend' | 'server-component' | 'proxy';

export type LogContext = Record<string, unknown>;

export interface TraceContext {
  requestId?: string;
  actionId?: string;
  sessionId?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  event: string;
  requestId?: string;
  actionId?: string;
  sessionId?: string;
  context?: LogContext;
}

export const LOG_HEADER_REQUEST_ID = 'x-request-id';
export const LOG_HEADER_ACTION_ID = 'x-collexis-action-id';
export const LOG_HEADER_SESSION_ID = 'x-collexis-session-id';
export const LOG_HEADER_TRACE_ORIGIN = 'x-collexis-trace-origin';

const SENSITIVE_KEY_PATTERN = /password|token|secret|authorization|cookie|api[-_]?key|text_content|raw_message|transcript|details|body|content/i;
const EMAIL_KEY_PATTERN = /email/i;
const PHONE_KEY_PATTERN = /phone/i;
const MAX_LOG_STRING_LENGTH = 180;
const MAX_LOG_ARRAY_LENGTH = 20;
const MAX_LOG_DEPTH = 4;

function fallbackId() {
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return fallbackId();
}

export function maskEmail(email: string) {
  const trimmed = email.trim();
  const [localPart = '', domain = ''] = trimmed.split('@');

  if (!localPart || !domain) {
    return trimmed ? '[email]' : '';
  }

  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}${'*'.repeat(Math.max(localPart.length - visibleLocal.length, 0))}@${domain}`;
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return phone.trim() ? '[phone]' : '';
  }

  const visibleTail = digits.slice(-4);
  return `${'*'.repeat(Math.max(digits.length - visibleTail.length, 0))}${visibleTail}`;
}

export function summarizeText(value: string) {
  return { length: value.trim().length };
}

export function sanitizeUrlForLogs(url: string) {
  try {
    const parsed = new URL(url, 'http://localhost');
    if (url.startsWith('/')) {
      return parsed.pathname;
    }

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return sanitizeLogContext({
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 6).join('\n'),
    });
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return sanitizeLogContext({ value: error });
}

function sanitizeScalar(value: string, key?: string) {
  if (!value) {
    return value;
  }

  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return `[redacted:${value.length}]`;
  }

  if (key && EMAIL_KEY_PATTERN.test(key)) {
    return maskEmail(value);
  }

  if (key && PHONE_KEY_PATTERN.test(key)) {
    return maskPhone(value);
  }

  if (value.length > MAX_LOG_STRING_LENGTH) {
    return `[string:${value.length}]`;
  }

  return value;
}

function sanitizeValue(value: unknown, key?: string, depth = 0): unknown {
  if (depth > MAX_LOG_DEPTH) {
    return '[truncated]';
  }

  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeScalar(value, key);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof File !== 'undefined' && value instanceof File) {
    return {
      name: value.name,
      size: value.size,
      type: value.type,
    };
  }

  if (Array.isArray(value)) {
    const sanitized = value.slice(0, MAX_LOG_ARRAY_LENGTH).map(item => sanitizeValue(item, key, depth + 1));
    if (value.length > MAX_LOG_ARRAY_LENGTH) {
      sanitized.push(`[+${value.length - MAX_LOG_ARRAY_LENGTH} more]`);
    }
    return sanitized;
  }

  if (isPlainObject(value)) {
    return sanitizeLogContext(value, depth + 1);
  }

  return String(value);
}

export function sanitizeLogContext(context: LogContext | undefined, depth = 0): LogContext | undefined {
  if (!context) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(context).flatMap(([key, value]) => {
    if (value === undefined) {
      return [];
    }

    return [[key, sanitizeValue(value, key, depth)]];
  });

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries);
}
