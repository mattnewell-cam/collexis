'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

type Mode = 'signin' | 'signup' | 'forgot';

const featurePoints = [
  'Track outstanding and paid jobs from one console.',
  'Keep company details together with each operator account.',
  'Get new team members into the workspace with a simple email and password flow.',
];

export default function AuthLanding() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const submitLabel = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (mode === 'forgot') {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.');
        return;
      }
      setResetSent(true);
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords need to match before you continue.');
      return;
    }

    const result = await (mode === 'signin'
      ? signIn({ email, password })
      : signUp({ email, password }));

    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }

    window.location.replace(mode === 'signin' ? '/console' : '/onboarding');
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f9fffe_0%,#f3f8fb_100%)]">
      <div
        className="pointer-events-none absolute right-[-12rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(42,191,170,0.18) 0%, transparent 68%)' }}
      />
      <div
        className="pointer-events-none absolute bottom-[-10rem] left-[-10rem] h-[24rem] w-[24rem] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(30,155,184,0.16) 0%, transparent 70%)' }}
      />

      <div className="relative mx-auto grid min-h-screen max-w-6xl gap-12 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-10">
        <section className="flex flex-col justify-center">
          <span className="inline-flex w-fit rounded-full border border-teal-200 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 shadow-sm">
            Collexis Console
          </span>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl">
            Sign in to manage collections with your team.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Create an account with email and password, then finish a short company profile before entering the console.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {featurePoints.map(point => (
              <div
                key={point}
                className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur"
              >
                <div
                  className="h-9 w-9 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, rgba(42,191,170,0.16), rgba(30,155,184,0.22))' }}
                />
                <p className="mt-4 text-sm leading-6 text-slate-600">{point}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[32px] border border-white/80 bg-white/90 p-7 shadow-[0_32px_90px_-40px_rgba(30,155,184,0.4)] backdrop-blur sm:p-8">
            {mode !== 'forgot' && (
              <div className="flex rounded-2xl bg-slate-100 p-1">
                {([
                  ['signin', 'Sign in'],
                  ['signup', 'Create account'],
                ] as const).map(([value, label]) => {
                  const isActive = mode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => switchMode(value)}
                      className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                        isActive ? 'text-white shadow-sm' : 'text-slate-500'
                      }`}
                      style={isActive ? { background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' } : undefined}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className={mode === 'forgot' ? 'mt-2' : 'mt-8'}>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                {mode === 'forgot' ? 'Reset password' : submitLabel}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {mode === 'signin'
                  ? 'Use your account details to open the collections console.'
                  : mode === 'signup'
                  ? "We'll ask for company details right after account creation."
                  : "Enter your email and we'll send you a reset link."}
              </p>
            </div>

            {mode === 'forgot' && resetSent ? (
              <div className="mt-8 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-800">
                Check your inbox — a reset link is on its way.
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="mt-3 block text-xs font-medium text-teal-700 underline underline-offset-2"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    placeholder="name@company.com"
                  />
                </label>

                {mode !== 'forgot' && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
                    <input
                      type="password"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                      placeholder="At least 8 characters"
                    />
                  </label>
                )}

                {mode === 'signup' ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Confirm password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={event => setConfirmPassword(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                      placeholder="Repeat your password"
                    />
                  </label>
                ) : null}

                {mode === 'signin' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(null); setResetSent(false); }}
                      className="text-xs text-slate-400 hover:text-teal-600 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition hover:opacity-95 active:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
                >
                  {submitLabel}
                </button>

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Back to sign in
                  </button>
                )}
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
