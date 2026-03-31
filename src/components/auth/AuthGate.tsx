'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

interface Props {
  mode: 'public' | 'onboarding' | 'app';
  children: ReactNode;
}

const SplashScreen = ({ title }: { title: string }) => (
  <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fffe_0%,#eef7fb_100%)] px-6">
    <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/90 px-8 py-10 text-center shadow-[0_30px_90px_-40px_rgba(30,155,184,0.45)] backdrop-blur">
      <div
        className="mx-auto h-12 w-12 rounded-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(42,191,170,0.18), rgba(30,155,184,0.24))' }}
      />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Loading your workspace.</p>
    </div>
  </main>
);

export default function AuthGate({ mode, children }: Props) {
  const { user, isLoading } = useAuth();

  let redirectPath: string | null = null;

  if (!isLoading) {
    if (mode === 'public' && user) {
      redirectPath = user.profileCompleted ? '/console' : '/onboarding';
    }

    if (mode === 'onboarding') {
      if (!user) {
        redirectPath = '/';
      } else if (user.profileCompleted) {
        redirectPath = '/console';
      }
    }

    if (mode === 'app') {
      if (!user) {
        redirectPath = '/';
      } else if (!user.profileCompleted) {
        redirectPath = '/onboarding';
      }
    }
  }

  useEffect(() => {
    if (redirectPath) {
      window.location.replace(redirectPath);
    }
  }, [redirectPath]);

  if (isLoading || redirectPath) {
    return <SplashScreen title="Collexis" />;
  }

  return <>{children}</>;
}
