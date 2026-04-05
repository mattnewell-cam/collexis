import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logServerEvent } from '@/lib/logging/server';
import { createRequestId, serializeError, type TraceContext } from '@/lib/logging/shared';

interface CreateClientOptions {
  source?: 'next-api' | 'server-component';
  scope?: string;
  trace?: TraceContext;
}

export async function createClient(options: CreateClientOptions = {}) {
  const source = options.source ?? 'next-api';
  const scope = options.scope ?? 'supabase.server_client';
  const cookieStore = await cookies();
  const existingCookies = cookieStore.getAll();
  const trace = {
    requestId: options.trace?.requestId ?? createRequestId(),
    actionId: options.trace?.actionId,
    sessionId: options.trace?.sessionId,
  };

  if (source === 'server-component') {
    logServerEvent('info', source, 'auth.server_client.created', {
      scope,
      cookieCount: existingCookies.length,
      authCookieCount: existingCookies.filter(cookie => cookie.name.startsWith('sb-')).length,
    }, trace);
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
            if (source === 'server-component' && cookiesToSet.length > 0) {
              logServerEvent('info', source, 'auth.server_client.cookies_set', {
                scope,
                cookieWriteCount: cookiesToSet.length,
              }, trace);
            }
          } catch (error) {
            logServerEvent(source === 'server-component' ? 'info' : 'warn', source, 'auth.server_client.cookie_write_skipped', {
              scope,
              cookieWriteCount: cookiesToSet.length,
              reason: source === 'server-component' ? 'server_component_render' : 'cookie_store_write_failed',
              ...(source === 'server-component' ? {} : { error: serializeError(error) }),
            }, trace);
          }
        },
      },
    },
  );
}
