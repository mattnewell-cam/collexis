'use client';

import { useState, type FormEvent } from 'react';
import { runClientAction } from '@/lib/logging/client';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords need to match.');
      return;
    }

    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await runClientAction('auth.reset_password', async () =>
      supabase.auth.updateUser({ password }), {
      passwordLength: password.length,
    });
    setBusy(false);

    if (updateError) {
      setError('Could not update your password. The link may have expired - request a new one.');
      return;
    }

    setDone(true);
    setTimeout(() => {
      window.location.replace('/console');
    }, 2000);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f9fffe_0%,#f3f8fb_100%)] px-4">
      <div
        className="pointer-events-none absolute right-[-12rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(42,191,170,0.18) 0%, transparent 68%)' }}
      />
      <div
        className="pointer-events-none absolute bottom-[-10rem] left-[-10rem] h-[24rem] w-[24rem] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(30,155,184,0.16) 0%, transparent 70%)' }}
      />

      <div className="relative w-full max-w-md rounded-[32px] border border-white/80 bg-white/90 p-8 shadow-[0_32px_90px_-40px_rgba(30,155,184,0.4)] backdrop-blur">
        {done ? (
          <div className="text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, rgba(42,191,170,0.16), rgba(30,155,184,0.22))' }}
            >
              <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-950">Password updated</h2>
            <p className="mt-2 text-sm text-slate-500">Taking you to the console...</p>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Set new password</h2>
            <p className="mt-2 text-sm text-slate-500">Choose a password you haven&apos;t used before.</p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  placeholder="At least 8 characters"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  placeholder="Repeat your password"
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition hover:opacity-95 active:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
              >
                {busy ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
