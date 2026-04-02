import { NextResponse } from 'next/server';
import { withRouteLogging } from '@/lib/logging/server';
import { createClient } from '@/lib/supabase/server';

export const GET = withRouteLogging('auth.callback', async (request: Request, _context, log) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/console';

  // On Render (and other reverse proxies), request.url uses the internal host
  // (localhost:10000). Use x-forwarded-host to get the real public origin.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const publicOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // redirectType is set at runtime by the auth-js PKCE flow but not reflected
      // in the @supabase/ssr TypeScript types.
      const redirectType = (data as unknown as { redirectType?: string }).redirectType;
      const destination = redirectType === 'PASSWORD_RECOVERY' ? '/reset-password' : next;
      log.info('auth.callback.succeeded', {
        redirectType: redirectType ?? null,
        destination,
      });
      return NextResponse.redirect(`${publicOrigin}${destination}`);
    }
  }

  log.warn('auth.callback.failed');
  return NextResponse.redirect(`${publicOrigin}/?error=auth_callback`);
});
