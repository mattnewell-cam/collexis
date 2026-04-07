import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { logServerEvent } from '@/lib/logging/server';
import {
  LOG_HEADER_ACTION_ID,
  LOG_HEADER_REQUEST_ID,
  LOG_HEADER_SESSION_ID,
  LOG_HEADER_TRACE_ORIGIN,
  createRequestId,
  serializeError,
} from '@/lib/logging/shared';

function serializeCookies(request: NextRequest) {
  return request.cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function shouldSkipSessionRefresh(pathname: string) {
  return pathname === '/api/client-logs'
    || pathname === '/backend'
    || pathname.startsWith('/backend/')
    || pathname === '/api/backend'
    || pathname.startsWith('/api/backend/');
}

export async function proxy(request: NextRequest) {
  const startedAt = Date.now();
  const requestHeaders = new Headers(request.headers);
  const trace = {
    requestId: request.headers.get(LOG_HEADER_REQUEST_ID) || createRequestId(),
    actionId: request.headers.get(LOG_HEADER_ACTION_ID) || undefined,
    sessionId: request.headers.get(LOG_HEADER_SESSION_ID) || undefined,
  };
  const authCookieCount = request.cookies.getAll().filter(cookie => cookie.name.startsWith('sb-')).length;
  let cookieWriteCount = 0;

  requestHeaders.set(LOG_HEADER_REQUEST_ID, trace.requestId);
  requestHeaders.set(LOG_HEADER_TRACE_ORIGIN, 'proxy');

  if (shouldSkipSessionRefresh(request.nextUrl.pathname)) {
    logServerEvent('info', 'proxy', 'auth.proxy.session_refresh.skipped', {
      method: request.method,
      path: request.nextUrl.pathname,
      authCookieCount,
      reason: 'path_excluded',
    }, trace);

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set(LOG_HEADER_REQUEST_ID, trace.requestId);
    response.headers.set(LOG_HEADER_TRACE_ORIGIN, 'proxy');
    return response;
  }

  logServerEvent('info', 'proxy', 'auth.proxy.session_refresh.started', {
    method: request.method,
    path: request.nextUrl.pathname,
    authCookieCount,
  }, trace);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookieWriteCount += cookiesToSet.length;
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          requestHeaders.set('cookie', serializeCookies(request));
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    logServerEvent(error ? 'warn' : 'info', 'proxy', 'auth.proxy.session_refresh.completed', {
      method: request.method,
      path: request.nextUrl.pathname,
      durationMs: Date.now() - startedAt,
      authCookieCount,
      cookieWriteCount,
      hasUser: Boolean(user),
      authError: error ? { message: error.message, status: error.status } : undefined,
    }, trace);
  } catch (error) {
    logServerEvent('error', 'proxy', 'auth.proxy.session_refresh.failed', {
      method: request.method,
      path: request.nextUrl.pathname,
      durationMs: Date.now() - startedAt,
      authCookieCount,
      cookieWriteCount,
      error: serializeError(error),
    }, trace);
    throw error;
  }

  supabaseResponse.headers.set(LOG_HEADER_REQUEST_ID, trace.requestId);
  supabaseResponse.headers.set(LOG_HEADER_TRACE_ORIGIN, 'proxy');
  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
