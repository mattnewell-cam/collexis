---
name: password_reset_callback_fix
description: Password reset emails must redirect via the auth callback so Supabase can exchange the recovery code before rendering the reset form.
type: project
date: 2026-04-03
---

Password reset emails should use `/auth/callback?next=/reset-password` as the `redirectTo` target.

If recovery links go straight to `/reset-password`, the page can render and client-side validation can work, but the actual `supabase.auth.updateUser({ password })` call fails because the recovery code was never exchanged into a valid session.

The working production flow is:
1. User requests password reset from the sign-in screen.
2. Email link hits Supabase verify.
3. Supabase redirects to `/auth/callback?code=...&next=/reset-password`.
4. `src/app/auth/callback/route.ts` calls `exchangeCodeForSession(code)`.
5. User lands on `/reset-password` with a valid recovery session and can update the password successfully.
