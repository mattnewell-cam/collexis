import { NextResponse } from 'next/server';
import { logServerEvent } from '@/lib/logging/server';
import { createRequestId, sanitizeLogContext, type LogContext, type LogLevel } from '@/lib/logging/shared';

type ClientLogPayload = {
  level?: unknown;
  event?: unknown;
  sessionId?: unknown;
  actionId?: unknown;
  context?: unknown;
};

function normalizeLevel(value: unknown): LogLevel {
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
}

function normalizeContext(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return sanitizeLogContext(value as LogContext);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as ClientLogPayload | null;
  if (!payload || typeof payload.event !== 'string') {
    return NextResponse.json({ error: 'A valid client log payload is required.' }, { status: 400 });
  }

  logServerEvent(
    normalizeLevel(payload.level),
    'client',
    payload.event,
    normalizeContext(payload.context),
    {
      requestId: request.headers.get('x-request-id') || createRequestId(),
      actionId: typeof payload.actionId === 'string' ? payload.actionId : undefined,
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    },
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}

