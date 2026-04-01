import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client that bypasses RLS — use only in server-side webhook handlers.
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local.');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );
}
