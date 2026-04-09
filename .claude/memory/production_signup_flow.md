---
name: production_signup_flow
description: Signup requests can succeed without feedback; show a confirmation state instead of redirecting immediately.
type: project
date: 2026-04-02
---

On 2026-04-02, the production signup flow at `collexis.uk` was confirmed to send confirmation emails successfully, but the auth UI gave no visible indication that anything had been sent. Because the client redirected straight to `/onboarding` after `signUp`, users could get bounced back to `/` and assume signup had failed.

The fix was to treat Supabase signup success without a session as an email-confirmation state and show a success card on the auth screen. Avoid storing credentials in project memory; keep them only in `.env.local` or another intended secrets store.
