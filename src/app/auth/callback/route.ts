import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
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
      const destination = data.redirectType === 'recovery' ? '/reset-password' : next;
      return NextResponse.redirect(`${publicOrigin}${destination}`);
    }
  }

  return NextResponse.redirect(`${publicOrigin}/?error=auth_callback`);
}
